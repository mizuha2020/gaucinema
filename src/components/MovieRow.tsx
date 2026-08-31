import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Movie } from '../types';
import { MovieCard } from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTvMode } from '../hooks/useTvMode';

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
  const setWidthRef = useRef(0);
  const isScrollingRef = useRef(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const isTv = useTvMode();

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

  const rowHeightClass = isTv ? (isTop10 ? 'h-[380px]' : 'h-[400px]') : (isTop10 ? 'h-[300px] sm:h-[360px]' : 'h-[250px] sm:h-[330px] md:h-[360px]');

  const tripleMovies = useMemo(() => [...movies, ...movies, ...movies], [movies]);

  // Measure one set width & scroll to middle (instant)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !movies.length) return;
    const firstSet = movies.length;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length < firstSet) return;

    let totalWidth = 0;
    for (let i = 0; i < firstSet; i++) {
      totalWidth += children[i].offsetWidth;
      if (i < firstSet - 1) totalWidth += gap;
    }
    setWidthRef.current = totalWidth;
    el.scrollLeft = totalWidth;
  }, [movies, gap]);

  // Scroll handler: throttled via rAF + avoid React re-render storm
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let ticking = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLeft = false;
    let lastRight = true;

    const update = () => {
      ticking = false;
      const setWidth = setWidthRef.current;
      if (setWidth <= 0) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const third = scrollWidth / 3;
      let nextLeft: boolean;
      let nextRight: boolean;
      const inMiddleZone = scrollLeft > third * 0.1 && scrollLeft < third * 2.9;
      if (inMiddleZone) {
        nextLeft = scrollLeft > third + 20;
        nextRight = scrollLeft < third * 2 - clientWidth - 20;
      } else {
        nextLeft = scrollLeft > 20;
        nextRight = scrollLeft < scrollWidth - clientWidth - 20;
      }
      if (nextLeft !== lastLeft) { lastLeft = nextLeft; setShowLeftArrow(nextLeft); }
      if (nextRight !== lastRight) { lastRight = nextRight; setShowRightArrow(nextRight); }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
      // Infinity teleport: debounce until scroll idle ~90ms, skip while smooth animating
      if (isScrollingRef.current) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (isScrollingRef.current) return;
        const setWidth = setWidthRef.current;
        if (setWidth <= 0) return;
        const { scrollLeft, scrollWidth } = el;
        const third = scrollWidth / 3;
        const pos = el.scrollLeft;
        if (pos < third * 0.2) {
          // instant teleport without smooth
          try { (el as any).scrollTo({ left: pos + setWidth, behavior: 'instant' }); } catch { el.scrollLeft = pos + setWidth; }
        } else if (pos > third * 2.8) {
          try { (el as any).scrollTo({ left: pos - setWidth, behavior: 'instant' }); } catch { el.scrollLeft = pos - setWidth; }
        }
      }, 90);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // initial arrow state
    requestAnimationFrame(update);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  const handlePlay = useCallback((movie: Movie) => {
    if (onPlay) onPlay(movie);
    else if (onPlayMovie) onPlayMovie(movie);
  }, [onPlay, onPlayMovie]);

  const handleOpenDetail = useCallback((movie: Movie) => {
    if (onOpenDetail) onOpenDetail(movie);
    else if (onSelectMovie) onSelectMovie(movie);
  }, [onOpenDetail, onSelectMovie]);

  const checkIsInMyList = useCallback((slug: string) => {
    return typeof isInMyList === 'function' ? isInMyList(slug) : Boolean(isInMyList);
  }, [isInMyList]);

  if (!movies || movies.length === 0) return null;

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el || isScrollingRef.current) return;
    const scrollAmount = Math.round(el.clientWidth * 0.82);
    isScrollingRef.current = true;
    // Native compositor smooth = 60fps, no JS rAF layout thrash
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    window.setTimeout(() => { isScrollingRef.current = false; }, 420);
  };

  return (
    <div className="relative group/row my-6 sm:my-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
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
        {(showLeftArrow || isTv) && (
          <button
            onClick={() => handleScrollBtn('left')}
            className={`absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 ${isTv ? 'w-10' : ''} h-14 sm:h-16 ${isTv ? 'h-20' : ''} bg-[#0b1329]/80 hover:bg-blue-600 text-white flex items-center justify-center transition-all ${isTv ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'} backdrop-blur-md rounded-full border border-slate-700/80 shadow-lg cursor-pointer focus:opacity-100 focus:ring-2 focus:ring-blue-500`}
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className={`${isTv ? 'w-5 h-5' : 'w-4 h-4'} hover:scale-125 transition-transform`} />
          </button>
        )}

        {/* Infinity Scroll Container */}
        <div
          ref={containerRef}
          className={`flex w-full overflow-x-auto scrollbar-none ${rowHeightClass} py-4`}
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', gap: `${gap}px` }}
        >
          {tripleMovies.map((movie, index) => (
            <div
              key={`${movie.slug || movie._id || 'movie'}-${index}`}
              className="flex-shrink-0 h-full"
              style={{ width: `${itemWidth}px` }}
            >
              <MovieCard
                movie={movie}
                rank={isTop10 ? (index % movies.length) + 1 : undefined}
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
        {(showRightArrow || isTv) && (
          <button
            onClick={() => handleScrollBtn('right')}
            className={`absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 ${isTv ? 'w-10' : ''} h-14 sm:h-16 ${isTv ? 'h-20' : ''} bg-[#0b1329]/80 hover:bg-blue-600 text-white flex items-center justify-center transition-all ${isTv ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'} backdrop-blur-md rounded-full border border-slate-700/80 shadow-lg cursor-pointer focus:opacity-100 focus:ring-2 focus:ring-blue-500`}
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className={`${isTv ? 'w-5 h-5' : 'w-4 h-4'} hover:scale-125 transition-transform`} />
          </button>
        )}
      </div>
    </div>
  );
};
