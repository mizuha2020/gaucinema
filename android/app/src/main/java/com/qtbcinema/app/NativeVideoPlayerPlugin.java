package com.qtbcinema.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeVideoPlayer")
public class NativeVideoPlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        String drmKey = call.getString("drmKey", "");
        String title = call.getString("title", "Livestream TV");
        String userAgent = call.getString("userAgent", "Dalvik/2.1.0");

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("drmKey", drmKey);
        intent.putExtra("title", title);
        intent.putExtra("userAgent", userAgent);

        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void isNativeSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
