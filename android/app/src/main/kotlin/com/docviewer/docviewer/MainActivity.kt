package com.docviewer.docviewer

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.os.OperationCanceledException
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import android.util.Rational
import androidx.annotation.RequiresApi
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.WindowManager
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private companion object {
        const val CHANNEL = "app.docviewer/installer"
        const val INCOMING_CHANNEL = "app.docviewer/incoming"
        const val SCREEN_CHANNEL = "app.docviewer/screen"
        const val MEDIA_CHANNEL = "app.docviewer/media"
        const val MAX_KEPT_INCOMING = 10
        const val PICK_MEDIA = 4242

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
            "application/x-msexcel" to "xls",
            "text/x-csv" to "csv",
            "application/csv" to "csv",
            "text/x-markdown" to "md",
            "application/hwp" to "hwp",
            "application/x-hwp-v5" to "hwp",
            "image/jpg" to "jpg",
            "text/x-log" to "log",
            "application/msword" to "doc",
            "application/vnd.ms-powerpoint" to "ppt",
            "application/vnd.hancom.hwpx" to "hwpx",
            "application/x-hwpx" to "hwpx",
            "application/haansofthwpx" to "hwpx",
            "application/hwp+zip" to "hwpx",
            "video/mp4" to "mp4",
            "video/x-matroska" to "mkv",
            "video/webm" to "webm",
            "video/avi" to "avi",
            "video/x-msvideo" to "avi",
            "video/quicktime" to "mov",
            "video/3gpp" to "3gp",
            "video/mp2t" to "ts",
            "video/x-ms-wmv" to "wmv",
            "video/x-flv" to "flv",
            "video/mpeg" to "mpg",
            "audio/mpeg" to "mp3",
            "audio/flac" to "flac",
            "audio/x-flac" to "flac",
            "audio/wav" to "wav",
            "audio/x-wav" to "wav",
            "audio/mp4" to "m4a",
            "audio/aac" to "aac",
            "audio/ogg" to "ogg",
            "audio/opus" to "opus",
            "audio/x-ms-wma" to "wma",
        )

        // 동영상·음악은 수 GB일 수 있어 캐시로 복사하지 않고 원본 주소를 그대로 재생한다.
        val MEDIA_EXTENSIONS = setOf(
            "mp4", "m4v", "mkv", "webm", "avi", "mov", "wmv", "asf", "flv", "ts", "m2ts", "mts",
            "tp", "trp", "3gp", "3g2", "mpg", "mpeg", "vob", "ogv", "rm", "rmvb", "divx", "f4v",
            "mp3", "flac", "wav", "m4a", "aac", "ogg", "oga", "opus", "wma", "ape", "alac", "aiff",
            "aif", "amr", "mka", "dsf", "dff", "wv",
        )
    }

    private var incomingChannel: MethodChannel? = null
    private var mediaChannel: MethodChannel? = null
    private var autoPip = false
    private var pipRatio = Rational(16, 9)
    private var pendingPick: MethodChannel.Result? = null
    private val prepareJobs = mutableMapOf<String, CancellationSignal>()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // 읽는 동안 화면이 꺼지지 않게 하는 채널.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SCREEN_CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "keepOn") {
                    if (call.arguments == true) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                    result.success(null)
                } else {
                    result.notImplemented()
                }
            }

        // 동영상 플레이어·이미지 뷰어용: 창 밝기, 공유, 화면 속 화면(PIP).
        mediaChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, MEDIA_CHANNEL).also { channel ->
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "getBrightness" -> {
                        val own = window.attributes.screenBrightness
                        result.success(if (own >= 0f) own.toDouble() else systemBrightness())
                    }
                    "setBrightness" -> {
                        val value = (call.arguments as? Number)?.toFloat() ?: -1f
                        val lp = window.attributes
                        lp.screenBrightness = if (value < 0f) {
                            WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        } else {
                            value.coerceIn(0.01f, 1f)
                        }
                        window.attributes = lp
                        result.success(null)
                    }
                    "share" -> {
                        val path = call.argument<String>("path")
                        val mime = call.argument<String>("mime") ?: "*/*"
                        result.success(if (path.isNullOrBlank()) false else shareFile(path, mime))
                    }
                    "pickMedia" -> pickMedia(result)
                    "prepareMedia" -> {
                        val uri = call.argument<String>("uri")
                        val id = call.argument<String>("id") ?: ""
                        if (uri.isNullOrBlank()) {
                            result.success(mapOf("error" to "주소가 없습니다."))
                        } else {
                            val signal = CancellationSignal()
                            prepareJobs[id] = signal
                            Thread {
                                val res: Map<String, Any?> = try {
                                    prepareMedia(Uri.parse(uri), signal, id)
                                } catch (_: OperationCanceledException) {
                                    mapOf("canceled" to true)
                                } catch (_: SecurityException) {
                                    mapOf("error" to "이 파일을 읽을 권한이 없습니다. 다시 열어 주세요.")
                                } catch (e: Exception) {
                                    mapOf("error" to (e.message ?: e.javaClass.simpleName))
                                }
                                runOnUiThread {
                                    // 스트리밍(받으면서 재생)이면 받기가 끝날 때까지 취소할 수 있게 남겨 둔다.
                                    if (!res.containsKey("stream")) prepareJobs.remove(id)
                                    result.success(res)
                                }
                            }.start()
                        }
                    }
                    "cancelPrepare" -> {
                        prepareJobs[call.argument<String>("id") ?: ""]?.cancel()
                        result.success(null)
                    }
                    "closeFd" -> {
                        val fd = (call.arguments as? Number)?.toInt()
                        if (fd != null && fd > 0) {
                            try {
                                ParcelFileDescriptor.adoptFd(fd).close()
                            } catch (_: Exception) {
                            }
                        }
                        result.success(null)
                    }
                    "pipSupported" -> result.success(pipSupported())
                    "enterPip" -> {
                        pipRatio = ratioOf(call.argument<Int>("width"), call.argument<Int>("height"))
                        result.success(enterPip())
                    }
                    "setAutoPip" -> {
                        autoPip = call.argument<Boolean>("enabled") == true
                        pipRatio = ratioOf(call.argument<Int>("width"), call.argument<Int>("height"))
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && pipSupported()) {
                            try {
                                setPictureInPictureParams(
                                    PictureInPictureParams.Builder()
                                        .setAspectRatio(pipRatio)
                                        .setAutoEnterEnabled(autoPip)
                                        .build(),
                                )
                            } catch (_: Exception) {
                            }
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        }

        // "연결 프로그램"으로 들어온 문서를 Dart에 넘기는 채널.
        incomingChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, INCOMING_CHANNEL).also { channel ->
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "getInitialFile" -> {
                        val launchIntent = intent
                        // 한 번 처리한 인텐트는 다시 처리하지 않도록 비운다.
                        setIntent(Intent(Intent.ACTION_MAIN))
                        resolveIncoming(launchIntent) { file ->
                            val error = file?.get("error") as? String
                            if (error != null) result.error("open_failed", error, null) else result.success(file)
                        }
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

    /**
     * content:// 미디어를 재생할 수 있게 준비한다(백그라운드 스레드에서 호출).
     *
     * 재생 엔진(media_kit)은 content:// 를 UI 스레드에서 동기로 열기 때문에, 구글 드라이브처럼
     * 열 때 내려받기가 필요한 파일이면 앱 전체가 멈춘다. 여기서 미리 열어 둔다.
     * - 일반 파일로 열리면(로컬, 또는 클라우드 앱이 캐시에 다 받은 경우) 파일 디스크립터를 넘긴다 → fd://N
     * - 파이프(스트림)로만 열리면 탐색이 안 되므로 앱 캐시에 받아 두고 그 경로를 넘긴다(진행률 알림).
     */
    private fun prepareMedia(uri: Uri, signal: CancellationSignal, id: String): Map<String, Any?> {
        if (uri.scheme == "file") return mapOf("path" to (uri.path ?: uri.toString()))
        val pfd = contentResolver.openFileDescriptor(uri, "r", signal)
            ?: throw IllegalStateException("파일을 열 수 없습니다.")
        val regular = try {
            OsConstants.S_ISREG(Os.fstat(pfd.fileDescriptor).st_mode)
        } catch (_: Exception) {
            false
        }
        if (regular) return mapOf("fd" to pfd.detachFd())
        pfd.close()

        var total = -1L
        contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst() && !c.isNull(0)) total = c.getLong(0)
        }
        val dir = File(cacheDir, "media").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // 받아 둔 영상은 하나만 남긴다.
        val out = File(dir, "stream_${System.currentTimeMillis()}")
        out.createNewFile()
        // 받으면서 바로 재생한다: 복사는 뒤에서 계속하고, 지금은 받는 중인 파일을 넘긴다.
        Thread {
            var ok = true
            var error: String? = null
            try {
                val input = contentResolver.openInputStream(uri) ?: throw IllegalStateException("파일을 열 수 없습니다.")
                input.use { src ->
                    out.outputStream().use { dst ->
                        val buf = ByteArray(1 shl 16)
                        var done = 0L
                        var reported = 0L
                        while (true) {
                            signal.throwIfCanceled()
                            val n = src.read(buf)
                            if (n < 0) break
                            dst.write(buf, 0, n)
                            dst.flush()
                            done += n
                            if (done - reported >= (1 shl 20)) {
                                reported = done
                                val d = done
                                runOnUiThread {
                                    mediaChannel?.invokeMethod(
                                        "prepareProgress",
                                        mapOf("id" to id, "done" to d, "total" to total),
                                    )
                                }
                            }
                        }
                    }
                }
            } catch (_: OperationCanceledException) {
                ok = false
                error = "canceled"
            } catch (e: Exception) {
                ok = false
                error = e.message ?: e.javaClass.simpleName
            }
            if (!ok) out.delete()
            runOnUiThread {
                prepareJobs.remove(id)
                mediaChannel?.invokeMethod("prepareDone", mapOf("id" to id, "ok" to ok, "error" to error))
            }
        }.start()
        return mapOf("stream" to out.absolutePath, "total" to total)
    }

    /** 동영상·음악 고르기: 복사하지 않고 content:// 주소를 그대로 돌려준다(권한은 계속 유지). */
    private fun pickMedia(result: MethodChannel.Result) {
        if (pendingPick != null) {
            result.error("busy", "picker already open", null)
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("video/*", "audio/*"))
        }
        pendingPick = result
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, PICK_MEDIA)
        } catch (e: Exception) {
            pendingPick = null
            result.error("no_picker", e.message, null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_MEDIA) {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
            return
        }
        val reply = pendingPick
        pendingPick = null
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            reply?.success(null)
            return
        }
        try {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) {
        }
        Thread {
            val info: Map<String, Any?>? = try {
                copyToCache(uri, contentResolver.getType(uri))
            } catch (_: Exception) {
                null
            }
            runOnUiThread { reply?.success(info) }
        }.start()
    }

    private fun systemBrightness(): Double =
        try {
            Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS) / 255.0
        } catch (_: Exception) {
            0.5
        }

    private fun shareFile(path: String, mime: String): Boolean =
        try {
            val uri = if (path.startsWith("content://")) {
                Uri.parse(path)
            } else {
                FileProvider.getUriForFile(this, "$packageName.fileprovider", File(path))
            }
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, null))
            true
        } catch (_: Exception) {
            false
        }

    private fun pipSupported(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    /** PIP 비율은 1:2.39 ~ 2.39:1 범위여야 한다. */
    private fun ratioOf(width: Int?, height: Int?): Rational {
        val w = (width ?: 16).coerceAtLeast(1)
        val h = (height ?: 9).coerceAtLeast(1)
        val r = w.toDouble() / h
        return when {
            r > 2.39 -> Rational(239, 100)
            r < 1 / 2.39 -> Rational(100, 239)
            else -> Rational(w, h)
        }
    }

    private fun enterPip(): Boolean {
        if (!pipSupported()) return false
        return try {
            enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(pipRatio).build())
        } catch (_: Exception) {
            false
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Android 12 이상은 setAutoEnterEnabled가 알아서 처리한다.
        if (autoPip && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPip()
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        mediaChannel?.invokeMethod("pipChanged", isInPictureInPictureMode)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // 다이얼로그·파일 선택기·앱 전환에서 돌아올 때마다 다시 숨긴다.
        if (hasFocus) hideNavigationBar()
    }

    /**
     * 하단 내비게이션 바(3버튼/제스처 바)를 숨겨 문서를 넓게 본다.
     * 화면 아래에서 위로 스와이프하면 잠시 나타났다가 자동으로 다시 숨는다.
     * 상태바는 그대로 둔다.
     */
    private fun hideNavigationBar() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.navigationBars())
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // 앱이 이미 떠 있는 상태에서 다른 문서를 "연결 프로그램"으로 열었을 때.
        resolveIncoming(intent) { file ->
            val error = file?.get("error") as? String
            if (error != null) {
                incomingChannel?.invokeMethod("openError", error)
            } else if (file != null) {
                incomingChannel?.invokeMethod("openFile", file)
            }
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
            val file: Map<String, Any?> = try {
                copyToCache(uri, mime)
            } catch (e: Exception) {
                val denied = e is SecurityException || e.message?.contains("EACCES") == true
                mapOf(
                    "error" to if (denied) {
                        "이 파일을 읽을 권한이 없습니다. 파일 관리자나 \"문서 열기\"로 다시 열어 주세요."
                    } else {
                        "문서를 가져오지 못했습니다."
                    },
                )
            }
            runOnUiThread { callback(file) }
        }.start()
    }

    private fun copyToCache(uri: Uri, mime: String?): Map<String, Any?> {
        var queried: String? = null
        var querySize = -1L
        if (uri.scheme == "content") {
            contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    queried = cursor.getString(0)
                    if (!cursor.isNull(1)) querySize = cursor.getLong(1)
                }
            }
        }
        val rawName: String = queried?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
            ?: "document"
        val cleaned = rawName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        val extension = if (mime != null) MIME_EXTENSIONS[mime] else null
        val name: String = if (!cleaned.contains('.') && extension != null) "$cleaned.$extension" else cleaned

        val ext = name.substringAfterLast('.', "").lowercase()
        val isMedia = mime?.startsWith("video/") == true || mime?.startsWith("audio/") == true || ext in MEDIA_EXTENSIONS
        if (isMedia) {
            // 복사하지 않고 원본 주소를 넘긴다(플레이어가 content:// 를 직접 연다).
            val direct = if (uri.scheme == "file") uri.path ?: uri.toString() else uri.toString()
            val size = if (querySize >= 0) querySize else (uri.path?.let { File(it).length() } ?: 0L)
            return mapOf("path" to direct, "name" to name, "size" to size)
        }

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
