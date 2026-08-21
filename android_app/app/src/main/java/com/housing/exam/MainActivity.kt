package com.housing.exam

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: StylusPalmRejectionWebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var lastBackPressTime: Long = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep Screen On for uninterrupted study sessions
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Hide System UI (Immersive Sticky Fullscreen)
        enableImmersiveStickyMode()

        // 3. Initialize WebViewAssetLoader for safe, offline HTTPS domain loading
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = StylusPalmRejectionWebView(this).apply {
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }
        setContentView(webView)

        // 4. Configure High-Performance WebView Settings
        configureWebViewSettings(webView.settings)

        // 5. JavaScript Interface Bridge
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        // 6. WebViewClient & WebChromeClient
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                return super.onConsoleMessage(consoleMessage)
            }

            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("알림")
                    .setMessage(message)
                    .setPositiveButton("확인") { _, _ -> result?.confirm() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsConfirm(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("확인")
                    .setMessage(message)
                    .setPositiveButton("예") { _, _ -> result?.confirm() }
                    .setNegativeButton("아니오") { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }
        }

        // 7. Load Local Web App via HTTPS Asset Domain
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        // 8. Handle Back Button (Prevent Accidental Exits)
        setupBackPressHandler()
    }

    private fun configureWebViewSettings(settings: WebSettings) {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false

            // Viewport & Scale
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false

            // Cache & Offline
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
    }

    private fun enableImmersiveStickyMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun setupBackPressHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastBackPressTime < 2000) {
                        finish()
                    } else {
                        lastBackPressTime = currentTime
                        Toast.makeText(
                            this@MainActivity,
                            "한 번 더 누르면 앱이 종료됩니다.",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        })
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveStickyMode()
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        enableImmersiveStickyMode()
    }
}

/**
 * High-Precision Stylus Palm Rejection WebView
 * Discards finger touch events while Lenovo/S-Pen stylus is in contact or hovering near the screen.
 */
class StylusPalmRejectionWebView(context: Context) : WebView(context) {

    private var lastStylusEventTime: Long = 0
    private val STYLUS_PROXIMITY_GRACE_PERIOD_MS = 1200L

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        val toolType = ev.getToolType(0)

        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            lastStylusEventTime = System.currentTimeMillis()
            return super.dispatchTouchEvent(ev)
        }

        // If finger touch happens while stylus was active recently (palm resting on screen)
        if (toolType == MotionEvent.TOOL_TYPE_FINGER) {
            val elapsed = System.currentTimeMillis() - lastStylusEventTime
            if (elapsed < STYLUS_PROXIMITY_GRACE_PERIOD_MS) {
                // Ignore finger touch (Palm Rejection)
                return false
            }
        }

        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        val toolType = ev.getToolType(0)
        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            lastStylusEventTime = System.currentTimeMillis()
        }
        return super.dispatchGenericMotionEvent(ev)
    }
}
