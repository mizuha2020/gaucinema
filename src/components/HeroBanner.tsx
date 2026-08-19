import React, { useState, useEffect } from 'react';
import { Movie } from '../types';
import { Play, Info, Plus, Check, Volume2, VolumeX, ChevronRight, ChevronLeft, Sparkles, Star } from 'lucide-react';
import { getImageUrl } from '../services/movieApi';
import { motion, AnimatePresence } from 'motion/react';

interface HeroBannerProps {
  movies: Movie[];
  onPlay?: (movie: Movie) => void;
  onPlayMovie?: (movie: Movie) => void;
  onOpenDetail?: (movie: Movie) => void;
  onSelectMovie?: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  movies,
  onPlay,
  onPlayMovie,
  onOpenDetail,
  onSelectMovie,
  onToggleMyList,
  isInMyList,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const handlePlay = onPlay || onPlayMovie || (() => {});
  const handleOpenDetail = onOpenDetail || onSelectMovie || (() => {});

  // Auto rotate featured hero movie every 8 seconds if not interacted
  useEffect(() => {
    if (!movies || movies.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(movies.length, 5));
    }, 9000);
    return () => clearInterval(interval);
  }, [movies]);

  if (!movies || movies.length === 0) {
    return (
      <div className="relative w-full h-[75vh] min-h-[540px] max-h-[780px] bg-[#070b16] overflow-hidden flex items-end p-6 sm:p-12 lg:p-16">
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b16] via-[#070b16]/60 to-transparent z-10" />
        <div className="relative z-20 space-y-4 max-w-2xl w-full animate-pulse">
          <div className="h-6 w-36 bg-blue-900/40 rounded-full" />
          <div className="h-12 sm:h-16 w-3/4 bg-slate-800/80 rounded-2xl" />
          <div className="h-4 w-full bg-slate-800/50 rounded-lg" />
          <div className="h-4 w-2/3 bg-slate-800/50 rounded-lg" />
          <div className="flex gap-4 pt-4">
            <div className="h-12 w-36 bg-blue-600/30 rounded-xl" />
            <div className="h-12 w-36 bg-slate-800/60 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const currentMovie = movies[currentIndex] || movies[0];
  const inList =
    typeof isInMyList === 'function'
      ? currentMovie
        ? isInMyList(currentMovie.slug)
        : false
      : Boolean(isInMyList);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? Math.min(movies.length, 5) - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % Math.min(movies.length, 5));
  };

  return (
    <div id="qtb-hero-banner" className="relative w-full h-[75vh] min-h-[540px] max-h-[780px] bg-[#0b1329] overflow-hidden select-none">
      {/* Background Image with Dynamic Fade Transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMovie.slug || currentIndex}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full"
        >
          <img
            src={getImageUrl(currentMovie.poster_url || currentMovie.thumb_url)}
            alt={currentMovie.name}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover object-top filter brightness-85"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&auto=format&fit=crop&q=80';
            }}
          />
          {/* Multi-layered QTB navy cinematic gradients */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b1329] via-[#0b1329]/80 to-transparent w-full md:w-3/4" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1329] via-[#0b1329]/30 to-transparent" />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#070b16]/90 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content Container */}
      <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-24 z-10">
        <div className="max-w-2xl space-y-3 sm:space-y-4">
          {/* Badges / Category pill */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-0.5 rounded-full font-bold tracking-wide text-[11px] uppercase shadow-lg shadow-blue-600/30">
              <Sparkles className="w-3 h-3 text-sky-200" /> QTB NỔI BẬT
            </span>
            {currentMovie.quality && (
              <span className="bg-slate-800/90 text-sky-200 border border-blue-900/60 px-2 py-0.5 rounded-md">
                {currentMovie.quality}
              </span>
            )}
            {currentMovie.lang && (
              <span className="bg-slate-800/90 text-slate-200 border border-slate-700 px-2 py-0.5 rounded-md">
                {currentMovie.lang}
              </span>
            )}
            {currentMovie.year && (
              <span className="text-slate-300 font-normal">{currentMovie.year}</span>
            )}
            {currentMovie.episode_current && (
              <span className="text-sky-400 font-semibold">{currentMovie.episode_current}</span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] line-clamp-2">
            {currentMovie.name}
          </h1>

          {/* Origin Name */}
          {currentMovie.origin_name && (
            <p className="text-xs sm:text-base text-slate-300 font-medium tracking-wide drop-shadow line-clamp-1">
              {currentMovie.origin_name}
            </p>
          )}

          {/* Description (Rich/Clean) */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl drop-shadow-md">
            {currentMovie.content
              ? currentMovie.content.replace(/<[^>]*>?/gm, '')
              : `Khám phá câu chuyện lôi cuốn trong siêu phẩm "${currentMovie.name}". Trải nghiệm trọn vẹn trên QTB Cinema với chất lượng hình ảnh sắc nét, âm thanh sống động.`}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 pt-1 sm:pt-2">
            <button
              id="hero-play-btn"
              onClick={() => handlePlay(currentMovie)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2 sm:px-8 sm:py-3 rounded-xl font-bold text-xs sm:text-base transition-all duration-200 shadow-xl shadow-blue-600/30 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              <span>Xem Ngay</span>
            </button>

            <button
              id="hero-detail-btn"
              onClick={() => handleOpenDetail(currentMovie)}
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white px-4 py-2 sm:px-7 sm:py-3 rounded-xl font-semibold text-xs sm:text-base backdrop-blur-sm transition-all duration-200 border border-slate-700/80 shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
              <span>Thông Tin</span>
            </button>

            <button
              id="hero-add-list-btn"
              onClick={() => onToggleMyList(currentMovie)}
              className={`p-2 sm:p-3 rounded-full border transition-all duration-200 cursor-pointer ${
                inList
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
              title={inList ? 'Đã thêm vào danh sách' : 'Thêm vào danh sách của tôi'}
            >
              {inList ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Indicators & Next/Prev Controls (Positioned cleanly on Desktop & Tablet) */}
      <div className="absolute right-4 sm:right-8 bottom-4 sm:bottom-24 z-20 hidden sm:flex items-center gap-3">
        {/* Pagination Dots */}
        <div className="flex items-center gap-1.5 mr-2">
          {movies.slice(0, 5).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-6 bg-blue-500' : 'w-2 bg-slate-600 hover:bg-slate-400'
              }`}
              aria-label={`Chuyển đến phim ${idx + 1}`}
            />
          ))}
        </div>

        {/* Prev / Next buttons */}
        <button
          id="hero-prev-btn"
          onClick={handlePrev}
          className="w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700 transition-colors"
          aria-label="Phim trước"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          id="hero-next-btn"
          onClick={handleNext}
          className="w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700 transition-colors"
          aria-label="Phim kế tiếp"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
