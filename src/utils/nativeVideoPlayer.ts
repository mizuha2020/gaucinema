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
  enterPip(): Promise<void>;
  setVideoPlaying(options: { playing: boolean }): Promise<void>;
  isPipSupported(): Promise<{ supported: boolean }>;
  isNativeSupported(): Promise<{ supported: boolean }>;
}

const NativeVideoPlayer = registerPlugin<NativeVideoPlayerPlugin>('NativeVideoPlayer');

export async function enterNativePip(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await NativeVideoPlayer.enterPip();
      return true;
    } catch (err) {
      console.warn('[NativeVideoPlayer] Failed to enter native PiP:', err);
      return false;
    }
  }
  return false;
}

export async function setNativeVideoPlaying(playing: boolean): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await NativeVideoPlayer.setVideoPlaying({ playing });
    } catch (err) {
      console.warn('[NativeVideoPlayer] Failed to set video playing flag:', err);
    }
  }
}

export async function checkNativePipSupported(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const res = await NativeVideoPlayer.isPipSupported();
      return !!res.supported;
    } catch (err) {
      return false;
    }
  }
  return false;
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
      console.error('[NativeVideoPlayer] Failed to launch ExoPlayer:', err);
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
      console.error('[NativeVideoPlayer] Failed to launch External Player:', err);
      alert('Lỗi mở ứng dụng ngoài: ' + (err as Error).message);
      return false;
    }
  } else {
    window.open(options.url, '_blank');
  }
  return false;
}

export default NativeVideoPlayer;
