import type { CapacitorConfig } from '@capacitor/cli';

// Prompt 7 PHẦN A1: URL production cho tầng web (đọc từ ENV lúc `npx cap sync`,
// KHÔNG hardcode). Có URL -> APK tải web từ server mỗi lần mở: sửa web chỉ cần
// deploy server, không cài lại APK. Không có URL (dev) -> dùng webDir nhúng
// như cũ, mọi thứ giữ nguyên.
const remoteUrl = (process.env.CAPACITOR_SERVER_URL || '').trim();

const config: CapacitorConfig = {
  appId: 'com.qtbcinema.app',
  appName: 'Gấu Cinema HD',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(remoteUrl ? { url: remoteUrl } : {}),
    cleartext: remoteUrl ? false : true,
    allowNavigation: ['*']
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0F0F0F',
      style: 'DARK',
    },
  },
};

export default config;
