import React from 'react';
import { ArrowDownToLine, RefreshCw, WifiOff, X, ShieldAlert } from 'lucide-react';
import type { AppVersionInfo } from '../services/appUpdateService';

interface AppUpdateGateProps {
  mode: 'forced' | 'optional' | 'offline';
  info?: AppVersionInfo;
  checking: boolean;
  onRetry: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Prompt 7 PHẦN B3/B4 + A2: 3 mức — bắt buộc (chặn toàn trang), tùy chọn
 * (modal 2 nút), mất kết nối (màn hình lỗi + Thử lại). Chỉ render ở bản native.
 */
export const AppUpdateGate: React.FC<AppUpdateGateProps> = ({
  mode,
  info,
  checking,
  onRetry,
  onUpdate,
  onDismiss,
}) => {
  if (mode === 'offline') {
    return (
      <div className="min-h-screen w-full bg-[#070b16] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400 mb-5 shadow-xl">
          <WifiOff className="w-8 h-8" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Không kết nối được máy chủ
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
          Kiểm tra mạng rồi thử lại.
        </p>
        <button
          onClick={onRetry}
          disabled={checking}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          <span>{checking ? 'Đang thử lại...' : 'Thử lại'}</span>
        </button>
      </div>
    );
  }

  if (mode === 'forced') {
    return (
      <div className="min-h-screen w-full bg-[#070b16] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400 mb-5 shadow-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Cần cập nhật app
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-2 leading-relaxed">
          Bản đang dùng đã quá cũ, không dùng tiếp được. Tải bản mới
          {info?.latestVersionName ? ` (${info.latestVersionName})` : ''} để tiếp tục.
        </p>
        {info?.releaseNotes && (
          <p className="text-[11px] text-slate-500 max-w-md mb-4 leading-relaxed">
            {info.releaseNotes}
          </p>
        )}
        <button
          onClick={onUpdate}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 mb-4"
        >
          <ArrowDownToLine className="w-4 h-4" />
          <span>Tải bản mới</span>
        </button>
        <p className="text-[11px] text-slate-600 max-w-md leading-relaxed">
          Trình duyệt sẽ tải file APK, bấm vào file là Android hiện hộp thoại cài đặt.
          Nếu Android chặn, vào Cài đặt {'>'} Ứng dụng {'>'} Cài đặt ứng dụng không rõ
          nguồn gốc và cho phép trình duyệt.
        </p>
      </div>
    );
  }

  // optional: modal phủ, 2 nút
  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-sky-950/80 border border-sky-800/60 flex items-center justify-center text-sky-400 mx-auto mb-4">
          <ArrowDownToLine className="w-7 h-7" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
          Có bản mới{info?.latestVersionName ? ` (${info.latestVersionName})` : ''}
        </h2>
        {info?.releaseNotes ? (
          <p className="text-xs text-slate-400 leading-relaxed mb-6">{info.releaseNotes}</p>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Cập nhật để dùng các tính năng mới nhất.
          </p>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onUpdate}
            className="w-full sm:w-auto flex-1 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>Cập nhật ngay</span>
          </button>
          <button
            onClick={onDismiss}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>Để sau</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
          File APK tải qua trình duyệt. Nếu Android chặn cài đặt, cho phép “ứng dụng
          không rõ nguồn gốc” cho trình duyệt.
        </p>
      </div>
    </div>
  );
};
