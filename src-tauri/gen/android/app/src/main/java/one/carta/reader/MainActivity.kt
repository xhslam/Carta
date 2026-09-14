package one.carta.reader

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var isImmersiveReading: Boolean = false
  private var cartaWebView: WebView? = null

  private val fileChooserLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { result ->
    val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
    fileChooserCallback?.onReceiveValue(uris)
    fileChooserCallback = null
  }

  inner class AndroidBridge {
    @JavascriptInterface
    fun setImmersiveReading(enabled: Boolean) {
      runOnUiThread {
        applyImmersiveReading(enabled)
      }
    }
  }

  fun applyImmersiveReading(enabled: Boolean) {
    isImmersiveReading = enabled
    val currentWindow = window ?: return
    val controller = WindowCompat.getInsetsController(currentWindow, currentWindow.decorView)
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

    if (enabled) {
      // WeChat Read style: full immersive reading without system status bar
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      // Restore status bar on library / settings
      controller.show(WindowInsetsCompat.Type.systemBars())
    }

    val content = findViewById<View>(android.R.id.content) ?: return
    ViewCompat.requestApplyInsets(content)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus && isImmersiveReading) {
      applyImmersiveReading(true)
    }
  }

  override fun onResume() {
    super.onResume()
    if (isImmersiveReading) {
      applyImmersiveReading(true)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    cartaWebView = webView
    WebView.setWebContentsDebuggingEnabled(true)
    webView.addJavascriptInterface(AndroidBridge(), "CartaAndroidBridge")
    webView.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(
        view: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
      ): Boolean {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = filePathCallback
        try {
          val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
          }
          fileChooserLauncher.launch(intent)
          return true
        } catch (e: Exception) {
          fileChooserCallback?.onReceiveValue(null)
          fileChooserCallback = null
          return false
        }
      }
    }
  }

  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    // Let the React shell peel back its topmost layer (note editor, tools,
    // reader, then tabs). At the root this deliberately keeps Carta open.
    cartaWebView?.evaluateJavascript(
      "window.dispatchEvent(new Event('carta:native-back',{cancelable:true}))",
      null
    )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(true)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      if (isImmersiveReading) {
        // In immersive reading mode, allow the canvas to fill the screen without status bar offset
        view.setPadding(0, 0, 0, keyboard.bottom)
      } else {
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      }
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
