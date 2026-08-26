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

    public void enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Rational rational = new Rational(16, 9);
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                        .setAspectRatio(rational);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(true);
                }
                enterPictureInPictureMode(builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
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
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('native-pip-change', { detail: { isPip: " + isInPictureInPictureMode + " } }));",
                null
            );
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

