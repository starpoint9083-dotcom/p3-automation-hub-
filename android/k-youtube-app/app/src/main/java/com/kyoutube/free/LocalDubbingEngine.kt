package com.kyoutube.free

import android.content.Context
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import com.whispercpp.whisper.WhisperContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class LocalDubbingEngine(private val context: Context) {
    companion object {
        private const val MODEL_NAME = "ggml-tiny.en-q5_1.bin"
        private const val MODEL_URL =
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin?download=true"
        private const val MIN_VALID_MODEL_BYTES = 30_000_000L
        private const val WARMUP_SAMPLE_COUNT = 16_000
    }

    private var whisper: WhisperContext? = null
    private var translatorReady = false
    private var warmedUp = false

    private val translator: Translator = Translation.getClient(
        TranslatorOptions.Builder()
            .setSourceLanguage(TranslateLanguage.ENGLISH)
            .setTargetLanguage(TranslateLanguage.KOREAN)
            .build()
    )

    suspend fun prepare(onProgress: (Int, String) -> Unit) {
        val model = ensureWhisperModel(onProgress)
        if (whisper == null) {
            onProgress(93, "영어 음성 인식 엔진을 여는 중")
            whisper = withContext(Dispatchers.Default) {
                WhisperContext.createContextFromFile(model.absolutePath)
            }
        }

        if (!translatorReady) {
            onProgress(95, "영어→한국어 번역 모델을 준비하는 중")
            val conditions = DownloadConditions.Builder().build()
            translator.downloadModelIfNeeded(conditions).await()
            translatorReady = true
        }

        if (!warmedUp) {
            onProgress(97, "첫 문장 지연을 줄이기 위해 엔진 예열 중")
            val ctx = whisper ?: throw IllegalStateException("음성 인식 엔진이 준비되지 않았습니다.")
            withContext(Dispatchers.Default) {
                ctx.transcribeData(FloatArray(WARMUP_SAMPLE_COUNT), printTimestamp = false)
            }
            translator.translate("hello").await()
            warmedUp = true
        }

        onProgress(100, "저지연 자동 한국어 음성 준비 완료")
    }

    suspend fun transcribeAndTranslate(samples: FloatArray): DubbingResult? {
        val ctx = whisper ?: return null
        val english = withContext(Dispatchers.Default) {
            ctx.transcribeData(samples, printTimestamp = false)
        }
            .replace("[BLANK_AUDIO]", "", ignoreCase = true)
            .replace(Regex("\\s+"), " ")
            .trim()

        if (english.length < 3) return null

        if (!translatorReady) {
            val conditions = DownloadConditions.Builder().build()
            translator.downloadModelIfNeeded(conditions).await()
            translatorReady = true
        }

        val korean = translator.translate(english).await().trim()
        if (korean.length < 2) return null
        return DubbingResult(english, korean)
    }

    suspend fun close() {
        val current = whisper
        whisper = null
        warmedUp = false
        if (current != null) {
            current.release()
        }
        translator.close()
    }

    private suspend fun ensureWhisperModel(onProgress: (Int, String) -> Unit): File =
        withContext(Dispatchers.IO) {
            val modelDir = File(context.filesDir, "models")
            if (!modelDir.exists() && !modelDir.mkdirs()) {
                throw IllegalStateException("모델 저장 폴더를 만들 수 없습니다.")
            }

            val modelFile = File(modelDir, MODEL_NAME)
            if (modelFile.exists() && modelFile.length() >= MIN_VALID_MODEL_BYTES) {
                onProgress(90, "저장된 영어 음성 인식 모델 사용")
                return@withContext modelFile
            }

            val tempFile = File(modelDir, "$MODEL_NAME.part")
            if (tempFile.exists()) tempFile.delete()

            onProgress(1, "Whisper 경량 모델 다운로드 시작 (약 32MB)")
            val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 30_000
                readTimeout = 120_000
                requestMethod = "GET"
                setRequestProperty("User-Agent", "K-YouTube-Free/0.6")
            }

            try {
                connection.connect()
                if (connection.responseCode !in 200..299) {
                    throw IllegalStateException("모델 다운로드 실패: HTTP ${connection.responseCode}")
                }

                val total = connection.contentLengthLong
                connection.inputStream.use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var downloaded = 0L
                        var lastProgress = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (total > 0) {
                                val progress = ((downloaded * 88L) / total).toInt().coerceIn(1, 88)
                                if (progress >= lastProgress + 3) {
                                    lastProgress = progress
                                    onProgress(progress, "Whisper 모델 다운로드 ${((downloaded * 100L) / total)}%")
                                }
                            }
                        }
                    }
                }

                if (tempFile.length() < MIN_VALID_MODEL_BYTES) {
                    throw IllegalStateException("받은 음성 인식 모델 파일이 너무 작습니다.")
                }

                if (modelFile.exists()) modelFile.delete()
                if (!tempFile.renameTo(modelFile)) {
                    tempFile.copyTo(modelFile, overwrite = true)
                    tempFile.delete()
                }
                onProgress(90, "Whisper 모델 다운로드 완료")
                modelFile
            } catch (t: Throwable) {
                tempFile.delete()
                throw t
            } finally {
                connection.disconnect()
            }
        }
}

data class DubbingResult(
    val english: String,
    val korean: String
)
