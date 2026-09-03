import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MangaItem, getFallbackMangaImageUrl } from '../../services/mangaApi';
import { BookOpen, Info, Bookmark, Check, ChevronLeft, ChevronRight, Sparkles, Star, Flame, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MangaSourceBadge } from './MangaSourceBadge';

interface MangaHeroBannerProps {
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
  onRead?: (manga: MangaItem) => void;
  onToggleSave?: (manga: MangaItem) => void;
  isSaved?: (id: string) => boolean;
}

export const MangaHeroBanner: React.FC<MangaHeroBannerProps> = ({
  mangas,
  onOpenDetail,
  onRead,
  onToggleSave,
  isSaved,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!mangas || mangas.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(mangas.length, 5));
    }, 7500);
  }, [mangas]);

  useEffect(() => {
    resetInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resetInterval]);

  if (!mangas || mangas.length === 0) {
    return (
      <div className="relative w-full h-[62vh] min-h-[480px] max-h-[680px] bg-[#0b0c16] overflow-hidden flex items-end p-6 sm:p-10 lg:p-12 rounded-[2rem] border border-white/5">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c16] via-[#0b0c16]/50 to-transparent z-10" />
        <div className="relative z-20 space-y-4 max-w-2xl w-full animate-pulse">
          <div className="h-6 w-36 bg-purple-900/40 rounded-full" />
          <div className="h-10 sm:h-14 w-3/4 bg-white/10 rounded-2xl" />
          <div className="h-4 w-full bg-white/5 rounded-lg" />
          <div className="h-4 w-2/3 bg-white/5 rounded-lg" />
          <div className="flex gap-3 pt-4">
            <div className="h-12 w-36 bg-purple-600/30 rounded-xl" />
            <div className="h-12 w-36 bg-white/5 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const current = mangas[currentIndex] || mangas[0];
  const saved = isSaved ? isSaved(current.id) : false;

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const touchEndYRef = useRef<number | null>(null);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? Math.min(mangas.length, 5) - 1 : prev - 1));
    resetInterval();
  };
  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % Math.min(mangas.length, 5));
    resetInterval();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchEndXRef.current = e.touches[0].clientX;
    touchEndYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return;
    touchEndXRef.current = e.touches[0].clientX;
    touchEndYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;

    const deltaX = touchStartXRef.current - touchEndXRef.current;
    const deltaY = touchStartYRef.current !== null && touchEndYRef.current !== null
      ? Math.abs(touchStartYRef.current - touchEndYRef.current)
      : 0;

    const minSwipeDistance = 35;

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY * 1.1) {
      if (deltaX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchEndXRef.current = null;
    touchEndYRef.current = null;
  };

  return (
    <div
      id="manga-hero-banner"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
      className="relative w-full h-[62vh] min-h-[480px] max-h-[680px] bg-[#0b0c16] overflow-hidden rounded-[2rem] border border-purple-900/30 shadow-2xl select-none touch-pan-y"
    >
      {/* Background with fade */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id || currentIndex}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          <img
            src={current.coverUrl}
            alt={current.title}
            className="w-full h-full object-cover object-center scale-100"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              t.src = getFallbackMangaImageUrl(current.coverUrl, t.src);
            }}
          />
          {/* Cinematic gradients - purple theme */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c16] via-[#0b0c16]/85 to-transparent w-full md:w-[72%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c16] via-[#0b0c16]/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-fuchsia-900/10" />
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-[#070710]/80 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 h-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 flex flex-col justify-end pb-8 sm:pb-12">
        <div className="max-w-2xl space-y-3 sm:space-y-4">
          {/* Badges */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase shadow-lg shadow-purple-600/30">
              <Sparkles className="w-3 h-3 text-purple-100" /> Gấu ĐỀ XUẤT
            </span>
            {current.status && (
              <span className="bg-black/50 backdrop-blur border border-white/10 text-purple-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                {current.status}
              </span>
            )}
            {current.source && <MangaSourceBadge source={current.source} size="sm" />}
            {current.genres?.slice(0, 1).map((g) => (
              <span key={g} className="hidden sm:inline-flex bg-white/10 border border-white/10 text-white/90 px-2.5 py-1 rounded-full text-xs">
                {g}
              </span>
            ))}
          </div>

          <h1 className="text-[26px] sm:text-4xl md:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)] line-clamp-2">
            {current.title}
          </h1>
          {current.altTitles && current.altTitles[0] && (
            <p className="text-sm text-white/60 line-clamp-1 hidden sm:block">{current.altTitles[0]}</p>
          )}
          <p className="text-sm text-white/70 leading-relaxed line-clamp-2 max-w-xl hidden sm:block">
            {current.description
              ? current.description.replace(/<[^>]*>/g, '').slice(0, 160) + '...'
              : `Khám phá "${current.title}" — một trong những tựa manga nổi bật được yêu thích nhất trên Gấu Manga. Cập nhật chương mới mỗi ngày.`}
          </p>
          {current.authors && current.authors[0] && (
            <p className="text-xs text-white/50 flex items-center gap-1.5">
              <Star className="w-3 h-3 text-amber-400" /> Tác giả: <span className="text-white/80 font-medium">{current.authors.slice(0,2).join(', ')}</span>
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center flex-wrap gap-2.5 pt-1">
            <button
              onClick={() => (onRead ? onRead(current) : onOpenDetail(current))}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white px-6 sm:px-7 py-2.5 sm:py-3 rounded-2xl font-bold text-sm shadow-xl shadow-purple-600/30 hover:scale-[1.03] active:scale-95 transition-all cursor-pointer"
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Đọc Ngay</span>
            </button>
            <button
              onClick={() => onOpenDetail(current)}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur text-white border border-white/15 px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-semibold text-sm hover:scale-[1.03] active:scale-95 transition-all cursor-pointer"
            >
              <Info className="w-4 h-4 text-purple-300" />
              <span>Chi Tiết</span>
            </button>
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(current)}
                className={`p-2.5 sm:p-3 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                  saved ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30' : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
                }`}
                title={saved ? 'Đã lưu' : 'Lưu truyện'}
              >
                {saved ? <Check className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
              </button>
            )}
          </div>

          {/* Mini meta row */}
          <div className="flex items-center gap-3 text-xs text-white/50 pt-1">
            <span className="inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /> Hot hôm nay</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Cập nhật liên tục</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-20 hidden sm:flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 mr-1">
          {mangas.slice(0, 5).map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentIndex(idx); resetInterval(); }}
              className={`h-1.5 rounded-full transition-all ${idx === currentIndex ? 'w-7 bg-fuchsia-500' : 'w-2.5 bg-white/30 hover:bg-white/60'}`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
        <button onClick={handlePrev} className="w-9 h-9 rounded-full bg-black/60 hover:bg-purple-600 border border-white/15 text-white flex items-center justify-center backdrop-blur transition-colors cursor-pointer" aria-label="Trước">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={handleNext} className="w-9 h-9 rounded-full bg-black/60 hover:bg-purple-600 border border-white/15 text-white flex items-center justify-center backdrop-blur transition-colors cursor-pointer" aria-label="Tiếp">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile dots bottom center */}
      <div className="sm:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
        {mangas.slice(0, 5).map((_, idx) => (
          <button
            key={idx}
            onClick={() => { setCurrentIndex(idx); resetInterval(); }}
            className={`h-1 rounded-full transition-all ${idx === currentIndex ? 'w-6 bg-fuchsia-500' : 'w-3 bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  );
};
