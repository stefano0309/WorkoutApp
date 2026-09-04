package com.example.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * Local persistence for Health Connect data.
 *
 * SharedPreferences is intentionally limited to the one-time legacy migration.
 * Operational cache data is stored in SQLite so large JSON payloads do not live
 * in the preferences XML file.
 */
internal class HealthConnectCacheStore(context: Context) {
    private val appContext = context.applicationContext
    private val helper = CacheDbHelper(appContext)

    init {
        migrateLegacyPreferences()
    }

    @Synchronized
    fun readSummary(): JSONObject {
        val db = helper.readableDatabase
        val result = JSONObject()

        db.rawQuery("SELECT key, value FROM summary_meta", null).use { cursor ->
            val keyIndex = cursor.getColumnIndexOrThrow("key")
            val valueIndex = cursor.getColumnIndexOrThrow("value")
            while (cursor.moveToNext()) {
                putJsonValue(result, cursor.getString(keyIndex), cursor.getString(valueIndex))
            }
        }

        val sleep = JSONArray()
        db.rawQuery(
            "SELECT id, start, end, duration_minutes, stages_json FROM sleep_sessions ORDER BY start ASC",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                sleep.put(
                    JSONObject()
                        .put("id", cursor.getString(0))
                        .put("start", cursor.getString(1))
                        .put("end", cursor.getString(2))
                        .put("durationMinutes", cursor.getLong(3))
                        .put("stages", runCatching { JSONArray(cursor.getString(4)) }.getOrDefault(JSONArray())),
                )
            }
        }
        result.put("sleepSessions", sleep)

