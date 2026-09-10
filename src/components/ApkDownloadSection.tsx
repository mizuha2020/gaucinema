import React from 'react';
import { Download, Tv } from 'lucide-react';
import { getApkDownloadUrl } from '../utils/apkDownload';

/**
 * Mục tải APK cho TV/box. Dùng ở LoginScreen (người chưa login cần nhất)
 * và menu tài khoản Navbar.
 */
export const ApkDownloadSection: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const url = getApkDownloadUrl();
  if (compact) {
    return (
      <a
        id="apk-download-link-menu"
        href={url}
        download
        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-200 transition-colors cursor-pointer border border-emerald-900/40"
      >
        <Tv className="w-4 h-4 text-emerald-400" />
        <span>Tải app cho TV (APK)</span>
      </a>
    );
  }
  return (
    <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-center">
      <div className="flex items-center justify-center gap-2 text-emerald-300">
        <Tv className="w-5 h-5" />
        <h2 className="text-sm font-bold text-white">Xem trên TV / Android Box?</h2>
      </div>
      <p className="text-xs text-slate-400 mt-1 mb-3">
        Tải file APK về rồi chép qua TV cài đặt — bản mới nhất tự build mỗi khi có cập nhật.
      </p>
      <a
        id="apk-download-link"
        href={url}
        download
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>Tải APK cho TV</span>
      </a>
    </div>
  );
};
