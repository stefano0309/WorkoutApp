package com.example.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.contracts.ExerciseRouteRequestContract
import androidx.health.connect.client.contracts.HealthPermissionsRequestContract
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
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
import kotlin.math.sin
import kotlin.math.sqrt

internal object HealthConnectCacheLock

class HealthConnectBridge(private val activity: Activity) {
    companion object {
        private const val PERMISSION_REQUEST = 7401
        private const val ROUTE_REQUEST = 7402
        private const val MAX_LOOKBACK_DAYS = 365
        private const val MAX_CACHED_ROUTES = 50
        private const val PROVIDER = "com.google.android.apps.healthdata"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val cacheStore = HealthConnectCacheStore(activity)
    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
    )
    @Volatile private var pendingRouteSessionId: String? = null
    @Volatile private var destroyed = false

    private fun status(): Int = HealthConnectClient.getSdkStatus(activity, PROVIDER)
    private fun client(): HealthConnectClient? = if (status() == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(activity, PROVIDER) else null
    private fun reader(hc: HealthConnectClient) = HealthConnectDataReader(hc, ::saveError)

    @JavascriptInterface
    fun requestHealthPermissions() {
        when (status()) {
            HealthConnectClient.SDK_AVAILABLE -> runOnMain {
                try {
                    val intent = HealthPermissionsRequestContract(PROVIDER).createIntent(activity, permissions)
                    activity.startActivityForResult(intent, PERMISSION_REQUEST)
                } catch (t: Throwable) { saveError("permission_screen_failed", t.toString()) }
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> openHealthConnectStore()
            else -> saveError("unsupported", "Health Connect non disponibile su questo dispositivo.")
        }
    }

    @JavascriptInterface
    fun refreshHealthCapabilities() {
        if (destroyed) return
        scope.launch { dispatchToWebView("health-connect-capabilities", loadHealthCapabilities()) }
    }

    @JavascriptInterface
    fun readHealthSummary(): String? = synchronized(HealthConnectCacheLock) {
        cacheStore.readSummary().toString().takeIf { it != "{}" }
    }

    @JavascriptInterface
    fun getHealthCapabilities(): String {
        val result = JSONObject()
        return try {
            val sdk = status()
            result.put("supported", sdk != HealthConnectClient.SDK_UNAVAILABLE)
                .put("available", sdk == HealthConnectClient.SDK_AVAILABLE)
                .put("status", sdk)
                .put("apiLevel", android.os.Build.VERSION.SDK_INT)
                .put("providerPackage", PROVIDER)
                .put("permissionManagement", if (sdk == HealthConnectClient.SDK_AVAILABLE) "health_connect" else "unavailable")
                .put("permissionsState", "unknown")
                .put("readSteps", false).put("readWeight", false).put("readSleep", false)
                .put("readExercise", false).put("readHeartRate", false)
                .put("exerciseRoute", if (sdk == HealthConnectClient.SDK_AVAILABLE) "consent_required" else "unavailable")
                .toString()
        } catch (t: Throwable) { result.put("supported", false).put("error", t.toString()).toString() }
    }

    private suspend fun loadHealthCapabilities(): JSONObject {
        val result = JSONObject()
        return try {
            val sdk = status()
            result.put("supported", sdk != HealthConnectClient.SDK_UNAVAILABLE)
                .put("available", sdk == HealthConnectClient.SDK_AVAILABLE)
                .put("status", sdk).put("apiLevel", android.os.Build.VERSION.SDK_INT).put("providerPackage", PROVIDER)
            if (sdk != HealthConnectClient.SDK_AVAILABLE) {
                return result.put("permissionsState", "unavailable")
                    .put("readSteps", false).put("readWeight", false).put("readSleep", false)
                    .put("readExercise", false).put("readHeartRate", false).put("exerciseRoute", "unavailable")
            }
            val granted = HealthConnectClient.getOrCreate(activity, PROVIDER).permissionController.getGrantedPermissions()
            result.put("permissionsState", "ready")
                .put("readSteps", granted.contains(HealthPermission.getReadPermission(StepsRecord::class)))
                .put("readWeight", granted.contains(HealthPermission.getReadPermission(WeightRecord::class)))
                .put("readSleep", granted.contains(HealthPermission.getReadPermission(SleepSessionRecord::class)))
                .put("readExercise", granted.contains(HealthPermission.getReadPermission(ExerciseSessionRecord::class)))
                .put("readHeartRate", granted.contains(HealthPermission.getReadPermission(HeartRateRecord::class)))
                .put("exerciseRoute", "consent_required")
        } catch (t: Throwable) { result.put("supported", false).put("permissionsState", "error").put("error", t.toString()) }
    }

    @JavascriptInterface
    fun syncHealthConnect() = syncHealthConnectDays(30)

    @JavascriptInterface
    fun syncHealthConnectDays(days: Int) {
        if (destroyed) return
        val safeDays = days.coerceIn(1, MAX_LOOKBACK_DAYS)
        scope.launch {
            try {
                val hc = client() ?: run { saveError(statusCode(), statusMessage()); return@launch }
                val granted = hc.permissionController.getGrantedPermissions()
                if ((permissions - granted).isNotEmpty()) dispatchToWebView("health-connect-permission-state", loadHealthCapabilities())
                val end = Instant.now(); val start = end.minus(Duration.ofDays(safeDays.toLong()))
                val range = androidx.health.connect.client.time.TimeRangeFilter.between(start, end)
                val result = reader(hc).readSummary(range, start, end, cachedSummary()).put("lookbackDays", safeDays)
                persistAndDispatch(result)
            } catch (t: Throwable) { saveError(if (t is SecurityException) "permission_denied" else "sync_failed", t.toString()) }
        }
    }

    @JavascriptInterface
    fun requestExerciseRoute(sessionId: String?) {
        if (destroyed || sessionId.isNullOrBlank()) return
        if (status() != HealthConnectClient.SDK_AVAILABLE) { saveError("route_unavailable", statusMessage()); return }
        synchronized(this) {
            if (pendingRouteSessionId != null) { saveError("route_request_in_progress", "Una richiesta ExerciseRoute è già in corso."); return }
            pendingRouteSessionId = sessionId.trim()
        }
        runOnMain {
            try {
                val intent = ExerciseRouteRequestContract().createIntent(activity, sessionId.trim())
                activity.startActivityForResult(intent, ROUTE_REQUEST)
            } catch (t: Throwable) { synchronized(this) { pendingRouteSessionId = null }; saveError("route_request_failed", t.toString()) }
        }
    }

    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == PERMISSION_REQUEST) {
            val granted = runCatching { HealthPermissionsRequestContract(PROVIDER).parseResult(resultCode, data) }.getOrDefault(emptySet())
            dispatchToWebView("health-connect-permissions", JSONObject().put("grantedCount", granted.size))
            refreshHealthCapabilities()
            if (granted.isNotEmpty()) syncHealthConnectDays(30)
            return
        }
        if (requestCode != ROUTE_REQUEST) return
        val sessionId = synchronized(this) { val current = pendingRouteSessionId; pendingRouteSessionId = null; current } ?: return
        runCatching {
            val route = ExerciseRouteRequestContract().parseResult(resultCode, data)
            if (route == null) saveError("route_empty", "Nessun percorso condiviso.")
            else {
                val json = serializeRoute(route).put("sessionId", sessionId).put("receivedAt", Instant.now().toString())
                cacheRoute(sessionId, json); dispatchToWebView("health-connect-route", json)
            }
        }.onFailure { saveError("route_import_failed", it.toString()) }
    }

