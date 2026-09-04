package com.example.app

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

internal class HealthConnectDataReader(
    private val client: HealthConnectClient,
    private val onReadError: (String, Throwable) -> Unit,
) {
    companion object { private const val PAGE_SIZE = 5000 }

    suspend fun readSummary(range: TimeRangeFilter, start: Instant, end: Instant, base: JSONObject = JSONObject()): JSONObject {
        val granted = client.permissionController.getGrantedPermissions()
        val result = base.put("importedAt", end.toString()).put("source", "Health Connect")
        if (granted.contains(HealthPermission.getReadPermission(StepsRecord::class))) runCatching {
            val aggregate = client.aggregate(AggregateRequest(metrics = setOf(StepsRecord.COUNT_TOTAL), timeRangeFilter = range))
            result.put("steps", aggregate[StepsRecord.COUNT_TOTAL] ?: 0L)
        }.onFailure { onReadError("steps_read_failed", it) }
        if (granted.contains(HealthPermission.getReadPermission(WeightRecord::class))) runCatching {
            val weights = readAll(WeightRecord::class, range)
            if (weights.isNotEmpty()) result.put("weightKg", weights.maxBy { it.time }.weight.inKilograms)
        }.onFailure { onReadError("weight_read_failed", it) }
        if (granted.contains(HealthPermission.getReadPermission(SleepSessionRecord::class))) runCatching {
            serializeSleep(result, readAll(SleepSessionRecord::class, range).sortedBy { it.startTime })
        }.onFailure { onReadError("sleep_read_failed", it) }
        if (granted.contains(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) runCatching {
            serializeExercises(result, readAll(ExerciseSessionRecord::class, range).sortedBy { it.startTime })
        }.onFailure { onReadError("exercise_read_failed", it) }
        return result.put("start", start.toString()).put("end", end.toString())
    }

    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(type: KClass<T>, range: TimeRangeFilter): List<T> {
        val records = mutableListOf<T>()
        var token: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(
                recordType = type,
                timeRangeFilter = range,
                dataOriginFilter = emptySet(),
                ascendingOrder = true,
                pageSize = PAGE_SIZE,
                pageToken = token,
            ))
            records += response.records
            token = response.pageToken
        } while (!token.isNullOrEmpty())
        return records
    }

    private fun serializeSleep(result: JSONObject, sleeps: List<SleepSessionRecord>) {
        val array = JSONArray(); var minutes = 0L
        sleeps.forEach { record -> runCatching {
            val item = JSONObject().put("id", record.metadata.id).put("start", record.startTime.toString()).put("end", record.endTime.toString()).put("durationMinutes", Duration.between(record.startTime, record.endTime).toMinutes())
            val stages = JSONArray()
            record.stages.forEach { stage -> stages.put(JSONObject().put("start", stage.startTime.toString()).put("end", stage.endTime.toString()).put("durationMinutes", Duration.between(stage.startTime, stage.endTime).toMinutes()).put("type", stage.stage)) }
            item.put("stages", stages); array.put(item); minutes += Duration.between(record.startTime, record.endTime).toMinutes().coerceAtLeast(0)
        }.onFailure { onReadError("sleep_serialize_failed", it) } }
        result.put("sleepSessions", array).put("sleepMinutes", minutes).put("sleepCount", sleeps.size)
        if (sleeps.isNotEmpty()) result.put("lastSleep", array.optJSONObject(array.length() - 1))
    }

    private fun serializeExercises(result: JSONObject, exercises: List<ExerciseSessionRecord>) {
        val all = JSONArray(); val running = JSONArray()
        exercises.forEach { record -> runCatching {
            val routeStatus = when (record.exerciseRouteResult) {
                is ExerciseRouteResult.Data -> "available"
                is ExerciseRouteResult.ConsentRequired -> "consent_required"
                is ExerciseRouteResult.NoData -> "none"
                else -> "none"
            }
            val json = JSONObject().put("id", record.metadata.id).put("start", record.startTime.toString()).put("end", record.endTime.toString()).put("durationMinutes", Duration.between(record.startTime, record.endTime).toMinutes()).put("exerciseType", record.exerciseType).put("exerciseTypeName", exerciseTypeName(record.exerciseType)).put("hasRoute", routeStatus != "none").put("routeStatus", routeStatus)
            record.title?.let { json.put("title", it) }; record.notes?.let { json.put("notes", it) }; all.put(json)
            if (record.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING || record.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL) running.put(json)
        }.onFailure { onReadError("exercise_serialize_failed", it) } }
        result.put("exerciseSessions", all).put("runningSessions", running).put("exerciseCount", exercises.size)
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
}
