import React from 'react';
import { Clapperboard, RefreshCw, X } from 'lucide-react';
import type { PlaybackLock } from '../services/sessionService';

interface PlaybackBlockedModalProps {
  /** Tên phim tập tab này vừa bấm phát nhưng bị chặn */
  wantedTitle: string;
  /** Lock đang giữ bởi tab khác (nếu đọc được) */
  holder?: PlaybackLock;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * Chặn phát kiểu Netflix D7020: duyệt bao nhiêu tab tùy thích, nhưng 1 máy
 * chỉ 1 tab phát tại 1 thời điểm. Tab bấm phát sau ăn màn hình này.
 */
export const PlaybackBlockedModal: React.FC<PlaybackBlockedModalProps> = ({
  wantedTitle,
  holder,
  retrying,
  onRetry,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 text-center">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400 mx-auto mb-4">
          <Clapperboard className="w-7 h-7" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
          Tab khác đang phát
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-1">
          Có vẻ bạn đang phát trên nhiều tab cùng lúc. Mỗi máy chỉ phát được 1
          luồng tại 1 thời điểm — hãy tắt player ở tab kia rồi bấm Thử lại.
        </p>
        {holder?.title && (
          <p className="text-xs text-sky-400 truncate mb-1">
            Đang phát{holder.profileName ? ` (${holder.profileName})` : ''}: {holder.title}
          </p>
        )}
        <p className="text-[11px] text-slate-500 truncate mb-6">
          Bạn vừa mở: {wantedTitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onRetry}
            disabled={retrying}
            className="w-full sm:w-auto flex-1 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs tracking-wide shadow-lg shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? 'Đang thử lại...' : 'Thử lại'}</span>
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>Đóng</span>
          </button>
        </div>
      </div>
    </div>
  );
};
