package com.example.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.contracts.ExerciseRouteRequestContract
import androidx.health.connect.client.contracts.HealthPermissionsRequestContract
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
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
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.reflect.KClass

class HealthConnectBridge(private val activity: Activity) {
    companion object {
        private const val PREFS = "health_connect_cache"
        private const val SUMMARY_KEY = "summary"
        private const val ROUTES_KEY = "routes"
        private const val ERROR_KEY = "last_error"
        private const val PERMISSION_REQUEST = 7401
        private const val ROUTE_REQUEST = 7402
        private const val MAX_LOOKBACK_DAYS = 365
        private const val PAGE_SIZE = 5000
        private const val PROVIDER = "com.google.android.apps.healthdata"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pendingRouteSessionId: String? = null
    @Volatile private var destroyed = false

    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
    )

    private fun status(): Int = HealthConnectClient.getSdkStatus(activity, PROVIDER)

    private fun client(): HealthConnectClient? = when (status()) {
        HealthConnectClient.SDK_AVAILABLE -> HealthConnectClient.getOrCreate(activity, PROVIDER)
        else -> null
    }

    @JavascriptInterface
    fun requestHealthPermissions() {
        when (status()) {
            HealthConnectClient.SDK_AVAILABLE -> runOnMain {
                try {
                    val intent = HealthPermissionsRequestContract(PROVIDER).createIntent(activity, permissions)
                    activity.startActivityForResult(intent, PERMISSION_REQUEST)
                } catch (t: Throwable) {
                    saveError("permission_screen_failed", t.toString())
                }
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> openHealthConnectStore()
            else -> saveError("unsupported", "Health Connect non disponibile su questo dispositivo.")
        }
    }

    @JavascriptInterface
    fun readHealthSummary(): String? = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null)

