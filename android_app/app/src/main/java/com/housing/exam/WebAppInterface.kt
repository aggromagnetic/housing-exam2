package com.housing.exam

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast

class WebAppInterface(private val context: Context) {

    @JavascriptInterface
    fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun getAppVersion(): String {
        return "1.0.2"
    }

    @JavascriptInterface
    fun isAndroidNativeApp(): Boolean {
        return true
    }

    @JavascriptInterface
    fun isNetworkAvailable(): Boolean {
        return (context as? MainActivity)?.isNetworkAvailable() ?: false
    }

    @JavascriptInterface
    fun vibrateSoftly(durationMs: Long = 25) {
        try {
            val vibrator = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(durationMs.coerceIn(10L, 80L), 70))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(durationMs.coerceIn(10L, 80L))
            }
        } catch (e: Exception) {}
    }

    @JavascriptInterface
    fun resetIdleTimer() {
        if (context is MainActivity) {
            context.runOnUiThread {
                context.resetUserActivity()
            }
        }
    }

    @JavascriptInterface
    fun hideNavigationBars() {
        if (context is MainActivity) {
            context.runOnUiThread {
                context.hideSystemBars()
            }
        }
    }

    @JavascriptInterface
    fun printA4Document(docTitle: String) {
        if (context is MainActivity) {
            context.runOnUiThread {
                try {
                    val printManager = context.getSystemService(Context.PRINT_SERVICE) as? android.print.PrintManager
                    val webView = context.getWebView()
                    val printAdapter = webView.createPrintDocumentAdapter(docTitle)
                    if (printManager != null) {
                        val printAttributes = android.print.PrintAttributes.Builder()
                            .setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4)
                            .setColorMode(android.print.PrintAttributes.COLOR_MODE_COLOR)
                            .build()
                        printManager.print(docTitle, printAdapter, printAttributes)
                    } else {
                        Toast.makeText(context, "인쇄 서비스를 사용할 수 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "인쇄 오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
