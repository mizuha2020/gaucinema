package com.qtbcinema.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    private static final String DEFAULT_STREAM_UA = "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)";
    private boolean isPlayingVideo = false;
    private boolean immersiveEnabled = false;
    private boolean isInPip = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(NativeVideoPlayerPlugin.class);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);

            // Edge-to-edge để WebView vẽ được dưới status bar khi immersive (xem phim fullscreen thật sự)
            try {
                getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
                getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    getWindow().setDecorFitsSystemWindows(false);
                } else {
                    getWindow().getDecorView().setSystemUiVisibility(
                        android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
                }
            } catch (Exception e) { e.printStackTrace(); }

            // Install Native Media & IPTV Stream Interceptor
            this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        Uri uri = request.getUrl();
                        String urlString = uri.toString();

                        if (shouldInterceptStreamUrl(urlString)) {
                            WebResourceResponse intercepted = handleNativeStreamRequest(request, urlString);
                            if (intercepted != null) {
                                return intercepted;
                            }
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            });
        }
    }

    public boolean enterPipMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            // Dùng tỉ lệ khung hình thực tế của màn hình để tránh lỗi aspect-ratio trên máy dọc
            Rational rational = new Rational(16, 9);
            try {
                android.graphics.Point size = new android.graphics.Point();
                getWindowManager().getDefaultDisplay().getSize(size);
                if (size.x > 0 && size.y > 0) {
                    int w = Math.max(size.x, size.y);
                    int h = Math.max(1, Math.min(size.x, size.y));
                    rational = new Rational(w, h);
                }
            } catch (Exception ignored) {}
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                    .setAspectRatio(rational);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setAutoEnterEnabled(isPlayingVideo);
                builder.setSeamlessResizeEnabled(true);
            }
            boolean ok = enterPictureInPictureMode(builder.build());
            // Một số máy trả false nhưng vẫn vào PiP qua onUserLeaveHint -> coi như đã gọi
            if (!ok) {
                // Fallback: thử lại với tỉ lệ 16:9 chuẩn
                try {
                    ok = enterPictureInPictureMode(new PictureInPictureParams.Builder()
                            .setAspectRatio(new Rational(16, 9)).build());
                } catch (Exception e) { e.printStackTrace(); }
            }
            return ok;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    /** Bật/tắt immersive sticky (ẩn status bar + nav bar). Giữ flag để re-apply khi focus/resume. */
    public void setImmersiveEnabled(boolean enabled) {
        this.immersiveEnabled = enabled;
        runOnUiThread(this::applyImmersive);
    }

    private void applyImmersive() {
        try {
            if (isInPip) return; // đang ở PiP thì không ép immersive
            android.view.Window window = getWindow();
            android.view.View decor = window.getDecorView();
            if (immersiveEnabled) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.setDecorFitsSystemWindows(false);
                    if (window.getInsetsController() != null) {
                        window.getInsetsController().hide(
                            android.view.WindowInsets.Type.statusBars()
                                | android.view.WindowInsets.Type.navigationBars());
                        window.getInsetsController().setSystemBarsBehavior(
                            android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    }
                } else {
                    int flags = android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
                    decor.setSystemUiVisibility(flags);
                }
            } else {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.setDecorFitsSystemWindows(true);
                    if (window.getInsetsController() != null) {
                        window.getInsetsController().show(
                            android.view.WindowInsets.Type.statusBars()
                                | android.view.WindowInsets.Type.navigationBars());
                    }
                } else {
                    decor.setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_VISIBLE);
                }
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Capacitor/Bridge hay reset systemUI khi focus lại -> re-apply immersive
        if (hasFocus && immersiveEnabled) applyImmersive();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (immersiveEnabled) {
            // post delay nhẹ để qua mặt Splash/Bridge reset
            try {
                getWindow().getDecorView().postDelayed(this::applyImmersive, 100);
            } catch (Exception e) { applyImmersive(); }
        }
    }

    public void setPlayingVideo(boolean playing) {
        this.isPlayingVideo = playing;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .setAutoEnterEnabled(playing);
                setPictureInPictureParams(builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (isPlayingVideo) {
            enterPipMode();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        this.isInPip = isInPictureInPictureMode;
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('native-pip-change', { detail: { isPip: " + isInPictureInPictureMode + " } }));",
                null
            );
        }
        // Thoát PiP mà player vẫn mở -> ẩn lại status bar
        if (!isInPictureInPictureMode && immersiveEnabled) {
            try {
                getWindow().getDecorView().postDelayed(this::applyImmersive, 200);
            } catch (Exception e) { applyImmersive(); }
        }
    }

    private boolean shouldInterceptStreamUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();
        return lower.contains("fptplay.net") ||
               lower.contains("vtvprime.vn") ||
               lower.contains("seenow.vn") ||
               lower.contains("vmttv.dpdns.org") ||
               lower.contains("247.dpdns.org") ||
               lower.contains("watchtivo-8k.com") ||
               lower.contains("ciao-ott.net") ||
               lower.contains("/autokey/") ||
               lower.contains(".mpd") ||
               lower.contains(".m3u8") ||
               lower.contains(".m4s") ||
               lower.contains("extension=ts") ||
               (lower.endsWith(".ts") && !lower.contains(".json"));
    }

    private WebResourceResponse handleNativeStreamRequest(WebResourceRequest request, String urlString) {
        try {
            String method = request.getMethod() != null ? request.getMethod() : "GET";

            // Return instant 200 OK with CORS for OPTIONS preflight
            if ("OPTIONS".equalsIgnoreCase(method)) {
                Map<String, String> corsHeaders = new HashMap<>();
                corsHeaders.put("Access-Control-Allow-Origin", "*");
                corsHeaders.put("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
                corsHeaders.put("Access-Control-Allow-Headers", "*");
                corsHeaders.put("Access-Control-Max-Age", "86400");
                return new WebResourceResponse(
                    "text/plain",
                    "UTF-8",
                    200,
                    "OK",
                    corsHeaders,
                    new ByteArrayInputStream(new byte[0])
                );
            }

            // For POST requests (like DRM key challenges), allow standard WebView handling unless url is pure CDN stream
            if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
                return null;
            }

            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setInstanceFollowRedirects(true);

            // Copy request headers from WebView
            Map<String, String> requestHeaders = request.getRequestHeaders();
            if (requestHeaders != null) {
                for (Map.Entry<String, String> entry : requestHeaders.entrySet()) {
                    String k = entry.getKey();
                    if (k != null && !k.equalsIgnoreCase("Host") && !k.equalsIgnoreCase("User-Agent")) {
                        conn.setRequestProperty(k, entry.getValue());
                    }
                }
            }

            // Always enforce Native Dalvik User-Agent for IPTV & DRM servers
            conn.setRequestProperty("User-Agent", DEFAULT_STREAM_UA);

            // Read response
            int responseCode = conn.getResponseCode();
            String contentType = conn.getContentType();
            String mimeType = "application/octet-stream";
            String encoding = "UTF-8";

            if (contentType != null) {
                String[] parts = contentType.split(";");
                mimeType = parts[0].trim();
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase().startsWith("charset=")) {
                        encoding = p.substring(8).trim();
                    }
                }
            }

            // Smart fallback MIME types for DASH / HLS / DRM
            if (urlString.contains(".mpd")) {
                mimeType = "application/dash+xml";
            } else if (urlString.contains(".m3u8")) {
                mimeType = "application/vnd.apple.mpegurl";
            } else if (urlString.contains(".m4s") || urlString.contains("dash_")) {
                mimeType = "video/mp4";
            } else if (urlString.contains("extension=ts") || urlString.endsWith(".ts")) {
                mimeType = "video/mp2t";
            } else if (urlString.contains("/AutoKey/")) {
                mimeType = "application/json";
            }

            InputStream inputStream = responseCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (inputStream == null) {
                inputStream = new ByteArrayInputStream(new byte[0]);
            }

            // Build response headers with complete CORS permissive headers
            Map<String, String> responseHeaders = new HashMap<>();
            for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                if (header.getKey() != null && !header.getValue().isEmpty()) {
                    responseHeaders.put(header.getKey(), header.getValue().get(0));
                }
            }
            responseHeaders.put("Access-Control-Allow-Origin", "*");
            responseHeaders.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
            responseHeaders.put("Access-Control-Allow-Headers", "*");
            responseHeaders.put("Access-Control-Expose-Headers", "*");

            String message = conn.getResponseMessage() != null ? conn.getResponseMessage() : "OK";
            return new WebResourceResponse(
                mimeType,
                encoding,
                responseCode,
                message,
                responseHeaders,
                inputStream
            );
        } catch (Exception e) {
            e.printStackTrace();
            return null; // Fallback to standard WebView
        }
    }
}

