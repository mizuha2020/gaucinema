import { registerPlugin, Capacitor } from '@capacitor/core';

export interface NativeVideoPlayerPlugin {
  play(options: {
    url: string;
    drmKey?: string;
    title?: string;
    userAgent?: string;
  }): Promise<void>;
  isNativeSupported(): Promise<{ supported: boolean }>;
}

const NativeVideoPlayer = registerPlugin<NativeVideoPlayerPlugin>('NativeVideoPlayer');

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
      return false;
    }
  }
  return false;
}

export default NativeVideoPlayer;
