import React from 'react';
import { MonitorSmartphone, LogOut, RefreshCw, Clock } from 'lucide-react';
import type { Account } from '../types';
import type { SessionSlot } from '../services/sessionService';

interface SessionBlockedScreenProps {
  account: Account;
  sessions: SessionSlot[];
  /** true khi lỗi kết nối/timeout RTDB (thay vì hết slot) */
  timeout: boolean;
  /** true khi bị chặn vì máy đã mở tab khác (1 máy 1 tab, kiểu Netflix) */
  tabLimit?: boolean;
  retrying: boolean;
  onRetry: () => void;
  onLogout: () => void;
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return '';
  }
}

export const SessionBlockedScreen: React.FC<SessionBlockedScreenProps> = ({
  account,
  sessions,
  timeout,
  tabLimit,
  retrying,
  onRetry,
  onLogout,
}) => {
  return (
    <div className="min-h-screen w-full bg-[#070b16] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400 mb-5 shadow-xl">
        <MonitorSmartphone className="w-8 h-8" />
      </div>
      {timeout ? (
        <>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Hệ thống đang quá tải
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Hệ thống đang có quá nhiều người truy cập. Vui lòng thử lại sau ít phút.
          </p>
        </>
      ) : tabLimit ? (
        <>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Đã mở ở tab khác
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Có vẻ bạn đang mở Gấu Cinema trên nhiều tab cùng lúc. Mỗi máy chỉ dùng
            được 1 tab tại 1 thời điểm — hãy đóng tab kia rồi bấm Thử lại.
            Bạn vẫn đang đăng nhập, không cần nhập mật khẩu.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Thiết bị vượt giới hạn
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Tài khoản <strong className="text-slate-200">@{account.username}</strong> đang được sử
            dụng trên {sessions.length > 0 ? sessions.length : 2} thiết bị khác. Mỗi tài khoản chỉ dùng được tối đa 2 thiết bị cùng lúc.
          </p>
          {sessions.length > 0 && (
            <div className="w-full max-w-md space-y-2 mb-6">
              {sessions.map((s, idx) => (
                <div
                  key={`${s.deviceId}-${idx}`}
                  className="bg-[#0f172a] border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3 text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-sky-950/80 border border-sky-800/60 flex items-center justify-center text-sky-400 shrink-0">
                    <MonitorSmartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">
                      {s.deviceInfo}
                      {s.profileName ? ` • ${s.profileName}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Bắt đầu: {formatTime(s.startedAt)}</span>
                    </p>
                    {s.title && (
                      <p className="text-[11px] text-sky-400 truncate mt-0.5">
                        Đang {s.kind === 'manga' ? 'đọc' : 'xem'}: {s.title}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!tabLimit && (
            <p className="text-[11px] text-slate-500 max-w-md mb-6">
              Tắt app trên 1 thiết bị kia rồi bấm Thử lại — không cần nhập mật khẩu.
              Bạn vẫn đang đăng nhập, không bị đăng xuất.
              {sessions.length < 2 && (
                <> Có vẻ đã trống slot — cứ bấm Thử lại là vào ngay.</>
              )}
            </p>
          )}
        </>
      )}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={onRetry}
          disabled={retrying}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Đang thử lại...' : 'Thử lại'}</span>
        </button>
        {/* Tab-limit: ẩn Đăng xuất vì Auth dùng chung mọi tab — đăng xuất ở tab
            này sẽ đá luôn tab đang xem dở. Đóng tab kia rồi Thử lại là đủ. */}
        {!tabLimit && (
          <button
            onClick={onLogout}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        )}
      </div>
    </div>
  );
};
