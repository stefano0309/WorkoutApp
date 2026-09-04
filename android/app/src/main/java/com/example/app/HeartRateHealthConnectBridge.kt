package com.example.app

import android.app.Activity
import android.content.Context
import android.webkit.JavascriptInterface
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant

class HeartRateHealthConnectBridge(private val activity: Activity) {
    companion object {
        private const val PREFS = "health_connect_cache"
        private const val SUMMARY_KEY = "summary"
        private const val ERROR_KEY = "last_error"
        private const val PROVIDER = "com.google.android.apps.healthdata"
        private const val PAGE_SIZE = 5000
        private const val MAX_LOOKBACK_DAYS = 365
        private const val MAX_CACHED_SAMPLES = 10000
        private const val CACHED_SAMPLE_WINDOW_HOURS = 24L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var destroyed = false

    @JavascriptInterface
    fun syncHeartRate(days: Int) {
        if (destroyed) return
        val safeDays = days.coerceIn(1, MAX_LOOKBACK_DAYS)
        scope.launch {
            try {
                val status = HealthConnectClient.getSdkStatus(activity, PROVIDER)
                if (status != HealthConnectClient.SDK_AVAILABLE) return@launch
                val client = HealthConnectClient.getOrCreate(activity, PROVIDER)
                val end = Instant.now()
                val start = end.minus(Duration.ofDays(safeDays.toLong()))
                val responseRecords = mutableListOf<HeartRateRecord>()
                var token: String? = null
                do {
                    val response = client.readRecords(
                        ReadRecordsRequest(
                            recordType = HeartRateRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            dataOriginFilter = emptySet(),
                            ascendingOrder = true,
                            pageSize = PAGE_SIZE,
                            pageToken = token,
                        ),
                    )
                    responseRecords += response.records
                    token = response.pageToken
                } while (!token.isNullOrEmpty())

                val recentCutoff = end.minus(Duration.ofHours(CACHED_SAMPLE_WINDOW_HOURS))
                val recentSamples = responseRecords
                    .flatMap { record -> record.samples }
                    .filter { sample -> sample.time >= recentCutoff }
                    .takeLast(MAX_CACHED_SAMPLES)

                val samples = JSONArray()
                var min = Long.MAX_VALUE
                var max = Long.MIN_VALUE
                var sum = 0L
                var count = 0
                responseRecords.forEach { record ->
                    record.samples.forEach { sample ->
                        val bpm = sample.beatsPerMinute
                        min = min.coerceAtMost(bpm)
                        max = max.coerceAtLeast(bpm)
                        sum += bpm
                        count++
                    }
                }

                recentSamples.forEach { sample ->
                    samples.put(
                        JSONObject()
                            .put("time", sample.time.toString())
                            .put("bpm", sample.beatsPerMinute),
                    )
                }

                val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                synchronized(HealthConnectCacheLock) {
                    val raw = prefs.getString(SUMMARY_KEY, null)
                    val summary = runCatching {
                        if (raw.isNullOrBlank()) JSONObject() else JSONObject(raw)
                    }.getOrDefault(JSONObject())
                    summary.put("heartRateSamples", samples)
                    summary.put("heartRateSampleCount", count)
                    summary.put("heartRateCachedSampleCount", recentSamples.size)
                    summary.put("heartRateSamplesTruncated", recentSamples.size < count)
                    if (count > 0) {
                        summary.put("heartRateMin", min)
                        summary.put("heartRateMax", max)
                        summary.put("heartRateAvg", Math.round(sum.toDouble() / count.toDouble()))
                    } else {
                        summary.put("heartRateMin", JSONObject.NULL)
                        summary.put("heartRateMax", JSONObject.NULL)
                        summary.put("heartRateAvg", JSONObject.NULL)
                    }
                    prefs.edit().putString(SUMMARY_KEY, summary.toString()).remove(ERROR_KEY).apply()
                    dispatch("health-connect-heart-rate", summary)
                }
            } catch (t: Throwable) {
                val error = JSONObject()
                    .put("code", if (t is SecurityException) "permission_denied" else "heart_rate_read_failed")
                    .put("message", t.toString())
                synchronized(HealthConnectCacheLock) {
                    activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(ERROR_KEY, error.toString())
                        .apply()
                }
                dispatch("health-connect-error", error)
            }
        }
    }

    private fun dispatch(event: String, payload: JSONObject) {
        if (destroyed) return
        activity.runOnUiThread {
            val webView = (activity as? MainActivity)?.bridge?.webView ?: return@runOnUiThread
            webView.evaluateJavascript(
                "(function(){window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)},{detail:${payload}}));})();",
                null,
            )
        }
    }

    fun destroy() {
        destroyed = true
        scope.cancel()
    }
}