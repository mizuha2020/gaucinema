import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Movie } from '../types';
import { MovieCard } from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTvMode } from '../hooks/useTvMode';
import { smoothScrollHorizontal } from '../utils/scrollUtils';

interface MovieRowProps {
  title: string;
  movies: Movie[];
  isTop10?: boolean;
  onPlay?: (movie: Movie) => void;
  onPlayMovie?: (movie: Movie) => void;
  onOpenDetail?: (movie: Movie) => void;
  onSelectMovie?: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
  icon?: React.ReactNode;
  subtitle?: string;
}

export const MovieRow: React.FC<MovieRowProps> = ({
  title,
  movies,
  isTop10 = false,
  onPlay,
  onPlayMovie,
  onOpenDetail,
  onSelectMovie,
  onToggleMyList,
  isInMyList,
  icon,
  subtitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  const isTv = useTvMode();

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [itemWidth, setItemWidth] = useState(isTop10 ? 224 : 208);
  const [gap, setGap] = useState(24);

  useEffect(() => {
    const updateDimensions = () => {
      const isMobile = window.innerWidth < 640;
      const isTablet = window.innerWidth >= 640 && window.innerWidth < 768;
      const isTvScreen = window.innerWidth >= 1920 || document.documentElement.classList.contains('tv-mode');

      if (isTvScreen) {
        setGap(28);
        setItemWidth(isTop10 ? 280 : 260);
        return;
      }
      setGap(isMobile ? 16 : 24);

      if (isTop10) {
        setItemWidth(isMobile ? 176 : 224);
      } else {
        if (isMobile) setItemWidth(144);
        else if (isTablet) setItemWidth(192);
        else setItemWidth(208);
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isTop10]);

  const rowHeightClass = isTv
    ? (isTop10 ? 'h-[380px]' : 'h-[400px]')
    : (isTop10 ? 'h-[300px] sm:h-[360px]' : 'h-[250px] sm:h-[330px] md:h-[360px]');

  const checkScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
  }, []);

  useEffect(() => {
    checkScrollBounds();
    const handleResize = () => checkScrollBounds();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScrollBounds, movies]);

  const scrollAnimCancelRef = useRef<(() => void) | null>(null);

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollAnimCancelRef.current) {
      scrollAnimCancelRef.current();
    }
    const scrollAmount = Math.round(el.clientWidth * 0.75);
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    scrollAnimCancelRef.current = smoothScrollHorizontal(el, delta, 460, checkScrollBounds);
  };

  // Mouse Drag-to-Scroll handlers for desktop UX
  const onMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftStartRef.current = el.scrollLeft;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(walk) > 5) {
      hasMovedRef.current = true;
    }
    el.scrollLeft = scrollLeftStartRef.current - walk;
  };

  const onMouseUpOrLeave = () => {
    isDraggingRef.current = false;
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 50);
  };

  const handlePlay = useCallback((movie: Movie) => {
    if (hasMovedRef.current) return;
    if (onPlay) onPlay(movie);
    else if (onPlayMovie) onPlayMovie(movie);
  }, [onPlay, onPlayMovie]);

  const handleOpenDetail = useCallback((movie: Movie) => {
    if (hasMovedRef.current) return;
    if (onOpenDetail) onOpenDetail(movie);
    else if (onSelectMovie) onSelectMovie(movie);
  }, [onOpenDetail, onSelectMovie]);

  const checkIsInMyList = useCallback((slug: string) => {
    return typeof isInMyList === 'function' ? isInMyList(slug) : Boolean(isInMyList);
  }, [isInMyList]);

  if (!movies || movies.length === 0) return null;

  return (
    <div className="relative group/row my-6 sm:my-8 px-4 sm:px-6 lg:px-8 select-none">
      {/* Row Header */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-sky-400">{icon}</span>}
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            {isTop10 && (
              <span className="text-xs bg-blue-600 text-white px-2.5 py-0.5 rounded-full font-bold tracking-wider uppercase shadow-md shadow-blue-600/30">
                Hôm Nay
              </span>
            )}
          </h2>
        </div>
        {subtitle && <span className="text-xs text-slate-400 font-medium">{subtitle}</span>}
      </div>

      {/* Row Carousel Area */}
      <div className="relative -mx-2 px-2">
        {/* Left Scroll Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => handleScrollBtn('left')}
            className={`absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 ${isTv ? 'w-11 h-20 opacity-100' : 'h-14 sm:h-16 opacity-0 group-hover/row:opacity-100'} bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer focus:opacity-100 focus:ring-2 focus:ring-blue-500 hover:scale-105 active:scale-95`}
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className={`${isTv ? 'w-6 h-6' : 'w-5 h-5'} hover:scale-110 transition-transform`} />
          </button>
        )}

        {/* Smooth Scroll Container */}
        <div
          ref={containerRef}
          onScroll={checkScrollBounds}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpOrLeave}
          onMouseLeave={onMouseUpOrLeave}
          className={`flex w-full overflow-x-auto scrollbar-none overscroll-x-contain ${rowHeightClass} py-4 cursor-grab active:cursor-grabbing`}
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', gap: `${gap}px` }}
        >
          {movies.map((movie, index) => (
            <div
              key={`${movie.slug || movie._id || 'movie'}-${index}`}
              className="flex-shrink-0 h-full"
              style={{ width: `${itemWidth}px` }}
            >
              <MovieCard
                movie={movie}
                rank={isTop10 ? index + 1 : undefined}
                isTop10={isTop10}
                onPlay={handlePlay}
                onOpenDetail={handleOpenDetail}
                onToggleMyList={onToggleMyList}
                isInMyList={checkIsInMyList(movie.slug || '')}
              />
            </div>
          ))}
        </div>

        {/* Right Scroll Arrow */}
        {canScrollRight && (
          <button
            onClick={() => handleScrollBtn('right')}
            className={`absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 ${isTv ? 'w-11 h-20 opacity-100' : 'h-14 sm:h-16 opacity-0 group-hover/row:opacity-100'} bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer focus:opacity-100 focus:ring-2 focus:ring-blue-500 hover:scale-105 active:scale-95`}
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className={`${isTv ? 'w-6 h-6' : 'w-5 h-5'} hover:scale-110 transition-transform`} />
          </button>
        )}
      </div>
    </div>
  );
};

