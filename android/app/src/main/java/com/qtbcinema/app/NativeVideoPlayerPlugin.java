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
    public void isNativeSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
