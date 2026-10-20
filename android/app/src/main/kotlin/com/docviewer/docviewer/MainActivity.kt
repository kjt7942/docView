package com.docviewer.docviewer

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private companion object {
        const val CHANNEL = "app.docviewer/installer"
        const val INCOMING_CHANNEL = "app.docviewer/incoming"
        const val MAX_KEPT_INCOMING = 10

        // 이름에 확장자가 없을 때 MIME으로 확장자를 복원한다.
        val MIME_EXTENSIONS = mapOf(
            "application/pdf" to "pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xlsx",
            "application/vnd.ms-excel" to "xls",
            "text/csv" to "csv",
            "text/comma-separated-values" to "csv",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "pptx",
            "application/x-hwp" to "hwp",
            "application/haansofthwp" to "hwp",
            "application/vnd.hancom.hwp" to "hwp",
            "text/plain" to "txt",
            "text/markdown" to "md",
            "image/jpeg" to "jpg",
            "image/png" to "png",
            "image/gif" to "gif",
            "image/webp" to "webp",
            "image/bmp" to "bmp",
            "image/x-ms-bmp" to "bmp",
        )
    }

    private var incomingChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // "연결 프로그램"으로 들어온 문서를 Dart에 넘기는 채널.
        incomingChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, INCOMING_CHANNEL).also { channel ->
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "getInitialFile" -> {
                        val launchIntent = intent
                        // 한 번 처리한 인텐트는 다시 처리하지 않도록 비운다.
                        setIntent(Intent(Intent.ACTION_MAIN))
                        resolveIncoming(launchIntent) { result.success(it) }
                    }
                    else -> result.notImplemented()
                }
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "canInstall" -> result.success(canRequestPackageInstalls())
                    "openInstallSettings" -> {
                        startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:$packageName"),
                            ),
                        )
                        result.success(null)
                    }
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        if (path.isNullOrBlank()) {
                            result.error("invalid_args", "APK path is required", null)
                        } else {
                            try {
                                installApk(path)
                                result.success(null)
                            } catch (e: Exception) {
                                result.error("install_failed", e.message, null)
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun canRequestPackageInstalls(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    private fun installApk(path: String) {
        val file = File(path)
        require(file.exists()) { "APK not found: $path" }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // 앱이 이미 떠 있는 상태에서 다른 문서를 "연결 프로그램"으로 열었을 때.
        resolveIncoming(intent) { file ->
            if (file != null) incomingChannel?.invokeMethod("openFile", file)
        }
    }

    /** ACTION_VIEW 인텐트의 문서를 캐시로 복사해 Dart가 쓸 수 있는 경로로 돌려준다. */
    private fun resolveIncoming(source: Intent?, callback: (Map<String, Any?>?) -> Unit) {
        val uri = source?.data
        val fromHistory = (source?.flags ?: 0) and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        if (source?.action != Intent.ACTION_VIEW || uri == null || fromHistory) {
            callback(null)
            return
        }
        val mime = source.type
        // 큰 파일 복사가 UI를 막지 않도록 백그라운드에서 처리한다.
        Thread {
            val file = try {
                copyToCache(uri, mime)
            } catch (e: Exception) {
                null
            }
            runOnUiThread { callback(file) }
        }.start()
    }

    private fun copyToCache(uri: Uri, mime: String?): Map<String, Any?> {
        var queried: String? = null
        if (uri.scheme == "content") {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) queried = cursor.getString(0)
            }
        }
        val rawName: String = queried?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
            ?: "document"
        val cleaned = rawName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        val extension = if (mime != null) MIME_EXTENSIONS[mime] else null
        val name: String = if (!cleaned.contains('.') && extension != null) "$cleaned.$extension" else cleaned

        val root = File(cacheDir, "incoming")
        val dir = File(root, System.currentTimeMillis().toString()).apply { mkdirs() }
        val out = File(dir, name)
        val input = contentResolver.openInputStream(uri) ?: throw IllegalStateException("cannot open $uri")
        input.use { stream -> out.outputStream().use { stream.copyTo(it) } }
        pruneIncoming(root)

        return mapOf("path" to out.absolutePath, "name" to name, "size" to out.length())
    }

    /** 복사본이 쌓이지 않도록 최근 [MAX_KEPT_INCOMING]개만 남긴다. */
    private fun pruneIncoming(root: File) {
        val dirs = root.listFiles { f -> f.isDirectory }?.sortedBy { it.name.toLongOrNull() ?: 0L } ?: return
        dirs.dropLast(MAX_KEPT_INCOMING).forEach { it.deleteRecursively() }
    }
}
