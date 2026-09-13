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
import android.speech.tts.TextToSpeech
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
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_RESULT_DATA = "projection_result_data"

        private const val CHANNEL_ID = "k_youtube_local_dubbing"
        private const val NOTIFICATION_ID = 5205
        private const val SAMPLE_RATE = 16_000
        private const val CHUNK_SECONDS = 6
        private const val SILENCE_ABS_AVERAGE = 110

        @Volatile
        private var running = false

        @JvmStatic
        fun isRunning(): Boolean = running
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioQueue = Channel<FloatArray>(
        capacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )

    private lateinit var engine: LocalDubbingEngine
    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private var processJob: Job? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    override fun onCreate() {
        super.onCreate()
        engine = LocalDubbingEngine(applicationContext)
        createNotificationChannel()
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.KOREAN) ?: TextToSpeech.LANG_NOT_SUPPORTED
                ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
                tts?.setSpeechRate(1.08f)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action != ACTION_START) return START_NOT_STICKY
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            showToast("자동 한국어 음성은 Android 10 이상에서 사용할 수 있습니다.")
            stopSelf()
            return START_NOT_STICKY
        }

        startProjectionForeground("자동 한국어 음성 준비 중")

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val projectionData = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }

        if (resultCode == 0 || projectionData == null) {
            showToast("오디오 캡처 승인이 전달되지 않았습니다.")
            stopSelf()
            return START_NOT_STICKY
        }

        val projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = try {
            projectionManager.getMediaProjection(resultCode, projectionData)
        } catch (t: Throwable) {
            showToast("오디오 캡처를 시작할 수 없습니다: ${t.message ?: "승인 오류"}")
            stopSelf()
            return START_NOT_STICKY
        }

        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopSelf()
            }
        }, mainHandler)

        running = true
        showToast("처음 한 번은 무료 음성인식 모델을 준비합니다. 영상은 잠시 멈춰두면 좋습니다.")

        scope.launch {
            try {
                engine.prepare { progress, message ->
                    updateNotification("$message · $progress%")
                }
                updateNotification("자동 한국어 음성 동작 중")
                showToast("준비 완료. 영어 영상을 재생하세요.")
                startAudioPipeline()
            } catch (t: Throwable) {
                updateNotification("준비 실패: ${t.message ?: "알 수 없는 오류"}")
                showToast("자동 한국어 음성 준비 실패: ${t.message ?: "오류"}")
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startAudioPipeline() {
        val projection = mediaProjection ?: return
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
            throw IllegalStateException("재생 소리 캡처 장치를 열 수 없습니다.")
        }

        audioRecord = recorder
        recorder.startRecording()

        captureJob = scope.launch {
            val chunk = ShortArray(SAMPLE_RATE * CHUNK_SECONDS)
            val readBuffer = ShortArray(4096)
            var chunkPosition = 0

            while (isActive && running) {
                val read = recorder.read(readBuffer, 0, readBuffer.size)
                if (read <= 0) continue

                var sourcePosition = 0
                while (sourcePosition < read) {
                    val copyCount = minOf(read - sourcePosition, chunk.size - chunkPosition)
                    System.arraycopy(readBuffer, sourcePosition, chunk, chunkPosition, copyCount)
                    sourcePosition += copyCount
                    chunkPosition += copyCount

                    if (chunkPosition == chunk.size) {
                        if (hasSpeechSignal(chunk)) {
                            val samples = FloatArray(chunk.size)
                            for (i in chunk.indices) {
                                samples[i] = chunk[i] / 32768.0f
                            }
                            audioQueue.trySend(samples)
                        }
                        chunkPosition = 0
                    }
                }
            }
        }

        processJob = scope.launch {
            for (samples in audioQueue) {
                if (!isActive || !running) break
                try {
                    val result = engine.transcribeAndTranslate(samples) ?: continue
                    updateNotification("${result.english.take(42)} → ${result.korean.take(42)}")
                    speakKorean(result.korean)
                } catch (t: Throwable) {
                    updateNotification("변환 재시도 중: ${t.message ?: "오류"}")
                }
            }
        }
    }

    private fun hasSpeechSignal(chunk: ShortArray): Boolean {
        var sum = 0L
        for (sample in chunk) sum += abs(sample.toInt())
        return (sum / chunk.size) >= SILENCE_ABS_AVERAGE
    }

    private fun speakKorean(text: String) {
        if (!ttsReady || text.isBlank()) return
        mainHandler.post {
            tts?.speak(
                text,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "k-youtube-dub-${System.currentTimeMillis()}"
            )
        }
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
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("K-YouTube 자동 한국어 음성")
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
                    "K-YouTube 자동 한국어 음성",
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
        tts?.stop()
        tts?.shutdown()
        tts = null
        runBlocking {
            try {
                engine.close()
            } catch (_: Throwable) {
            }
        }
        scope.cancel()
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
