import React, { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { Movie } from '../types';
import { getImageUrl } from '../services/movieApi';

interface CinematicCarouselProps {
  title: string;
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay?: (movie: Movie) => void;
}

export const CinematicCarousel: React.FC<CinematicCarouselProps> = ({ title, movies, onOpenDetail, onPlay }) => {
  const displayMovies = movies.slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!displayMovies || displayMovies.length === 0) return null;

  return (
    <div className="relative bg-black py-12 px-0 sm:px-8 overflow-hidden">
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 z-0 opacity-40 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <img
              src={getImageUrl(displayMovies[activeIndex]?.poster_url || displayMovies[activeIndex]?.thumb_url)}
              className="w-full h-full object-cover blur-3xl scale-110"
              alt="background"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black via-black/60 to-black" />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex flex-col mb-8 px-4 sm:px-0">
        <div className="flex items-center gap-2 mb-1">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316]" />
          </motion.div>
          <span className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">Trending Now</span>
        </div>
        <h2 className="text-white text-3xl md:text-4xl font-black flex items-center gap-3">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
            {title}
          </span>
        </h2>
        <div className="h-1 w-24 bg-gradient-to-r from-orange-500 to-transparent mt-2 rounded-full" />
      </div>

      <div className="relative w-full">
        <Swiper
          centeredSlides={true}
          slidesPerView={1.5}          // mobile mặc định
          spaceBetween={12}
          loop={true}
          watchSlidesProgress={true}
          grabCursor={true}
          slideToClickedSlide={true}
          breakpoints={{
            640: {   // >= sm (tablet nhỏ)
              slidesPerView: 2.5,
              spaceBetween: 16,
            },
            768: {   // >= md (tablet lớn)
              slidesPerView: 3,
              spaceBetween: 20,
            },
            1024: {  // >= lg (desktop)
              slidesPerView: 3,
              spaceBetween: 24,
            },
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          onProgress={(swiper) => {
            swiper.slides.forEach((slide) => {
              const progress = slide.progress;
              const absProgress = Math.abs(progress);

              // Scale: 1 for active (center), 0.75 for side cards
              const scale = 1 - Math.min(absProgress * 0.25, 0.25);

              // Opacity: Center is clear (1), sides fade out aggressively (down to 0.2)
              const opacity = 1 - Math.min(absProgress * 0.8, 0.8);

              // Blur: Center is sharp (0), sides get blurry
              const blur = Math.min(absProgress * 4, 8);

              // Apply GPU accelerated CSS updates
              slide.style.transform = `scale(${scale})`;
              slide.style.opacity = opacity.toString();
              slide.style.filter = `blur(${blur}px)`;
              slide.style.transitionProperty = 'transform, opacity, filter';
            });
          }}
          onSetTransition={(swiper, duration) => {
            swiper.slides.forEach((slide) => {
              slide.style.transitionDuration = `${duration}ms`;
            });
          }}
          className="w-full pb-4"
        >
          {displayMovies.map((movie, index) => (
            <SwiperSlide key={`${movie.slug || index}`} className="shrink-0">
              {({ isActive }) => (
                <div
                  className={`w-full aspect-video rounded-xl overflow-hidden bg-slate-900 relative transition-shadow duration-300 ${isActive ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  style={{
                    boxShadow: isActive
                      ? '0 15px 30px -10px rgba(0, 0, 0, 0.6)'
                      : '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <img
                    src={getImageUrl(movie.poster_url || movie.thumb_url)}
                    alt={movie.name}
                    loading="eager"
                    className="w-full h-full object-cover"
                  />

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
                    <motion.div
                      animate={{ opacity: [0.8, 1, 0.8], scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="bg-gradient-to-r from-orange-600 to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-red-400/50 text-white text-[10px] md:text-xs px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1"
                    >
                      <span className="text-sm">🍿</span>
                      <span>HOT</span>
                    </motion.div>
                  </div>

                  {/* Play Button Hint for Center Item */}
                  <div
                    onClick={() => {
                      if (isActive) onOpenDetail(movie);
                    }}
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isActive ? 'opacity-0 hover:opacity-100 hover:bg-black/40 cursor-pointer' : 'opacity-0'
                      }`}
                  >
                    <div className="bg-blue-600/90 rounded-full p-4 border border-blue-400/50 scale-90 hover:scale-105 transition-transform">
                      <ChevronRight className="w-8 h-8 text-white ml-1" />
                    </div>
                  </div>
                </div>
              )}
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Cụm thông tin chuyển đổi mượt mà (Fade transition) */}
        <div className="h-[130px] mt-2 text-center px-4 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto"
            >
              <h3 className="text-xl md:text-3xl font-extrabold text-white tracking-tight drop-shadow-md truncate w-full">
                {displayMovies[activeIndex]?.name}
              </h3>
              <div className="flex flex-wrap gap-2 md:gap-3 items-center justify-center mt-2 text-xs md:text-sm text-slate-300 font-medium">
                <span className="text-amber-400 font-bold">
                  {displayMovies[activeIndex]?.origin_name || displayMovies[activeIndex]?.year}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 hidden md:block" />
                <span className="px-2 py-0.5 border border-slate-700 rounded bg-slate-800/80 shadow-sm">
                  {displayMovies[activeIndex]?.lang || 'Vietsub'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 hidden md:block" />
                <span className="px-2 py-0.5 border border-slate-700 rounded bg-slate-800/80 shadow-sm">
                  {displayMovies[activeIndex]?.year || '2025'}
                </span>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => onPlay && onPlay(displayMovies[activeIndex])}
                  className="px-6 py-2 md:px-8 md:py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-full text-white font-bold text-sm md:text-base transition-all shadow-lg shadow-blue-600/30 hover:scale-105"
                >
                  Xem Phim
                </button>
                <button
                  onClick={() => onOpenDetail(displayMovies[activeIndex])}
                  className="px-6 py-2 md:px-8 md:py-2.5 bg-slate-800/80 backdrop-blur-md hover:bg-slate-700 rounded-full text-white font-bold text-sm md:text-base transition-all border border-slate-700 hover:border-slate-500 hover:scale-105"
                >
                  Thông Tin
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};