import React from 'react';
import { BrowserRouter, HashRouter } from 'react-router';
import { Capacitor } from '@capacitor/core';

/**
 * Router cho từng nền tảng:
 * - Web: BrowserRouter (URL đẹp /movie/slug, cần SPA fallback phía server — đã có).
 * - Native (APK/TV file:// sau này): HashRouter (không phụ thuộc server).
 */
export const AppRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }
  if (native) return <HashRouter>{children}</HashRouter>;
  return <BrowserRouter>{children}</BrowserRouter>;
};
