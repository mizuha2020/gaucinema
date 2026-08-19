import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { Movie } from '../types';
import { getImageUrl } from '../services/movieApi';

interface Theater3DCarouselProps {
  title: string;
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay?: (movie: Movie) => void;
}

export const Theater3DCarousel: React.FC<Theater3DCarouselProps> = ({ title, movies, onOpenDetail, onPlay }) => {
  const displayMovies = movies.slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number>(0);

  if (!displayMovies || displayMovies.length === 0) return null;

  const handleNext = () => setActiveIndex((prev) => (prev + 1) % displayMovies.length);
  const handlePrev = () => setActiveIndex((prev) => (prev - 1 + displayMovies.length) % displayMovies.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const delta = touchEndX - touchStartX.current;
    if (delta > 50) handlePrev();
    else if (delta < -50) handleNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Enter') onOpenDetail(displayMovies[activeIndex]);
  };

  // Tối ưu physics của spring để mượt hơn, giảm tính toán
  const springConfig = { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 };
  const xSpacing = typeof window !== 'undefined' && window.innerWidth < 768 ? 140 : 180;

  return (
    <div className="bg-black py-8 px-4 sm:px-8">
      <div className="flex flex-col mb-8">
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
          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current">
              <path d="M17.507 6.748a.5.5 0 01.493.5v12.004a.5.5 0 01-.5.5H6.493a.5.5 0 01-.5-.5V7.248a.5.5 0 01.5-.5h11.014zm-5.507 2.252l-2.5 3.5h5l-2.5-3.5zm3.5 5.25h-7a.25.25 0 00-.25.25v2.5c0 .138.112.25.25.25h7a.25.25 0 00.25-.25v-2.5a.25.25 0 00-.25-.25z" />
            </svg>
          </div>
        </h2>
        <div className="h-1 w-24 bg-gradient-to-r from-orange-500 to-transparent mt-2 rounded-full" />
      </div>
      
      <div 
        className="relative w-full h-[450px] md:h-[550px] flex flex-col items-center justify-center overflow-hidden focus:outline-none"
        style={{ touchAction: 'pan-y', perspective: '1000px' }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex items-center justify-center w-full h-[350px] md:h-[450px]">
          {displayMovies.map((movie, index) => {
            const offset = index - activeIndex;
            const isCenter = offset === 0;

            // Xử lý index xoay vòng
            let adjustedOffset = offset;
            if (offset < -displayMovies.length / 2) adjustedOffset += displayMovies.length;
            if (offset > displayMovies.length / 2) adjustedOffset -= displayMovies.length;

            const absoluteOffset = Math.abs(adjustedOffset);
            const isActive = absoluteOffset <= 2; // Giảm xuống 2 (tổng 5 item) để giảm tải cực đại cho mobile

            return (
              <motion.div
                key={movie.slug || index}
                initial={false}
                animate={{
                  x: adjustedOffset * xSpacing,
                  scale: isCenter ? 1 : Math.max(0.75, 1 - absoluteOffset * 0.15),
                  rotateY: adjustedOffset * -15,
                  zIndex: 10 - absoluteOffset,
                  opacity: isActive ? 1 - absoluteOffset * 0.3 : 0,
                }}
                transition={springConfig}
                className={`absolute w-[200px] md:w-[260px] h-[300px] md:h-[390px] rounded-xl overflow-hidden cursor-pointer ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
                onClick={() => {
                  if (!isActive) return;
                  if (isCenter) {
                    onOpenDetail(movie);
                  } else {
                    setActiveIndex(index);
                  }
                }}
                // TỐI ƯU GPU CỰC ĐẠI CHO MOBILE:
                style={{ 
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  visibility: isActive ? 'visible' : 'hidden', // Ẩn hoàn toàn khỏi luồng render khi ở xa
                  boxShadow: isCenter ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }} 
              >
                <div className="relative z-10 w-full h-full border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900">
                  <div className="w-full h-full bg-slate-800 absolute inset-0 -z-10" />
                  <img
                    src={getImageUrl(movie.thumb_url || movie.poster_url)}
                    alt={movie.name}
                    loading={isActive ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={isActive ? "high" : "auto"}
                    className="w-full h-full object-cover transition-opacity duration-500 pointer-events-none"
                    onLoad={(e) => (e.currentTarget.style.opacity = '1')}
                    style={{ opacity: 0 }}
                  />
                  
                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
                    <motion.div 
                      animate={{ opacity: [0.8, 1, 0.8], scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="bg-gradient-to-r from-orange-600 to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-red-400/50 text-white text-[10px] md:text-xs px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1"
                    >
                      <Flame className="w-3 h-3 md:w-3.5 md:h-3.5 fill-orange-300 text-orange-300" />
                      <span>HOT</span>
                    </motion.div>
                  </div>

                  {/* Dark Gradient Overlay for Side Items */}
                  <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 ${isCenter ? 'opacity-0' : 'opacity-100'}`} />
                  
                  {/* Play Button Hint for Center Item */}
                  <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isCenter ? 'opacity-0 hover:opacity-100' : 'opacity-0'}`}>
                    <div className="bg-blue-600/90 rounded-full p-4 border border-blue-400/50">
                      <ChevronRight className="w-8 h-8 text-white ml-1" />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Hiệu ứng Fade-in Slide-up cho Text */}
        <div className="h-[90px] mt-2 md:mt-4 text-center z-10 px-4 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto"
            >
              <h3 className="text-xl md:text-3xl font-extrabold text-white tracking-tight drop-shadow-md truncate w-full">{displayMovies[activeIndex].name}</h3>
              <div className="flex flex-wrap gap-2 md:gap-3 items-center justify-center mt-2 text-xs md:text-sm text-slate-300 font-medium">
                <span className="text-amber-400 font-bold">{displayMovies[activeIndex].origin_name || displayMovies[activeIndex].year}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 hidden md:block" />
                <span className="px-2 py-0.5 border border-slate-700 rounded bg-slate-800/80 shadow-sm">{displayMovies[activeIndex].lang || 'Vietsub'}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 hidden md:block" />
                <span className="px-2 py-0.5 border border-slate-700 rounded bg-slate-800/80 shadow-sm">{displayMovies[activeIndex].year || '2025'}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <button onClick={handlePrev} aria-label="Phim trước" className="hidden md:block absolute left-2 md:left-12 z-20 p-3 md:p-4 bg-black/40 backdrop-blur-md rounded-full border border-slate-700/50 hover:bg-amber-600/90 hover:border-amber-400 transition-all hover:scale-110 shadow-lg group">
          <ChevronLeft className="text-white w-6 h-6 md:w-8 md:h-8 group-hover:-translate-x-0.5 transition-transform" />
        </button>
        <button onClick={handleNext} aria-label="Phim tiếp theo" className="hidden md:block absolute right-2 md:right-12 z-20 p-3 md:p-4 bg-black/40 backdrop-blur-md rounded-full border border-slate-700/50 hover:bg-amber-600/90 hover:border-amber-400 transition-all hover:scale-110 shadow-lg group">
          <ChevronRight className="text-white w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};

