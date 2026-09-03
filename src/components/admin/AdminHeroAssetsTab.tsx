import React, { useState, useEffect } from 'react';
import { Movie, HeroImageOption } from '../../types';
import { getHeroAdminList, selectHeroAsset } from '../../services/movieApi';
import {
  Image,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Layers,
  Eye,
  Star,
  Film,
  Zap,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AdminHeroAssetsTabProps {
  onShowToast: (msg: string) => void;
  onRefreshBatch?: () => void;
  isSyncingBatch?: boolean;
}

export const AdminHeroAssetsTab: React.FC<AdminHeroAssetsTabProps> = ({
  onShowToast,
  onRefreshBatch,
  isSyncingBatch = false,
}) => {
  const [heroMovies, setHeroMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [updatingAsset, setUpdatingAsset] = useState<string | null>(null);
  const [previewMovieSlug, setPreviewMovieSlug] = useState<string | null>(null);

  const fetchHeroList = async () => {
    setIsLoading(true);
    try {
      const res = await getHeroAdminList();
      if (res.success && res.items) {
        setHeroMovies(res.items);
      } else {
        onShowToast('⚠️ Không thể tải danh sách phim Hero Banner');
      }
    } catch {
      onShowToast('⚠️ Lỗi khi tải danh sách phim Hero Banner');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHeroList();
  }, []);

  const handleSelectAsset = async (slug: string, assetType: 'backdrop' | 'logo', selectedUrl: string) => {
    const assetKey = `${slug}-${assetType}-${selectedUrl}`;
    setUpdatingAsset(assetKey);
    try {
      const res = await selectHeroAsset(slug, assetType, selectedUrl);
      if (res.success && res.movie) {
        setHeroMovies((prev) =>
          prev.map((m) => (m.slug === slug ? { ...m, ...res.movie } : m))
        );
        onShowToast(`✅ ${res.message || `Đã đổi ${assetType} chính thành công!`}`);
      } else {
        onShowToast(`⚠️ ${res.error || 'Lỗi cập nhật ảnh'}`);
      }
    } catch (e: any) {
      onShowToast(`⚠️ Lỗi: ${e.message}`);
    } finally {
      setUpdatingAsset(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Overview */}
      <div className="bg-[#0f172a] border border-blue-900/60 p-5 sm:p-6 rounded-3xl shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-900 to-blue-900 border border-indigo-700 flex items-center justify-center text-indigo-300 shrink-0 shadow-lg shadow-indigo-950">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Quản Lý 3 Backdrop & 3 Logo Hero Banner</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-950 text-sky-300 border border-blue-800">
                  {heroMovies.length} Phim
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mỗi phim khi chạy Batch được tự động crawl 3 Backdrop 4K và 3 Logo TMDB trong suốt. Ảnh có cờ{' '}
                <span className="text-emerald-400 font-semibold font-mono">primary = true</span> sẽ hiển thị trên Hero Banner toàn hệ thống.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onRefreshBatch && (
              <button
                onClick={onRefreshBatch}
                disabled={isSyncingBatch}
                className="flex items-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${isSyncingBatch ? 'animate-spin' : ''}`} />
                <span>{isSyncingBatch ? 'Đang Batch Sync...' : 'Chạy Lại Batch TMDB'}</span>
              </button>
            )}

            <button
              onClick={fetchHeroList}
              disabled={isLoading}
              className="flex items-center gap-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl border border-slate-700 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Tải Lại Danh Sách</span>
            </button>
          </div>
        </div>

        {/* Quick Legend Tips */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs">
          <div className="bg-[#131f37] p-3 rounded-2xl border border-slate-800/80 flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></span>
            <span className="text-slate-300 font-medium">
              <strong className="text-emerald-300">Primary = True</strong>: Hiển thị mặc định trên trang chủ
            </span>
          </div>
          <div className="bg-[#131f37] p-3 rounded-2xl border border-slate-800/80 flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400"></span>
            <span className="text-slate-300 font-medium">
              <strong className="text-sky-300">Auto Edge Sync</strong>: Cập nhật tức thì vào Firebase RTDB
            </span>
          </div>
          <div className="bg-[#131f37] p-3 rounded-2xl border border-slate-800/80 flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400"></span>
            <span className="text-slate-300 font-medium">
              <strong className="text-indigo-300">TMDB Textless</strong>: Ưu tiên ảnh chuẩn 4K không dính chữ
            </span>
          </div>
        </div>
      </div>

      {/* Movies List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-[#0f172a] border border-blue-900/60 rounded-3xl space-y-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Đang tải danh sách tài nguyên Hero Banner...</p>
        </div>
      ) : heroMovies.length === 0 ? (
        <div className="text-center p-12 bg-[#0f172a] border border-blue-900/60 rounded-3xl space-y-3">
          <Film className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">Chưa có dữ liệu Hero Banner</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Hệ thống chưa tìm thấy dữ liệu cache Hero Banner trong Firebase RTDB. Vui lòng bấm &quot;Chạy Lại Batch TMDB&quot; ở trên để tạo.
          </p>
          {onRefreshBatch && (
            <button
              onClick={onRefreshBatch}
              className="mt-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl cursor-pointer"
            >
              Kích Hoạt Batch Crawl Ngay
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {heroMovies.map((movie, index) => {
            const backdropsList: HeroImageOption[] = Array.isArray(movie.backdrops) && movie.backdrops.length > 0
              ? movie.backdrops
              : movie.backdrop_url
              ? [{ url: movie.backdrop_url, primary: true }]
              : [];

            const logosList: HeroImageOption[] = Array.isArray(movie.logos) && movie.logos.length > 0
              ? movie.logos
              : movie.logo_url
              ? [{ url: movie.logo_url, primary: true }]
              : [];

            const activeBackdrop = backdropsList.find((b) => b.primary)?.url || movie.backdrop_url;
            const activeLogo = logosList.find((l) => l.primary)?.url || movie.logo_url;
            const isPreviewOpen = previewMovieSlug === movie.slug;

            return (
              <div
                key={movie.slug || index}
                className="bg-[#0f172a] border border-slate-800 hover:border-slate-700 p-5 sm:p-6 rounded-3xl shadow-xl space-y-5 transition-all"
              >
                {/* Movie Header Info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-black text-slate-300 shrink-0">
                      #{index + 1}
                    </span>
                    <img
                      src={movie.poster_url || movie.thumb_url}
                      alt={movie.name}
                      className="w-12 h-16 rounded-xl object-cover border border-slate-700 shrink-0 shadow-md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-white truncate max-w-[280px] sm:max-w-md">
                          {movie.name}
                        </h4>
                        {movie.year && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                            {movie.year}
                          </span>
                        )}
                        {movie.quality && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-950 text-sky-400 border border-blue-800">
                            {movie.quality}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {movie.origin_name || 'Không có tên gốc'} • Slug:{' '}
                        <span className="font-mono text-slate-300">{movie.slug}</span>
                        {movie.tmdb?.id && (
                          <span className="ml-2 text-amber-400 font-mono">TMDB ID: {movie.tmdb.id}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreviewMovieSlug(isPreviewOpen ? null : movie.slug)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                        isPreviewOpen
                          ? 'bg-sky-950 text-sky-300 border-sky-700'
                          : 'bg-slate-800/80 text-slate-300 hover:text-white border-slate-700'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isPreviewOpen ? 'Đóng Xem Thử' : 'Xem Thử Banner'}</span>
                      {isPreviewOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Live Banner Preview Box (Collapsible) */}
                {isPreviewOpen && (
                  <div className="relative w-full h-56 sm:h-72 rounded-2xl overflow-hidden border border-indigo-900/80 shadow-2xl bg-[#070b16] select-none animate-in fade-in zoom-in-95 duration-200">
                    {activeBackdrop ? (
                      <img
                        src={activeBackdrop}
                        alt="Preview Backdrop"
                        className="absolute inset-0 w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                        Chưa có backdrop
                      </div>
                    )}
                    {/* Gradients */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#070b16] via-[#070b16]/75 via-40% to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070b16] via-transparent to-transparent" />

                    <div className="relative z-10 h-full p-5 sm:p-6 flex flex-col justify-end max-w-lg space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                        <Sparkles className="w-3 h-3" />
                        <span>LIVE BANNER PREVIEW</span>
                      </div>
                      {activeLogo ? (
                        <img
                          src={activeLogo}
                          alt="Preview Logo"
                          className="max-h-12 sm:max-h-16 w-auto object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
                        />
                      ) : (
                        <h2 className="text-xl sm:text-2xl font-black text-white drop-shadow-md">
                          {movie.name}
                        </h2>
                      )}
                      <p className="text-xs text-slate-300 line-clamp-2 drop-shadow">
                        {movie.content
                          ? movie.content.replace(/<[^>]*>?/gm, '')
                          : movie.origin_name}
                      </p>
                    </div>
                  </div>
                )}

                {/* SECTION 1: 3 CANDIDATE BACKDROPS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-sky-400" />
                      <span>Backdrop Tùy Chọn ({backdropsList.length}/3)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Chọn ảnh để đặt cờ <code className="text-emerald-400 font-mono">primary = true</code>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {backdropsList.map((bd, bIdx) => {
                      const isUpdating = updatingAsset === `${movie.slug}-backdrop-${bd.url}`;
                      const isPrimary = Boolean(bd.primary);

                      return (
                        <div
                          key={bIdx}
                          className={`relative rounded-2xl overflow-hidden border transition-all ${
                            isPrimary
                              ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/20'
                              : 'border-slate-800 hover:border-slate-600 bg-slate-900/50'
                          }`}
                        >
                          {/* Image preview */}
                          <div className="relative h-32 sm:h-36 w-full bg-slate-950 overflow-hidden">
                            <img
                              src={bd.url}
                              alt={`Backdrop ${bIdx + 1}`}
                              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              loading="lazy"
                            />
                            {/* Primary Badge */}
                            {isPrimary && (
                              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-bold text-[10px] shadow-lg shadow-emerald-900/50">
                                <Check className="w-3 h-3 stroke-[3]" />
                                <span>CHÍNH (PRIMARY)</span>
                              </div>
                            )}

                            {/* Meta info badge */}
                            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-slate-300 font-mono backdrop-blur-sm">
                              {bd.width ? `${bd.width}x${bd.height}` : '4K'}
                              {bd.vote_average ? ` • ⭐ ${bd.vote_average.toFixed(1)}` : ''}
                            </div>
                          </div>

                          {/* Footer Action */}
                          <div className="p-2.5 flex items-center justify-between gap-2 bg-[#0c1427]">
                            <span className="text-[11px] text-slate-400 font-medium truncate">
                              Tùy chọn #{bIdx + 1}
                            </span>

                            {isPrimary ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Đang Dùng</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSelectAsset(movie.slug, 'backdrop', bd.url)}
                                disabled={isUpdating}
                                className="flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                {isUpdating ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Star className="w-3 h-3" />
                                )}
                                <span>Chọn Làm Chính</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: 3 CANDIDATE LOGOS */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Logo PNG Trong Suốt Tùy Chọn ({logosList.length}/3)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Hiển thị sắc nét trên nền Banner tối
                    </span>
                  </div>

                  {logosList.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                      Phim này không có logo PNG trong suốt trên TMDB (Hệ thống sẽ hiển thị tiêu đề chữ nổi tương phản).
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {logosList.map((lg, lIdx) => {
                        const isUpdating = updatingAsset === `${movie.slug}-logo-${lg.url}`;
                        const isPrimary = Boolean(lg.primary);

                        return (
                          <div
                            key={lIdx}
                            className={`relative rounded-2xl overflow-hidden border transition-all ${
                              isPrimary
                                ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-950/20'
                                : 'border-slate-800 hover:border-slate-600 bg-slate-900/50'
                            }`}
                          >
                            {/* Logo preview in dark box with grid pattern */}
                            <div className="relative h-24 sm:h-28 w-full bg-[#070b16] p-4 flex items-center justify-center overflow-hidden">
                              <img
                                src={lg.url}
                                alt={`Logo ${lIdx + 1}`}
                                className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                                loading="lazy"
                              />

                              {/* Primary Badge */}
                              {isPrimary && (
                                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500 text-white font-bold text-[10px] shadow-lg shadow-indigo-900/50">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  <span>LOGO CHÍNH</span>
                                </div>
                              )}

                              {/* Lang badge */}
                              {lg.iso_639_1 && (
                                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-sky-300 font-mono uppercase">
                                  {lg.iso_639_1}
                                </div>
                              )}
                            </div>

                            {/* Footer Action */}
                            <div className="p-2.5 flex items-center justify-between gap-2 bg-[#0c1427]">
                              <span className="text-[11px] text-slate-400 font-medium truncate">
                                Logo #{lIdx + 1} {lg.width ? `(${lg.width}px)` : ''}
                              </span>

                              {isPrimary ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Đang Dùng</span>
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleSelectAsset(movie.slug, 'logo', lg.url)}
                                  disabled={isUpdating}
                                  className="flex items-center gap-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdating ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Star className="w-3 h-3" />
                                  )}
                                  <span>Chọn Làm Chính</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