    @JavascriptInterface
    fun readExerciseRoute(sessionId: String?): String? = synchronized(HealthConnectCacheLock) {
        if (sessionId.isNullOrBlank()) null else cacheStore.readRoute(sessionId)?.toString()
    }

    @JavascriptInterface
    fun readLastError(): String? = synchronized(HealthConnectCacheLock) { cacheStore.readLastError()?.toString() }

    private fun serializeRoute(route: androidx.health.connect.client.records.ExerciseRoute): JSONObject {
        val points = JSONArray()
        route.route.forEach { location ->
            points.put(JSONObject().put("time", location.time.toString()).put("lat", location.latitude).put("lon", location.longitude).apply {
                location.altitude?.let { put("altitudeM", it.inMeters) }
                location.horizontalAccuracy?.let { put("horizontalAccuracyM", it.inMeters) }
                location.verticalAccuracy?.let { put("verticalAccuracyM", it.inMeters) }
            })
        }
        return JSONObject().put("points", points).put("pointCount", route.route.size)
            .put("distanceKm", calculateDistanceKm(route)).put("elevationGainM", calculateElevationGain(route))
    }

    private fun calculateDistanceKm(route: androidx.health.connect.client.records.ExerciseRoute): Double {
        var meters = 0.0
        for (i in 1 until route.route.size) {
            val a = route.route[i - 1]; val b = route.route[i]
            meters += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude)
        }
        return (meters / 1000.0 * 100.0).toInt() / 100.0
    }

    private fun calculateElevationGain(route: androidx.health.connect.client.records.ExerciseRoute): Double {
        var gain = 0.0; var previous: Double? = null
        route.route.forEach { location ->
            val altitude = location.altitude?.inMeters ?: return@forEach
            if (previous != null && altitude > previous!!) gain += altitude - previous!!
            previous = altitude
        }
        return (gain * 10.0).toInt() / 10.0
    }

    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0; val p1 = Math.toRadians(lat1); val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1); val dl = Math.toRadians(lon2 - lon1)
        val sinDp = sin(dp / 2); val sinDl = sin(dl / 2)
        val a = sinDp * sinDp + cos(p1) * cos(p2) * sinDl * sinDl
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun cachedSummary(): JSONObject = synchronized(HealthConnectCacheLock) { cacheStore.readSummary() }

    private fun cacheRoute(id: String, route: JSONObject) = synchronized(HealthConnectCacheLock) {
        runCatching { cacheStore.writeRoute(id, route); cacheStore.trimRoutes(MAX_CACHED_ROUTES) }
            .onFailure { saveError("route_cache_failed", it.toString()) }
    }

    private fun persistAndDispatch(result: JSONObject) = synchronized(HealthConnectCacheLock) {
        if (destroyed) return@synchronized
        cacheStore.replaceSummary(result); cacheStore.clearLastError(); dispatchToWebView("health-connect-sync", result)
    }

    private fun saveError(code: String, message: String) {
        val error = JSONObject().put("code", code).put("message", message).put("timestamp", Instant.now().toString())
        synchronized(HealthConnectCacheLock) { cacheStore.writeLastError(error) }
        dispatchToWebView("health-connect-error", error)
    }

    private fun statusCode(): String = when (status()) {
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
        HealthConnectClient.SDK_UNAVAILABLE -> "provider_missing"
        else -> "health_connect_unavailable"
    }

    private fun statusMessage(): String = when (status()) {
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "Installa o aggiorna Health Connect dal Play Store."
        else -> "Health Connect non disponibile."
    }

    private fun openHealthConnectStore() {
        runOnMain {
            runCatching {
                val uri = Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")
                val intent = Intent(Intent.ACTION_VIEW).apply { data = uri; setPackage("com.android.vending"); putExtra("overlay", true); putExtra("callerId", activity.packageName) }
                activity.startActivity(intent)
            }.onFailure { saveError("provider_update_failed", it.toString()) }
        }
    }

    private fun dispatchToWebView(event: String, payload: JSONObject) {
        if (destroyed) return
        runOnMain {
            val webView: WebView? = (activity as? MainActivity)?.bridge?.webView
            webView?.evaluateJavascript("(function(){var d=${payload};window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)},{detail:d}));if(window.onNativeHealthConnectEvent){window.onNativeHealthConnectEvent(${JSONObject.quote(event)},d);}})();", null)
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
        synchronized(this) { pendingRouteSessionId = null }
        scope.cancel()
    }
}