    @JavascriptInterface
    fun getHealthCapabilities(): String {
        val result = JSONObject()
        try {
            val sdk = status()
            result.put("supported", sdk != HealthConnectClient.SDK_UNAVAILABLE)
            result.put("available", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("status", sdk)
            result.put("apiLevel", android.os.Build.VERSION.SDK_INT)
            result.put("providerPackage", PROVIDER)
            result.put("permissionManagement", if (sdk == HealthConnectClient.SDK_AVAILABLE) "health_connect" else "unavailable")
            result.put("readSteps", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("readWeight", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("readSleep", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("readExercise", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("readHeartRate", sdk == HealthConnectClient.SDK_AVAILABLE)
            result.put("exerciseRoute", if (sdk == HealthConnectClient.SDK_AVAILABLE) "consent_required" else "unavailable")
        } catch (t: Throwable) {
            result.put("supported", false)
            result.put("error", t.toString())
        }
        return result.toString()
    }

    @JavascriptInterface
    fun syncHealthConnect() = syncHealthConnectDays(30)

    @JavascriptInterface
    fun syncHealthConnectDays(days: Int) {
        if (destroyed) return
        val safeDays = days.coerceIn(1, MAX_LOOKBACK_DAYS)
        scope.launch {
            try {
                val hc = client() ?: run {
                    saveError(statusCode(), statusMessage())
                    return@launch
                }
                val end = Instant.now()
                val start = end.minus(Duration.ofDays(safeDays.toLong()))
                val range = TimeRangeFilter.between(start, end)
                val result = cachedSummary().apply {
                    put("importedAt", end.toString())
                    put("source", "Health Connect")
                    put("lookbackDays", safeDays)
                    put("start", start.toString())
                    put("end", end.toString())
                }

                runCatching {
                    val aggregate = hc.aggregate(
                        AggregateRequest(
                            metrics = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = range,
                        ),
                    )
                    result.put("steps", aggregate[StepsRecord.COUNT_TOTAL] ?: 0L)
                }.onFailure { saveError("steps_read_failed", it.toString()) }

                runCatching {
                    val weights = readAll(hc, WeightRecord::class, range)
                    if (weights.isNotEmpty()) {
                        result.put("weightKg", weights.maxBy { it.time }.weight.inKilograms)
                    }
                }.onFailure { saveError("weight_read_failed", it.toString()) }

                runCatching {
                    val sleeps = readAll(hc, SleepSessionRecord::class, range).sortedBy { it.startTime }
                    serializeSleep(result, sleeps)
                }.onFailure { saveError("sleep_read_failed", it.toString()) }

                runCatching {
                    val exercises = readAll(hc, ExerciseSessionRecord::class, range).sortedBy { it.startTime }
                    serializeExercises(result, exercises)
                }.onFailure { saveError("exercise_read_failed", it.toString()) }

                persistAndDispatch(result)
            } catch (t: Throwable) {
                saveError(if (t is SecurityException) "permission_denied" else "sync_failed", t.toString())
            }
        }
    }

    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(
        hc: HealthConnectClient,
        type: KClass<T>,
        range: TimeRangeFilter,
    ): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val response = hc.readRecords(
                ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = range,
                    dataOriginFilter = emptySet(),
                    ascendingOrder = true,
                    pageSize = PAGE_SIZE,
                    pageToken = token,
                ),
            )
            out += response.records
            token = response.pageToken
        } while (!token.isNullOrEmpty())
        return out
    }

    private fun serializeSleep(result: JSONObject, sleeps: List<SleepSessionRecord>) {
        val array = JSONArray()
        var minutes = 0L
        sleeps.forEach { record ->
            runCatching {
                val item = JSONObject()
                    .put("id", record.metadata.id)
                    .put("start", record.startTime.toString())
                    .put("end", record.endTime.toString())
                    .put("durationMinutes", Duration.between(record.startTime, record.endTime).toMinutes())
                val stages = JSONArray()
                record.stages.forEach { stage ->
                    stages.put(
                        JSONObject()
                            .put("start", stage.startTime.toString())
                            .put("end", stage.endTime.toString())
                            .put("durationMinutes", Duration.between(stage.startTime, stage.endTime).toMinutes())
                            .put("type", stage.stage),
                    )
                }
                item.put("stages", stages)
                array.put(item)
                minutes += Duration.between(record.startTime, record.endTime).toMinutes().coerceAtLeast(0)
            }.onFailure { saveError("sleep_serialize_failed", it.toString()) }
        }
        result.put("sleepSessions", array)
        result.put("sleepMinutes", minutes)
        result.put("sleepCount", sleeps.size)
        if (sleeps.isNotEmpty()) result.put("lastSleep", array.optJSONObject(array.length() - 1))
    }

    private fun serializeExercises(result: JSONObject, exercises: List<ExerciseSessionRecord>) {
        val all = JSONArray()
        val running = JSONArray()
        exercises.forEach { record ->
            runCatching {
                val routeStatus = when (record.exerciseRouteResult) {
                    is ExerciseRouteResult.Data -> "available"
                    is ExerciseRouteResult.ConsentRequired -> "consent_required"
                    is ExerciseRouteResult.NoData -> "none"
                    else -> "none"
                }
                val json = JSONObject()
                    .put("id", record.metadata.id)
                    .put("start", record.startTime.toString())
                    .put("end", record.endTime.toString())
                    .put("durationMinutes", Duration.between(record.startTime, record.endTime).toMinutes())
                    .put("exerciseType", record.exerciseType)
                    .put("exerciseTypeName", exerciseTypeName(record.exerciseType))
                    .put("hasRoute", routeStatus != "none")
                    .put("routeStatus", routeStatus)
                record.title?.let { json.put("title", it) }
                record.notes?.let { json.put("notes", it) }
                all.put(json)
                if (record.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING || record.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL) {
                    running.put(json)
                }
            }.onFailure { saveError("exercise_serialize_failed", it.toString()) }
        }
        result.put("exerciseSessions", all)
        result.put("runningSessions", running)
        result.put("exerciseCount", exercises.size)
    }

    @JavascriptInterface
    fun requestExerciseRoute(sessionId: String?) {
        if (destroyed || sessionId.isNullOrBlank()) return
        if (status() != HealthConnectClient.SDK_AVAILABLE) {
            saveError("route_unavailable", statusMessage())
            return
        }
        pendingRouteSessionId = sessionId.trim()
        runOnMain {
            try {
                val intent = ExerciseRouteRequestContract().createIntent(activity, pendingRouteSessionId!!)
                activity.startActivityForResult(intent, ROUTE_REQUEST)
            } catch (t: Throwable) {
                pendingRouteSessionId = null
                saveError("route_request_failed", t.toString())
            }
        }
    }

    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == PERMISSION_REQUEST) {
            val granted = runCatching {
                HealthPermissionsRequestContract(PROVIDER).parseResult(resultCode, data)
            }.getOrDefault(emptySet())
            val payload = JSONObject().put("grantedCount", granted.size)
            dispatchToWebView("health-connect-permissions", payload)
            if (granted.isNotEmpty()) syncHealthConnectDays(30)
            return
        }
        if (requestCode != ROUTE_REQUEST) return
        val sessionId = pendingRouteSessionId
        pendingRouteSessionId = null
        if (sessionId == null) return
        runCatching {
            val route = ExerciseRouteRequestContract().parseResult(resultCode, data)
            if (route == null) {
                saveError("route_empty", "Nessun percorso condiviso.")
            } else {
                val json = serializeRoute(route)
                    .put("sessionId", sessionId)
                    .put("receivedAt", Instant.now().toString())
                cacheRoute(sessionId, json)
                dispatchToWebView("health-connect-route", json)
            }
        }.onFailure { saveError("route_import_failed", it.toString()) }
    }

