package com.kyoutube.free

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

class ProjectionDubbingService : Service() {
    companion object {
        const val ACTION_START = "com.kyoutube.free.action.START_DUBBING"
        const val ACTION_STOP = "com.kyoutube.free.action.STOP_DUBBING"
        const val ACTION_SUBTITLE = "com.kyoutube.free.action.LIVE_KOREAN_SUBTITLE"
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_RESULT_DATA = "projection_result_data"
        const val EXTRA_DUBBING_MODE = "dubbing_mode"
        const val EXTRA_ENGLISH = "subtitle_english"
        const val EXTRA_KOREAN = "subtitle_korean"
        const val EXTRA_STATUS = "subtitle_status"
        const val MODE_FAST = "fast"
        const val MODE_STABLE = "stable"

        private const val CHANNEL_ID = "k_youtube_live_captions"
        private const val NOTIFICATION_ID = 5205
        private const val SAMPLE_RATE = 16_000
        private const val FAST_MIN_SAMPLES = 24_000
        private const val FAST_MAX_SAMPLES = 32_000
        private const val STABLE_MIN_SAMPLES = 40_000
        private const val STABLE_MAX_SAMPLES = 48_000
        private const val OVERLAP_SAMPLES = 8_000
        private const val TAIL_SILENCE_SAMPLES = 3_200
        private const val SILENCE_ABS_AVERAGE = 70
        private const val TAIL_SILENCE_ABS_AVERAGE = 55

        @Volatile
        private var running = false

        @JvmStatic
        fun isRunning(): Boolean = running
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioQueue = Channel<CapturedChunk>(
        capacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )

    private lateinit var engine: LocalDubbingEngine
    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private var processJob: Job? = null
    private var segmentConfig = SegmentConfig.fast()
    private var lastWaitingStatusAt = 0L

    override fun onCreate() {
        super.onCreate()
        engine = LocalDubbingEngine(applicationContext)
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action != ACTION_START) return START_NOT_STICKY
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            showToast("실시간 한국어 자막은 Android 10 이상에서 지원됩니다.")
            stopSelf()
            return START_NOT_STICKY
        }

        segmentConfig = if (intent.getStringExtra(EXTRA_DUBBING_MODE) == MODE_STABLE) {
            SegmentConfig.stable()
        } else {
            SegmentConfig.fast()
        }

