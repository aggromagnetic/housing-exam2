package com.housing.exam

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: StylusPalmRejectionWebView
    fun getWebView(): StylusPalmRejectionWebView = webView
    private lateinit var assetLoader: WebViewAssetLoader
    private var lastBackPressTime: Long = 0
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Library Battery Saver: Automatically release FLAG_KEEP_SCREEN_ON after 15 minutes of inactivity
    private val IDLE_SCREEN_TIMEOUT_MS = 15 * 60 * 1000L
    private val idleHandler = Handler(Looper.getMainLooper())
    private val idleRunnable = Runnable {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun resetUserActivity() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        idleHandler.removeCallbacks(idleRunnable)
        idleHandler.postDelayed(idleRunnable, IDLE_SCREEN_TIMEOUT_MS)
    }

    fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val activeNetwork = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread {
                    // Seamless non-intrusive online notification: Web app triggers cloud sync without reloading!
                    webView.evaluateJavascript(
                        "if (window.dispatchEvent) { window.dispatchEvent(new Event('online')); }",
                        null
                    )
                }
            }

            override fun onLost(network: Network) {
                runOnUiThread {
                    webView.evaluateJavascript(
                        "if (window.dispatchEvent) { window.dispatchEvent(new Event('offline')); }",
                        null
                    )
                }
            }
        }
        networkCallback = cb
        try {
            cm.registerNetworkCallback(request, cb)
        } catch (e: Exception) {}
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep Screen On with Idle Battery Management for Library Study
        resetUserActivity()

        // 2. Register Network Callback for Seamless Mid-session Online Reconnection
        registerNetworkCallback()

        // 3. Request High Refresh Rate (90Hz on Lenovo TB335FC, 120Hz on Galaxy Tab)
        enableHighRefreshRate()

        // 3. Hide System UI (Immersive Sticky Fullscreen)
        enableImmersiveStickyMode()

        // 4. Initialize WebViewAssetLoader for safe, offline HTTPS domain loading
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = StylusPalmRejectionWebView(this).apply {
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, false)
            }
        }
        setContentView(webView)

        // 5. Configure High-Performance WebView Settings (Instant Cold Start)
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

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: androidx.webkit.WebResourceErrorCompat
            ) {
                super.onReceivedError(view, request, error)
                // If live online page fails to load (e.g. no Wi-Fi / offline), seamlessly fallback to local asset
                if (request.isForMainFrame && !request.url.toString().contains("appassets.androidplatform.net")) {
                    view.loadUrl("https://appassets.androidplatform.net/assets/www/housing_exam_hell/index.html")
                }
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

        // 7. Load Dedicated Housing Exam Hell App with Zero-Wait Offline First check
        if (savedInstanceState == null) {
            if (isNetworkAvailable()) {
                webView.loadUrl("https://aggromagnetic.github.io/housing-exam2/housing_exam_hell/")
            } else {
                // Zero-wait offline launch in 0.05s without waiting for DNS timeouts
                webView.loadUrl("https://appassets.androidplatform.net/assets/www/housing_exam_hell/index.html")
            }
        } else {
            webView.restoreState(savedInstanceState)
        }

        // 8. Handle Back Button (Prevent Accidental Exits)
        setupBackPressHandler()
    }

    override fun onDestroy() {
        super.onDestroy()
        idleHandler.removeCallbacks(idleRunnable)
        networkCallback?.let {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            try {
                cm?.unregisterNetworkCallback(it)
            } catch (e: Exception) {}
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
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

            // Instant Cold Start with HTTP ETag / Cache-Control validation
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
    }

    private fun enableHighRefreshRate() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val display = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                display
            } else {
                @Suppress("DEPRECATION")
                windowManager.defaultDisplay
            }
            val modes = display?.supportedModes
            // Dynamically query device hardware maximum refresh rate (e.g. 90Hz on Lenovo TB335FC, 120Hz on Galaxy Tab)
            val maxMode = modes?.maxByOrNull { it.refreshRate }
            if (maxMode != null && maxMode.refreshRate >= 80f) {
                window.attributes.preferredDisplayModeId = maxMode.modeId
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    window.attributes.preferredRefreshRate = maxMode.refreshRate
                }
                window.attributes = window.attributes
            }
        }
    }

    fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.navigationBars())
    }

    private fun enableImmersiveStickyMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        // Continuously suppress navigation bar popups when soft keyboard or stylus handwriting tool opens
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            insetsController.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            insetsController.hide(WindowInsetsCompat.Type.navigationBars())
            view.onApplyWindowInsets(insets.toWindowInsets())
            insets
        }

        // Re-hide navigation bar after soft keyboard or S-Pen toolbar dismissal
        window.decorView.postDelayed({
            controller.hide(WindowInsetsCompat.Type.navigationBars())
        }, 500)
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
    private val STYLUS_PROXIMITY_GRACE_PERIOD_MS = 600L

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        (context as? MainActivity)?.resetUserActivity()
        val toolType = ev.getToolType(0)

        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            lastStylusEventTime = System.currentTimeMillis()
            return super.dispatchTouchEvent(ev)
        }

        // Finger touch evaluation during active stylus writing
        if (toolType == MotionEvent.TOOL_TYPE_FINGER) {
            val elapsed = System.currentTimeMillis() - lastStylusEventTime
            if (elapsed < STYLUS_PROXIMITY_GRACE_PERIOD_MS) {
                val density = resources.displayMetrics.density
                val isLeftToolbarArea = ev.x <= (120f * density)
                val isTopHeaderArea = ev.y <= (65f * density)

                // If user is intentionally tapping the pen toolbar dock on the left with left thumb
                // or top header buttons, pass the touch immediately!
                if (isLeftToolbarArea || isTopHeaderArea) {
                    return super.dispatchTouchEvent(ev)
                }

                // Discard palm resting on drawing card canvas
                return false
            }
        }

        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        (context as? MainActivity)?.resetUserActivity()
        val toolType = ev.getToolType(0)
        if (toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER) {
            lastStylusEventTime = System.currentTimeMillis()
        }
        return super.dispatchGenericMotionEvent(ev)
    }
}
