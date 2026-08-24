package com.qtbcinema.app;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.dash.DashMediaSource;
import androidx.media3.exoplayer.drm.DefaultDrmSessionManager;
import androidx.media3.exoplayer.drm.DrmSessionManager;
import androidx.media3.exoplayer.drm.FrameworkMediaDrm;
import androidx.media3.exoplayer.drm.MediaDrmCallback;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@UnstableApi
public class NativePlayerActivity extends AppCompatActivity {

    private static final UUID CLEARKEY_UUID = new UUID(0x1077EFEC0B244D02L, 0xACE33C1E52E2FB4BL);

    private ExoPlayer player;
    private PlayerView playerView;
    private ProgressBar progressBar;
    private TextView errorText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on & Fullscreen
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        String streamUrl = getIntent().getStringExtra("url");
        String drmKey = getIntent().getStringExtra("drmKey");
        String title = getIntent().getStringExtra("title");
        String userAgent = getIntent().getStringExtra("userAgent");
        if (userAgent == null || userAgent.isEmpty()) {
            userAgent = "Dalvik/2.1.0";
        }

        // Layout
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootLayout.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        playerView.setUseController(true);
        rootLayout.addView(playerView);

        // Loading spinner
        progressBar = new ProgressBar(this);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        pbParams.gravity = Gravity.CENTER;
        progressBar.setLayoutParams(pbParams);
        rootLayout.addView(progressBar);

        // Error message text
        errorText = new TextView(this);
        FrameLayout.LayoutParams errParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        errParams.gravity = Gravity.CENTER;
        errorText.setLayoutParams(errParams);
        errorText.setTextColor(Color.RED);
        errorText.setTextSize(16);
        errorText.setVisibility(View.GONE);
        rootLayout.addView(errorText);

        // Top bar overlay with Back button & Title
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setPadding(32, 32, 32, 32);
        topBar.setBackgroundColor(Color.parseColor("#99000000"));
        FrameLayout.LayoutParams tbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        tbParams.gravity = Gravity.TOP;
        topBar.setLayoutParams(tbParams);

        TextView backBtn = new TextView(this);
        backBtn.setText(" ✕  Trở về ");
        backBtn.setTextColor(Color.WHITE);
        backBtn.setTextSize(18);
        backBtn.setPadding(16, 16, 16, 16);
        backBtn.setOnClickListener(v -> finish());
        topBar.addView(backBtn);

