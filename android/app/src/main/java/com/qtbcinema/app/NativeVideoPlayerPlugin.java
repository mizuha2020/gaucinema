package com.qtbcinema.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeVideoPlayer")
public class NativeVideoPlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        try {
            String url = call.getString("url");
            if (url == null || url.isEmpty()) {
                call.reject("URL là bắt buộc");
                return;
            }

            String drmKey = call.getString("drmKey", "");
            String title = call.getString("title", "Livestream TV");
            String userAgent = call.getString("userAgent", "Dalvik/2.1.0");

            Context ctx = getContext();
            Intent intent = new Intent(ctx, NativePlayerActivity.class);
            intent.putExtra("url", url);
            intent.putExtra("drmKey", drmKey);
            intent.putExtra("title", title);
            intent.putExtra("userAgent", userAgent);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                ctx.startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Không thể mở ExoPlayer Native: " + e.getMessage());
        }
    }

    @PluginMethod
    public void playExternal(PluginCall call) {
        try {
            String url = call.getString("url");
            if (url == null || url.isEmpty()) {
                call.reject("URL là bắt buộc");
                return;
            }

            Context ctx = getContext();
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(url), "video/*");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(intent, "Chọn ứng dụng xem TV (VLC / MX Player)");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            ctx.startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Không thể mở ứng dụng ngoài: " + e.getMessage());
        }
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        try {
            if (getActivity() instanceof MainActivity) {
                MainActivity act = (MainActivity) getActivity();
                act.runOnUiThread(() -> {
                    boolean entered = false;
                    try { entered = act.enterPipMode(); } catch (Exception e) { e.printStackTrace(); }
                    JSObject ret = new JSObject();
                    ret.put("entered", entered);
                    call.resolve(ret);
                });
            } else {
                call.reject("Activity không hỗ trợ PiP");
            }
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Lỗi bật PiP: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setVideoPlaying(PluginCall call) {
        try {
            boolean playing = call.getBoolean("playing", false);
            if (getActivity() instanceof MainActivity) {
                getActivity().runOnUiThread(() -> {
                    ((MainActivity) getActivity()).setPlayingVideo(playing);
                });
            }
            call.resolve();
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Lỗi cập nhật trạng thái phát: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        try {
            // Ủy quyền cho MainActivity giữ flag + tự re-apply khi focus/resume/thoát PiP
            // (trước đây set trực tiếp ở đây nên bị Bridge reset sau 1 chạm là hiện lại status bar)
            if (getActivity() instanceof MainActivity) {
                MainActivity act = (MainActivity) getActivity();
                act.runOnUiThread(() -> act.setImmersiveEnabled(enabled));
            } else if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    android.view.Window window = getActivity().getWindow();
                    android.view.View decor = window.getDecorView();
                    if (enabled) {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
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
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
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
                });
            }
            call.resolve();
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Loi immersive: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isPipSupported(PluginCall call) {        JSObject ret = new JSObject();
        boolean sdkOk = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O;
        boolean featureOk = true;
        try {
            featureOk = getContext().getPackageManager()
                .hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE);
        } catch (Exception ignored) {}
        ret.put("supported", sdkOk && featureOk);
        call.resolve(ret);
    }

    @PluginMethod
    public void isNativeSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