        val exercises = JSONArray()
        val running = JSONArray()
        db.rawQuery(
            "SELECT id, start, end, duration_minutes, exercise_type, exercise_type_name, has_route, route_status, title, notes FROM exercise_sessions ORDER BY start ASC",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val item = JSONObject()
                    .put("id", cursor.getString(0))
                    .put("start", cursor.getString(1))
                    .put("end", cursor.getString(2))
                    .put("durationMinutes", cursor.getLong(3))
                    .put("exerciseType", cursor.getInt(4))
                    .put("exerciseTypeName", cursor.getString(5))
                    .put("hasRoute", cursor.getInt(6) != 0)
                    .put("routeStatus", cursor.getString(7))
                if (!cursor.isNull(8)) item.put("title", cursor.getString(8))
                if (!cursor.isNull(9)) item.put("notes", cursor.getString(9))
                exercises.put(item)
                if (item.optString("exerciseTypeName").startsWith("running")) running.put(item)
            }
        }
        result.put("exerciseSessions", exercises)
        result.put("runningSessions", running)

        val hrSamples = JSONArray()
        db.rawQuery("SELECT sample_time, bpm FROM heart_rate_samples ORDER BY sample_time ASC", null).use { cursor ->
            while (cursor.moveToNext()) {
                hrSamples.put(
                    JSONObject()
                        .put("time", cursor.getString(0))
                        .put("bpm", cursor.getLong(1)),
                )
            }
        }
        result.put("heartRateSamples", hrSamples)
        result.put("heartRateCachedSampleCount", hrSamples.length())

        return result
    }

    @Synchronized
    fun saveSummary(summary: JSONObject) {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            saveMetaFromSummary(db, summary)
            replaceSleepSessions(db, summary.optJSONArray("sleepSessions"))
            replaceExerciseSessions(db, summary.optJSONArray("exerciseSessions"))
            if (summary.has("heartRateSamples")) {
                replaceHeartRateSamples(db, summary.optJSONArray("heartRateSamples"))
                saveHeartRateMeta(db, summary)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun saveHeartRate(
        samples: JSONArray,
        sampleCount: Long,
        min: Long?,
        max: Long?,
        avg: Long?,
        sourceSampleCount: Long,
        truncated: Boolean,
    ) {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            replaceHeartRateSamples(db, samples)
            putMeta(db, "heartRateSampleCount", sampleCount.toString())
            putMeta(db, "heartRateCachedSampleCount", samples.length().toString())
            putMeta(db, "heartRateCachedSourceSampleCount", sourceSampleCount.toString())
            putMeta(db, "heartRateSamplesTruncated", truncated.toString())
            putMeta(db, "heartRateMin", min?.toString())
            putMeta(db, "heartRateMax", max?.toString())
            putMeta(db, "heartRateAvg", avg?.toString())
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun saveRoute(sessionId: String, route: JSONObject) {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            db.execSQL(
                "INSERT OR REPLACE INTO exercise_routes(session_id, payload, received_at) VALUES(?, ?, ?)",
                arrayOf(sessionId, route.toString(), route.optString("receivedAt", Instant.now().toString())),
            )
            db.execSQL(
                "DELETE FROM exercise_routes WHERE session_id NOT IN (SELECT session_id FROM exercise_routes ORDER BY received_at DESC LIMIT 50)",
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun readRoute(sessionId: String): String? {
        helper.readableDatabase.rawQuery(
            "SELECT payload FROM exercise_routes WHERE session_id = ?",
            arrayOf(sessionId),
        ).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }

    @Synchronized
    fun saveError(code: String, message: String) {
        helper.writableDatabase.execSQL(
            "INSERT OR REPLACE INTO last_error(id, code, message, timestamp) VALUES(1, ?, ?, ?)",
            arrayOf(code, message, Instant.now().toString()),
        )
    }

    @Synchronized
    fun readError(): String? {
        helper.readableDatabase.rawQuery(
            "SELECT code, message, timestamp FROM last_error WHERE id = 1",
            null,
        ).use { cursor ->
            if (!cursor.moveToFirst()) return null
            return JSONObject()
                .put("code", cursor.getString(0))
                .put("message", cursor.getString(1))
                .put("timestamp", cursor.getString(2))
                .toString()
        }
    }

    @Synchronized
    fun clearError() {
        helper.writableDatabase.delete("last_error", "id = 1", null)
    }

    // Compatibility API used by HealthConnectBridge.
    fun readLastError(): String? = readError()

    fun writeRoute(sessionId: String, route: JSONObject) = saveRoute(sessionId, route)

    @Synchronized
    fun trimRoutes(limit: Int) {
        val safeLimit = limit.coerceAtLeast(1)
        helper.writableDatabase.execSQL(
            "DELETE FROM exercise_routes WHERE session_id NOT IN (SELECT session_id FROM exercise_routes ORDER BY received_at DESC LIMIT ?)",
            arrayOf(safeLimit),
        )
    }

    fun replaceSummary(summary: JSONObject) = saveSummary(summary)

    fun clearLastError() = clearError()

    fun writeLastError(error: JSONObject) {
        saveError(error.optString("code"), error.optString("message"))
    }

    private fun saveMetaFromSummary(db: SQLiteDatabase, summary: JSONObject) {
        val keys = arrayOf(
            "importedAt", "source", "lookbackDays", "start", "end", "steps",
            "weightKg", "sleepMinutes", "sleepCount", "exerciseCount",
        )
        keys.forEach { key ->
            if (summary.has(key)) putMeta(db, key, summary.opt(key)?.toString())
        }
    }

    private fun saveHeartRateMeta(db: SQLiteDatabase, summary: JSONObject) {
        putMeta(db, "heartRateSampleCount", summary.opt("heartRateSampleCount")?.toString())
        putMeta(db, "heartRateCachedSampleCount", summary.opt("heartRateCachedSampleCount")?.toString())
        putMeta(db, "heartRateCachedSourceSampleCount", summary.opt("heartRateCachedSourceSampleCount")?.toString())
        putMeta(db, "heartRateSamplesTruncated", summary.opt("heartRateSamplesTruncated")?.toString())
        putMeta(db, "heartRateMin", summary.opt("heartRateMin")?.toString())
        putMeta(db, "heartRateMax", summary.opt("heartRateMax")?.toString())
        putMeta(db, "heartRateAvg", summary.opt("heartRateAvg")?.toString())
    }

    private fun replaceSleepSessions(db: SQLiteDatabase, array: JSONArray?) {
        db.delete("sleep_sessions", null, null)
        if (array == null) return
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            db.execSQL(
                "INSERT OR REPLACE INTO sleep_sessions(id, start, end, duration_minutes, stages_json) VALUES(?, ?, ?, ?, ?)",
                arrayOf(
                    item.optString("id"),
                    item.optString("start"),
                    item.optString("end"),
                    item.optLong("durationMinutes"),
                    item.optJSONArray("stages")?.toString() ?: "[]",
                ),
            )
        }
    }

    private fun replaceExerciseSessions(db: SQLiteDatabase, array: JSONArray?) {
        db.delete("exercise_sessions", null, null)
        if (array == null) return
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            db.execSQL(
                "INSERT OR REPLACE INTO exercise_sessions(id, start, end, duration_minutes, exercise_type, exercise_type_name, has_route, route_status, title, notes) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                arrayOf<Any?>(
                    item.optString("id"),
                    item.optString("start"),
                    item.optString("end"),
                    item.optLong("durationMinutes"),
                    item.optInt("exerciseType"),
                    item.optString("exerciseTypeName"),
                    if (item.optBoolean("hasRoute")) 1 else 0,
                    item.optString("routeStatus"),
                    if (item.has("title")) item.optString("title") else null,
                    if (item.has("notes")) item.optString("notes") else null,
                ),
            )
        }
    }

    private fun replaceHeartRateSamples(db: SQLiteDatabase, array: JSONArray?) {
        db.delete("heart_rate_samples", null, null)
        if (array == null) return
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            db.execSQL(
                "INSERT INTO heart_rate_samples(sample_time, bpm) VALUES(?, ?)",
                arrayOf(item.optString("time"), item.optLong("bpm")),
            )
        }
    }

    private fun migrateLegacyPreferences() {
        val prefs = appContext.getSharedPreferences("health_connect_cache", Context.MODE_PRIVATE)
        val rawSummary = prefs.getString("summary", null)
        val rawRoutes = prefs.getString("routes", null)
        val rawError = prefs.getString("last_error", null)
        if (rawSummary.isNullOrBlank() && rawRoutes.isNullOrBlank() && rawError.isNullOrBlank()) return

        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            if (!rawSummary.isNullOrBlank()) {
                runCatching {
                    val summary = JSONObject(rawSummary)
                    saveMetaFromSummary(db, summary)
                    replaceSleepSessions(db, summary.optJSONArray("sleepSessions"))
                    replaceExerciseSessions(db, summary.optJSONArray("exerciseSessions"))
                    val samples = summary.optJSONArray("heartRateSamples")
                    if (samples != null) replaceHeartRateSamples(db, samples)
                    if (summary.has("heartRateSampleCount")) saveHeartRateMeta(db, summary)
                }
            }

            if (!rawRoutes.isNullOrBlank()) {
                runCatching {
                    val routes = JSONObject(rawRoutes)
                    val iterator = routes.keys()
                    while (iterator.hasNext()) {
                        val sessionId = iterator.next()
                        routes.optJSONObject(sessionId)?.let { route ->
                            db.execSQL(
                                "INSERT OR REPLACE INTO exercise_routes(session_id, payload, received_at) VALUES(?, ?, ?)",
                                arrayOf(sessionId, route.toString(), route.optString("receivedAt", Instant.now().toString())),
                            )
                        }
                    }
                }
            }

            if (!rawError.isNullOrBlank()) {
                runCatching {
                    val error = JSONObject(rawError)
                    db.execSQL(
                        "INSERT OR REPLACE INTO last_error(id, code, message, timestamp) VALUES(1, ?, ?, ?)",
                        arrayOf(
                            error.optString("code"),
                            error.optString("message"),
                            error.optString("timestamp", Instant.now().toString()),
                        ),
                    )
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        prefs.edit().clear().apply()
    }

    private fun putMeta(db: SQLiteDatabase, key: String, value: String?) {
        if (value == null || value == "null") {
            db.delete("summary_meta", "key = ?", arrayOf(key))
            return
        }
        db.execSQL(
            "INSERT OR REPLACE INTO summary_meta(key, value) VALUES(?, ?)",
            arrayOf(key, value),
        )
    }

    private fun putJsonValue(result: JSONObject, key: String, raw: String) {
        when (raw) {
            "true", "false" -> result.put(key, raw.toBoolean())
            "null" -> result.put(key, JSONObject.NULL)
            else -> {
                val value: Any = raw.toDoubleOrNull() ?: raw.toLongOrNull() ?: raw
                result.put(key, value)
            }
        }
    }

    private class CacheDbHelper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE summary_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execSQL("CREATE TABLE sleep_sessions(id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL, duration_minutes INTEGER NOT NULL, stages_json TEXT NOT NULL)")
            db.execSQL("CREATE TABLE exercise_sessions(id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL, duration_minutes INTEGER NOT NULL, exercise_type INTEGER NOT NULL, exercise_type_name TEXT NOT NULL, has_route INTEGER NOT NULL, route_status TEXT NOT NULL, title TEXT, notes TEXT)")
            db.execSQL("CREATE TABLE heart_rate_samples(id INTEGER PRIMARY KEY AUTOINCREMENT, sample_time TEXT NOT NULL, bpm INTEGER NOT NULL)")
            db.execSQL("CREATE INDEX idx_heart_rate_samples_time ON heart_rate_samples(sample_time)")
            db.execSQL("CREATE TABLE exercise_routes(session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, received_at TEXT NOT NULL)")
            db.execSQL("CREATE TABLE last_error(id INTEGER PRIMARY KEY CHECK(id = 1), code TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if (oldVersion < 2) {
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_heart_rate_samples_time ON heart_rate_samples(sample_time)")
            }
        }

        companion object {
            private const val DB_NAME = "health_connect_cache.db"
            private const val DB_VERSION = 2
        }
    }
}
