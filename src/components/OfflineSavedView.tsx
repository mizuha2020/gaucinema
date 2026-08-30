import React, { useEffect, useState, useMemo } from 'react';
import { Account, UserProfile, Movie } from '../types';
import { offlineMovieService, OfflineSavedMovie, OFFLINE_TTL_MS } from '../services/offlineMovieService';
import { getImageUrl } from '../services/movieApi';
import { Capacitor } from '@capacitor/core';
import {
  Download,
  Trash2,
  Play,
  Clock,
  AlertTriangle,
  Info,
  Film,
  Calendar,
  HardDrive,
} from 'lucide-react';

interface OfflineSavedViewProps {
  currentAccount: Account | null;
  activeProfile: UserProfile | null;
  onPlayMovie: (movie: Movie) => void;
  onOpenDetail: (movie: Movie) => void;
  onShowToast?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

export const OfflineSavedView: React.FC<OfflineSavedViewProps> = ({
  currentAccount,
  activeProfile,
  onPlayMovie,
  onOpenDetail,
  onShowToast,
}) => {
  const isNative = useMemo(() => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  }, []);

  const [savedList, setSavedList] = useState<OfflineSavedMovie[]>([]);
  const [now, setNow] = useState(Date.now());

  // Load + subscribe + cleanup expired + ticker for countdown
  useEffect(() => {
    if (!currentAccount || !activeProfile) {
      setSavedList([]);
      return;
    }
    // cleanup expired on mount
    const expired = offlineMovieService.cleanupExpired(currentAccount.id, activeProfile.id);
    if (expired > 0) {
      onShowToast?.(`Đã tự động xóa ${expired} phim hết hạn 7 ngày`, 'info');
    }
    setSavedList(offlineMovieService.getAll(currentAccount.id, activeProfile.id));

    const unsub = offlineMovieService.subscribe(currentAccount.id, activeProfile.id, setSavedList);

    // Re-cleanup mỗi 60s + update countdown
    const interval = setInterval(() => {
      setNow(Date.now());
      const c = offlineMovieService.cleanupExpired(currentAccount.id, activeProfile.id);
      if (c > 0) {
        onShowToast?.(`Đã xóa ${c} phim hết hạn`, 'info');
        setSavedList(offlineMovieService.getAll(currentAccount.id, activeProfile.id));
      }
    }, 60 * 1000);

    // countdown tick mỗi giây để hiển thị còn lại chính xác
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      unsub();
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [currentAccount?.id, activeProfile?.id]);

  const handleRemove = (slug: string, name: string) => {
    if (!currentAccount || !activeProfile) return;
    offlineMovieService.remove(currentAccount.id, activeProfile.id, slug);
    onShowToast?.(`Đã xóa "${name}" khỏi Đã lưu`, 'info');
  };

  const handleClearAll = () => {
    if (!currentAccount || !activeProfile) return;
    if (savedList.length === 0) return;
    offlineMovieService.clearAll(currentAccount.id, activeProfile.id);
    onShowToast?.('Đã xóa toàn bộ danh sách offline', 'info');
  };

  const handlePlay = (item: OfflineSavedMovie) => {
    const movie: Movie = item.movieSnapshot || {
      name: item.name,
      slug: item.slug,
      origin_name: item.origin_name,
      poster_url: item.poster_url,
      thumb_url: item.thumb_url,
      year: item.year,
      quality: item.quality,
      lang: item.lang,
      episode_current: item.episode_current,
    };
    onPlayMovie(movie);
  };

  const handleOpenDetail = (item: OfflineSavedMovie) => {
    const movie: Movie = item.movieSnapshot || {
      name: item.name,
      slug: item.slug,
      origin_name: item.origin_name,
      poster_url: item.poster_url,
      thumb_url: item.thumb_url,
      year: item.year,
      quality: item.quality,
      lang: item.lang,
      episode_current: item.episode_current,
    };
    onOpenDetail(movie);
  };

  // Nếu không phải native app thì không hiện gì (theo yêu cầu: web không hiện)
  if (!isNative) {
    return null;
  }

  if (!currentAccount || !activeProfile) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10 text-center text-slate-400">
        Vui lòng chọn hồ sơ để xem danh sách đã lưu.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-amber-400" />
            </div>
            <span>Đã Lưu Offline</span>
            <span className="text-sm font-bold text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
              {savedList.length}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Danh sách phim đã tải để xem offline trên App • Hồ sơ: <span className="text-sky-300 font-semibold">{activeProfile.name}</span>
          </p>
        </div>
        {savedList.length > 0 && (
          <button
            onClick={handleClearAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800 text-xs font-bold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa tất cả</span>
          </button>
        )}
      </div>

      {/* Thông báo 7 ngày */}
      <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl bg-amber-950/30 border border-amber-800/60 text-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm leading-relaxed">
          <span className="font-bold">Lưu ý:</span> Mỗi phim chỉ được lưu <span className="font-black text-amber-300">7 ngày</span> kể từ lúc bấm <span className="inline-flex items-center gap-1 bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-200 border border-amber-700/60"><Download className="w-3 h-3" /> Tải xem Offline</span>. Sau 7 ngày hệ thống sẽ <span className="font-bold">tự động xóa</span> để tiết kiệm bộ nhớ máy. Bạn có thể tải lại bất kỳ lúc nào.
        </div>
      </div>

      {/* Empty state */}
      {savedList.length === 0 ? (
        <div className="py-16 text-center bg-[#0f172a] border border-slate-800 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Film className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-base font-bold text-white">Chưa có phim nào được lưu offline</h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Mở chi tiết phim và bấm nút <span className="text-amber-300 font-semibold">Tải xem Offline</span> (chỉ hiện trên App) để lưu phim. Phim sẽ hiện ở đây và có thể xem lại ngay cả khi mạng yếu.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {savedList.map((item) => {
            const remainingMs = Math.max(0, item.expiresAt - now);
            const pct = Math.max(0, Math.min(100, ((OFFLINE_TTL_MS - remainingMs) / OFFLINE_TTL_MS) * 100));
            const isExpiringSoon = remainingMs < 24 * 60 * 60 * 1000; // <1 ngày
            return (
              <div
                key={item.slug}
                className="group bg-[#0f172a] border border-slate-800 hover:border-amber-500/40 rounded-2xl overflow-hidden shadow-lg flex flex-col transition-all"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
                  <img
                    src={getImageUrl(item.poster_url || item.thumb_url)}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                  {/* Top badge remaining */}
                  <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md ${isExpiringSoon ? 'bg-red-950/80 text-red-300 border-red-800' : 'bg-amber-950/70 text-amber-300 border-amber-700/60'}`}>
                    <Clock className="w-3 h-3" />
                    <span>{offlineMovieService.formatRemaining(remainingMs)}</span>
                  </div>

                  {/* Play overlay */}
                  <button
                    onClick={() => handlePlay(item)}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity cursor-pointer"
                  >
                    <span className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/30">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </span>
                  </button>

                  {/* Progress bar 7 days */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                    <div
                      className={`h-full transition-all ${isExpiringSoon ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${100 - pct}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 flex flex-col flex-1 gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-300">{item.name}</h4>
                    {item.origin_name && (
                      <p className="text-xs text-slate-400 truncate">{item.origin_name}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {item.year && (
                      <span className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        <Calendar className="w-3 h-3" /> {item.year}
                      </span>
                    )}
                    {item.quality && (
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300 font-semibold">{item.quality}</span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    <span>Lưu: {new Date(item.savedAt).toLocaleDateString('vi-VN')} • Hết hạn: {new Date(item.expiresAt).toLocaleDateString('vi-VN')}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 mt-auto">
                    <button
                      onClick={() => handlePlay(item)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Xem lại</span>
                    </button>
                    <button
                      onClick={() => handleOpenDetail(item)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
                    >
                      Chi tiết
                    </button>
                    <button
                      onClick={() => handleRemove(item.slug, item.name)}
                      className="p-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800 cursor-pointer"
                      title="Xóa khỏi Đã lưu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