        TextView titleView = new TextView(this);
        titleView.setText(title != null ? title : "Livestream TV");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18);
        titleView.setPadding(32, 16, 16, 16);
        topBar.addView(titleView);

        rootLayout.addView(topBar);

        setContentView(rootLayout);

        initializePlayer(streamUrl, drmKey, userAgent);
    }

    private void initializePlayer(String url, String drmKey, String userAgent) {
        if (url == null || url.isEmpty()) {
            showError("URL luồng không hợp lệ");
            return;
        }

        try {
            DataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent(userAgent)
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(15000)
                    .setReadTimeoutMs(15000);

            ExoPlayer.Builder playerBuilder = new ExoPlayer.Builder(this);

            if (drmKey != null && !drmKey.trim().isEmpty()) {
                MediaDrmCallback drmCallback = new NativeClearKeyDrmCallback(drmKey, userAgent);
                DrmSessionManager drmSessionManager = new DefaultDrmSessionManager.Builder()
                        .setUuidAndExoMediaDrmProvider(CLEARKEY_UUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
                        .build(drmCallback);

                playerBuilder.setDrmSessionManagerProvider(mediaItem -> drmSessionManager);
            }

            player = playerBuilder.build();
            playerView.setPlayer(player);

            MediaSource mediaSource;
            Uri uri = Uri.parse(url);
            String lowerUrl = url.toLowerCase();

            if (lowerUrl.contains(".mpd")) {
                mediaSource = new DashMediaSource.Factory(dataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(uri));
            } else if (lowerUrl.contains(".m3u8")) {
                mediaSource = new HlsMediaSource.Factory(dataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(uri));
            } else {
                mediaSource = new ProgressiveMediaSource.Factory(dataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(uri));
            }

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_BUFFERING) {
                        progressBar.setVisibility(View.VISIBLE);
                        errorText.setVisibility(View.GONE);
                    } else if (playbackState == Player.STATE_READY) {
                        progressBar.setVisibility(View.GONE);
                        errorText.setVisibility(View.GONE);
                    } else if (playbackState == Player.STATE_ENDED) {
                        progressBar.setVisibility(View.GONE);
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    progressBar.setVisibility(View.GONE);
                    showError("Lỗi phát luồng Native ExoPlayer: " + error.getErrorCodeName() + " (" + error.getMessage() + ")");
                }
            });

            player.setMediaSource(mediaSource);
            player.prepare();
            player.play();

        } catch (Exception e) {
            e.printStackTrace();
            showError("Không thể khởi tạo ExoPlayer: " + e.getMessage());
        }
    }

    private void showError(String msg) {
        progressBar.setVisibility(View.GONE);
        errorText.setText(msg);
        errorText.setVisibility(View.VISIBLE);
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }

    // Native ClearKey DRM Callback
    private static class NativeClearKeyDrmCallback implements MediaDrmCallback {
        private final String drmKey;
        private final String userAgent;

        public NativeClearKeyDrmCallback(String drmKey, String userAgent) {
            this.drmKey = drmKey.trim();
            this.userAgent = userAgent != null ? userAgent : "Dalvik/2.1.0";
        }

        @Override
        public byte[] executeProvisionRequest(UUID uuid, MediaDrmCallback.ProvisionRequest request) throws Exception {
            return new byte[0];
        }

        @Override
        public byte[] executeKeyRequest(UUID uuid, MediaDrmCallback.KeyRequest request) throws Exception {
            if (drmKey.isEmpty()) {
                return new byte[0];
            }

            // 1. Static KID:KEY format (hex or base64)
            if (drmKey.contains(":")) {
                String[] parts = drmKey.split(":");
                if (parts.length >= 2) {
                    String kidB64 = toBase64Url(parts[0]);
                    String keyB64 = toBase64Url(parts[1]);

                    String jwk = "{\"keys\":[{\"kty\":\"oct\",\"kid\":\"" + kidB64 + "\",\"k\":\"" + keyB64 + "\"}],\"type\":\"temporary\"}";
                    return jwk.getBytes(StandardCharsets.UTF_8);
                }
            }

            // 2. License Server URL (e.g. https://vmttv.dpdns.org/AutoKey/)
            if (drmKey.startsWith("http://") || drmKey.startsWith("https://")) {
                byte[] requestData = request.getData();
                URL url = new URL(drmKey);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("User-Agent", userAgent);
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                if (requestData != null && requestData.length > 0) {
                    OutputStream os = conn.getOutputStream();
                    os.write(requestData);
                    os.close();
                }

                InputStream is = conn.getResponseCode() >= 400 ? conn.getErrorStream() : conn.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[1024];
                int n;
                while ((n = is.read(buf)) != -1) {
                    baos.write(buf, 0, n);
                }
                String respStr = baos.toString("UTF-8");

                // Sanitize Base64 to Base64URL for Chromium/Android MediaDrm
                if (respStr.contains("\"keys\"")) {
                    respStr = sanitizeJwk(respStr);
                }

                return respStr.getBytes(StandardCharsets.UTF_8);
            }

            return new byte[0];
        }

        private static String toBase64Url(String input) {
            if (input == null) return "";
            String trimmed = input.trim();
            if (trimmed.length() == 32 && trimmed.matches("^[0-9a-fA-F]{32}$")) {
                byte[] data = new byte[16];
                for (int i = 0; i < 32; i += 2) {
                    data[i / 2] = (byte) ((Character.digit(trimmed.charAt(i), 16) << 4)
                                         + Character.digit(trimmed.charAt(i+1), 16));
                }
                return Base64.encodeToString(data, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            }
            return trimmed.replace("+", "-").replace("/", "_").replace("=", "");
        }

        private static String sanitizeJwk(String jsonStr) {
            try {
                JSONObject json = new JSONObject(jsonStr);
                if (json.has("keys")) {
                    JSONArray keys = json.getJSONArray("keys");
                    for (int i = 0; i < keys.length(); i++) {
                        JSONObject kObj = keys.getJSONObject(i);
                        if (kObj.has("kid")) {
                            String kid = kObj.getString("kid");
                            kObj.put("kid", kid.replace("+", "-").replace("/", "_").replace("=", ""));
                        }
                        if (kObj.has("k")) {
                            String k = kObj.getString("k");
                            kObj.put("k", k.replace("+", "-").replace("/", "_").replace("=", ""));
                        }
                    }
                    return json.toString();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return jsonStr;
        }
    }
}
