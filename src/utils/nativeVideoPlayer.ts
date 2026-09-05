import { registerPlugin, Capacitor } from '@capacitor/core';

export interface NativeVideoPlayerPlugin {
  play(options: {
    url: string;
    drmKey?: string;
    title?: string;
    userAgent?: string;
  }): Promise<void>;
  playExternal(options: {
    url: string;
  }): Promise<void>;
  enterPip(): Promise<{ entered?: boolean }>;
  setVideoPlaying(options: { playing: boolean }): Promise<void>;
  setImmersive(options: { enabled: boolean }): Promise<void>;
  isPipSupported(): Promise<{ supported: boolean }>;
  isNativeSupported(): Promise<{ supported: boolean }>;
}

const NativeVideoPlayer = registerPlugin<NativeVideoPlayerPlugin>('NativeVideoPlayer');

/**
 * Detect APK Android robust (không chỉ dựa Capacitor.isNativePlatform()).
 * Một số WebView/ROM bridge init chậm hoặc thiếu flag isNative -> check strict
 * trả false dù đang chạy trong APK, làm chết cả immersive lẫn PiP.
 */
export function isNativeAndroidApp(): boolean {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return true;
  } catch {}
  try {
    const cap = (window as any)?.Capacitor;
    if (cap?.isNative) {
      try {
        if (typeof cap.getPlatform === 'function' && cap.getPlatform() === 'android') return true;
      } catch {}
      try {
        if (/Android/i.test(navigator.userAgent || '')) return true;
      } catch {}
    }
  } catch {}
  // Fallback cuối: Android WebView mở localhost https không port
  // (đúng cấu hình APK: androidScheme https, webDir local)
  try {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua) && (/wv/i.test(ua) || /Version\/\d/i.test(ua) || /Mobile/i.test(ua))) {
      const { protocol, hostname, port } = window.location;
      if (
        (protocol === 'https:' || protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:') &&
        (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') &&
        (port === '' || port === '443' || port === '80')
      ) return true;
    }
  } catch {}
  return false;
}

export async function enterNativePip(): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    const res = await NativeVideoPlayer.enterPip();
    // Native trả { entered } — một số máy trả false nhưng vẫn vào PiP qua
    // onPictureInPictureModeChanged, nên chỉ log chứ không coi là lỗi.
    if (res && typeof (res as any).entered === 'boolean' && !(res as any).entered) {
      try { console.warn('[PiP] native enterPip returned false'); } catch {}
    }
    return true;
  } catch (err) {
    try { console.warn('[PiP] enterNativePip failed', err); } catch {}
    return false;
  }
}

export async function setNativeVideoPlaying(playing: boolean): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await NativeVideoPlayer.setVideoPlaying({ playing });
  } catch (err) {
    try { console.warn('[PiP] setNativeVideoPlaying failed', err); } catch {}
  }
}

export async function checkNativePipSupported(): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    const res = await NativeVideoPlayer.isPipSupported();
    return !!res.supported;
  } catch (err) {
    try { console.warn('[PiP] checkNativePipSupported failed', err); } catch {}
    return false;
  }
}

/** Ẩn/hiện status bar + navigation bar (immersive) trên APK Android.
 * Trả về true nếu lệnh native đã gửi thành công (để UI chẩn đoán/fallback). */
export async function setImmersiveMode(enabled: boolean): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    await NativeVideoPlayer.setImmersive({ enabled });
    return true;
  } catch (err) {
    try { console.warn('[Immersive] setImmersiveMode failed', err); } catch {}
    return false;
  }
}

export async function playInNativeExoPlayer(options: {
  url: string;
  drmKey?: string;
  title?: string;
  userAgent?: string;
}): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await NativeVideoPlayer.play({
        url: options.url,
        drmKey: options.drmKey || '',
        title: options.title || 'Livestream TV',
        userAgent: options.userAgent || 'Dalvik/2.1.0'
      });
      return true;
    } catch (err) {
      void 0;
      alert('Lỗi khởi chạy ExoPlayer Native: ' + (err as Error).message);
      return false;
    }
  } else {
    alert('ExoPlayer Native chỉ hoạt động trên ứng dụng Android (file APK).');
  }
  return false;
}

export async function playInExternalPlayer(options: {
  url: string;
}): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await NativeVideoPlayer.playExternal({
        url: options.url
      });
      return true;
    } catch (err) {
      void 0;
      alert('Lỗi mở ứng dụng ngoài: ' + (err as Error).message);
      return false;
    }
  } else {
    window.open(options.url, '_blank');
  }
  return false;
}

export default NativeVideoPlayer;