    private fun serializeRoute(route: androidx.health.connect.client.records.ExerciseRoute): JSONObject {
        val points = JSONArray()
        route.route.forEach { location ->
            points.put(
                JSONObject()
                    .put("time", location.time.toString())
                    .put("lat", location.latitude)
                    .put("lon", location.longitude)
                    .apply {
                        location.altitude?.let { put("altitudeM", it.inMeters) }
                        location.horizontalAccuracy?.let { put("horizontalAccuracyM", it.inMeters) }
                        location.verticalAccuracy?.let { put("verticalAccuracyM", it.inMeters) }
                    },
            )
        }
        return JSONObject()
            .put("points", points)
            .put("pointCount", route.route.size)
            .put("distanceKm", calculateDistanceKm(route))
            .put("elevationGainM", calculateElevationGain(route))
    }

    private fun calculateDistanceKm(route: androidx.health.connect.client.records.ExerciseRoute): Double {
        var meters = 0.0
        val p = route.route
        for (i in 1 until p.size) {
            val a = p[i - 1]
            val b = p[i]
            meters += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude)
        }
        return (meters / 1000.0 * 100.0).toInt() / 100.0
    }

    private fun calculateElevationGain(route: androidx.health.connect.client.records.ExerciseRoute): Double {
        var gain = 0.0
        var previous: Double? = null
        route.route.forEach {
            val altitude = it.altitude?.inMeters ?: return@forEach
            if (previous != null && altitude > previous!!) gain += altitude - previous!!
            previous = altitude
        }
        return (gain * 10.0).toInt() / 10.0
    }

    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lon2 - lon1)
        val a = sin(dp / 2).pow(2) + cos(p1) * cos(p2) * sin(dl / 2).pow(2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun exerciseTypeName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running_treadmill"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "biking_stationary"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength_training"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "weightlifting"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "martial_arts"
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "boxing"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        else -> "type_$type"
    }

    private fun cachedSummary(): JSONObject {
        val raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null)
        return runCatching { if (raw.isNullOrBlank()) JSONObject() else JSONObject(raw) }.getOrDefault(JSONObject())
    }

    private fun cacheRoute(id: String, route: JSONObject) {
        runCatching {
            val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(ROUTES_KEY, null)
            val routes = if (raw.isNullOrBlank()) JSONObject() else JSONObject(raw)
            routes.put(id, route)
            prefs.edit().putString(ROUTES_KEY, routes.toString()).apply()
        }.onFailure { saveError("route_cache_failed", it.toString()) }
    }

    @JavascriptInterface
    fun readExerciseRoute(sessionId: String?): String? {
        if (sessionId.isNullOrBlank()) return null
        return runCatching {
            val raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ROUTES_KEY, null) ?: return null
            JSONObject(raw).optJSONObject(sessionId)?.toString()
        }.getOrNull()
    }

    @JavascriptInterface
    fun readLastError(): String? = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ERROR_KEY, null)

    private fun persistAndDispatch(result: JSONObject) {
        if (destroyed) return
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(SUMMARY_KEY, result.toString())
            .remove(ERROR_KEY)
            .apply()
        dispatchToWebView("health-connect-sync", result)
    }

    private fun saveError(code: String, message: String) {
        val error = runCatching {
            JSONObject().put("code", code).put("message", message).put("timestamp", Instant.now().toString())
        }.getOrDefault(JSONObject())
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(ERROR_KEY, error.toString())
            .apply()
        dispatchToWebView("health-connect-error", error)
    }

    private fun statusCode(): String = when (status()) {
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
        HealthConnectClient.SDK_UNAVAILABLE -> "provider_missing"
        else -> "health_connect_unavailable"
    }

    private fun statusMessage(): String = when (status()) {
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "Installa o aggiorna Health Connect dal Play Store."
        HealthConnectClient.SDK_UNAVAILABLE -> "Health Connect non disponibile."
        else -> "Health Connect non disponibile."
    }

    private fun openHealthConnectStore() {
        runOnMain {
            runCatching {
                val uri = Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = uri
                    setPackage("com.android.vending")
                    putExtra("overlay", true)
                    putExtra("callerId", activity.packageName)
                }
                activity.startActivity(intent)
            }.onFailure { saveError("provider_update_failed", it.toString()) }
        }
    }

    private fun dispatchToWebView(event: String, payload: JSONObject) {
        if (destroyed) return
        runOnMain {
            val webView: WebView? = (activity as? MainActivity)?.bridge?.webView
            webView?.evaluateJavascript(
                "(function(){var d=${payload};window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)},{detail:d}));if(window.onNativeHealthConnectEvent){window.onNativeHealthConnectEvent(${JSONObject.quote(event)},d);}})();",
                null,
            )
        }
    }

    private fun runOnMain(block: () -> Unit) {
        try {
            if (activity.isFinishing || activity.isDestroyed) return
            activity.runOnUiThread(block)
        } catch (_: Throwable) { }
    }

    fun destroy() {
        destroyed = true
        pendingRouteSessionId = null
        scope.cancel()
    }
}
