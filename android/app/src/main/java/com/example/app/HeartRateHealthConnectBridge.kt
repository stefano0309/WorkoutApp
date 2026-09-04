package com.example.app

import android.app.Activity
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
import java.util.ArrayDeque

class HeartRateHealthConnectBridge(private val activity: Activity) {
    companion object {
        private const val PROVIDER = "com.google.android.apps.healthdata"
        private const val PAGE_SIZE = 5000
        private const val MAX_LOOKBACK_DAYS = 365
        private const val MAX_CACHED_SAMPLES = 10_000
        private const val CACHED_SAMPLE_WINDOW_HOURS = 24L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val cacheStore = HealthConnectCacheStore(activity)
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
                val end = java.time.Instant.now()
                val start = end.minus(Duration.ofDays(safeDays.toLong()))
                val recentCutoff = end.minus(Duration.ofHours(CACHED_SAMPLE_WINDOW_HOURS))
                val recentSamples = ArrayDeque<JSONObject>(MAX_CACHED_SAMPLES)

                var token: String? = null
                var min = Long.MAX_VALUE
                var max = Long.MIN_VALUE
                var sum = 0L
                var count = 0L
                var cachedSourceCount = 0L

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

                    response.records.forEach { record ->
                        record.samples.forEach { sample ->
                            val bpm = sample.beatsPerMinute
                            min = min.coerceAtMost(bpm)
                            max = max.coerceAtLeast(bpm)
                            sum += bpm
                            count++

                            if (sample.time >= recentCutoff) {
                                if (recentSamples.size == MAX_CACHED_SAMPLES) recentSamples.removeFirst()
                                recentSamples.addLast(
                                    JSONObject()
                                        .put("time", sample.time.toString())
                                        .put("bpm", bpm),
                                )
                                cachedSourceCount++
                            }
                        }
                    }
                    token = response.pageToken
                } while (!token.isNullOrEmpty())

                val samples = JSONArray()
                recentSamples.forEach(samples::put)
                val avg = if (count > 0L) Math.round(sum.toDouble() / count.toDouble()) else null

                synchronized(HealthConnectCacheLock) {
                    cacheStore.saveHeartRate(
                        samples = samples,
                        sampleCount = count,
                        min = min.takeIf { count > 0L },
                        max = max.takeIf { count > 0L },
                        avg = avg,
                        sourceSampleCount = cachedSourceCount,
                        truncated = cachedSourceCount > recentSamples.size,
                    )
                    cacheStore.clearError()
                    dispatch("health-connect-heart-rate", cacheStore.readSummary())
                }
            } catch (t: Throwable) {
                val error = JSONObject()
                    .put("code", if (t is SecurityException) "permission_denied" else "heart_rate_read_failed")
                    .put("message", t.toString())
                synchronized(HealthConnectCacheLock) {
                    cacheStore.saveError(error.optString("code"), error.optString("message"))
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
