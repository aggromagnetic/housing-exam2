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
        return "1.0.0"
    }

    @JavascriptInterface
    fun isAndroidNativeApp(): Boolean {
        return true
    }

    @JavascriptInterface
    fun hideNavigationBars() {
        if (context is MainActivity) {
            context.runOnUiThread {
                context.hideSystemBars()
            }
        }
    }
}