        startProjectionForeground("실시간 한국어 자막 준비 중")
        broadcastStatus("한국어 자막 준비 중...")

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val projectionData = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }

        if (resultCode == 0 || projectionData == null) {
            broadcastStatus("오디오 캡처 승인이 필요합니다.")
            stopSelf()
            return START_NOT_STICKY
        }

        val projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = try {
            projectionManager.getMediaProjection(resultCode, projectionData)
        } catch (t: Throwable) {
            broadcastStatus("오디오 캡처 시작 실패")
            stopSelf()
            return START_NOT_STICKY
        }

        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopSelf()
            }
        }, mainHandler)

        running = true

        scope.launch {
            try {
                engine.prepare { progress, message ->
                    updateNotification("$message · $progress%")
                    broadcastStatus("$message · $progress%")
                }
                updateNotification("${segmentConfig.label} 한국어 자막 동작 중")
                broadcastStatus("준비 완료. 영어 영상을 재생하세요.")
                startAudioPipeline()
            } catch (t: Throwable) {
                val message = t.message ?: "알 수 없는 오류"
                updateNotification("준비 실패: $message")
                broadcastStatus("준비 실패: $message")
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startAudioPipeline() {
        val projection = mediaProjection ?: return
        val config = segmentConfig
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) {
            throw IllegalStateException("오디오 버퍼를 만들 수 없습니다.")
        }

        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .build()

        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()

        val recorder = AudioRecord.Builder()
            .setAudioFormat(format)
            .setBufferSizeInBytes(max(minBuffer * 4, SAMPLE_RATE * 2))
            .setAudioPlaybackCaptureConfig(captureConfig)
            .build()

        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            throw IllegalStateException("영상 소리 캡처 장치를 열 수 없습니다.")
        }

        audioRecord = recorder
        recorder.startRecording()

        captureJob = scope.launch {
            val segmentBuffer = ShortArray(config.maxSamples)
            val readBuffer = ShortArray(4096)
            var segmentPosition = 0

            while (isActive && running) {
                val read = recorder.read(readBuffer, 0, readBuffer.size)
                if (read <= 0) continue

                var sourcePosition = 0
                while (sourcePosition < read) {
                    val copyCount = minOf(read - sourcePosition, segmentBuffer.size - segmentPosition)
                    System.arraycopy(readBuffer, sourcePosition, segmentBuffer, segmentPosition, copyCount)
                    sourcePosition += copyCount
                    segmentPosition += copyCount

                    val reachedMinimum = segmentPosition >= config.minSamples
                    val reachedMaximum = segmentPosition >= config.maxSamples
                    val naturalPause = reachedMinimum && hasTrailingSilence(segmentBuffer, segmentPosition)

                    if (reachedMinimum && (reachedMaximum || naturalPause)) {
                        val currentSegment = segmentBuffer.copyOf(segmentPosition)
                        if (hasSpeechSignal(currentSegment)) {
                            val samples = FloatArray(currentSegment.size)
                            for (i in currentSegment.indices) {
                                samples[i] = currentSegment[i] / 32768.0f
                            }
                            audioQueue.trySend(
                                CapturedChunk(
                                    samples = samples,
                                    capturedAtMillis = SystemClock.elapsedRealtime(),
                                    segmentSeconds = currentSegment.size.toDouble() / SAMPLE_RATE
                                )
                            )
                        } else {
                            val now = SystemClock.elapsedRealtime()
                            if (now - lastWaitingStatusAt > 5_000L) {
                                lastWaitingStatusAt = now
                                broadcastStatus("영어 음성을 기다리는 중...")
                            }
                        }

                        val keep = minOf(config.overlapSamples, segmentPosition)
                        if (keep > 0) {
                            System.arraycopy(
                                segmentBuffer,
                                segmentPosition - keep,
                                segmentBuffer,
                                0,
                                keep
                            )
                        }
                        segmentPosition = keep
                    }
                }
            }
        }

        processJob = scope.launch {
            for (chunk in audioQueue) {
                if (!isActive || !running) break
                try {
                    val result = engine.transcribeAndTranslate(chunk.samples) ?: continue
                    val latencyMs = SystemClock.elapsedRealtime() - chunk.capturedAtMillis
                    updateNotification(
                        "${segmentConfig.label} · ${(latencyMs / 100) / 10.0}s · ${result.korean.take(24)}"
                    )
                    broadcastSubtitle(result.english, result.korean)
                } catch (t: Throwable) {
                    broadcastStatus("자막 변환 재시도 중...")
                }
            }
        }
    }

    private fun hasSpeechSignal(chunk: ShortArray): Boolean {
        if (chunk.isEmpty()) return false
        var sum = 0L
        for (sample in chunk) sum += abs(sample.toInt())
        return (sum / chunk.size) >= SILENCE_ABS_AVERAGE
    }

    private fun hasTrailingSilence(buffer: ShortArray, validLength: Int): Boolean {
        if (validLength <= 0) return true
        val start = max(0, validLength - TAIL_SILENCE_SAMPLES)
        var sum = 0L
        for (i in start until validLength) {
            sum += abs(buffer[i].toInt())
        }
        val count = validLength - start
        return count > 0 && (sum / count) < TAIL_SILENCE_ABS_AVERAGE
    }

    private fun broadcastSubtitle(english: String, korean: String) {
        sendBroadcast(
            Intent(ACTION_SUBTITLE)
                .setPackage(packageName)
                .putExtra(EXTRA_ENGLISH, english)
                .putExtra(EXTRA_KOREAN, korean)
        )
    }

    private fun broadcastStatus(status: String) {
        sendBroadcast(
            Intent(ACTION_SUBTITLE)
                .setPackage(packageName)
                .putExtra(EXTRA_STATUS, status)
        )
    }

    private fun startProjectionForeground(message: String) {
        val notification = buildNotification(message)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(message: String) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(message))
    }

    private fun buildNotification(message: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("K-YouTube 실시간 한국어 자막")
            .setContentText(message)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "K-YouTube 실시간 한국어 자막",
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }
    }

    private fun showToast(message: String) {
        mainHandler.post {
            Toast.makeText(applicationContext, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun stopAudioPipeline() {
        captureJob?.cancel()
        processJob?.cancel()
        captureJob = null
        processJob = null
        try {
            audioRecord?.stop()
        } catch (_: Throwable) {
        }
        audioRecord?.release()
        audioRecord = null
    }

    override fun onDestroy() {
        running = false
        stopAudioPipeline()
        try {
            mediaProjection?.stop()
        } catch (_: Throwable) {
        }
        mediaProjection = null
        runBlocking {
            try {
                engine.close()
            } catch (_: Throwable) {
            }
        }
        scope.cancel()
        stopForeground(STOP_FOREGROUND_REMOVE)
        broadcastStatus("한국어 자막 중지됨")
        super.onDestroy()
    }
}

private data class SegmentConfig(
    val label: String,
    val minSamples: Int,
    val maxSamples: Int,
    val overlapSamples: Int
) {
    companion object {
        fun fast() = SegmentConfig(
            label = "빠른 1.5~2초",
            minSamples = FAST_MIN_SAMPLES,
            maxSamples = FAST_MAX_SAMPLES,
            overlapSamples = OVERLAP_SAMPLES
        )

        fun stable() = SegmentConfig(
            label = "안정 2.5~3초",
            minSamples = STABLE_MIN_SAMPLES,
            maxSamples = STABLE_MAX_SAMPLES,
            overlapSamples = OVERLAP_SAMPLES
        )
    }
}

private data class CapturedChunk(
    val samples: FloatArray,
    val capturedAtMillis: Long,
    val segmentSeconds: Double
)
