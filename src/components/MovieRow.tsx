import React, { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);

  const isTv = useTvMode();

  const [itemWidth, setItemWidth] = useState(isTop10 ? 224 : 208);
  const [gap, setGap] = useState(24);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);

  const loopMovies = useMemo(() => {
    if (movies.length <= 1) return movies;
    return [...movies, ...movies, ...movies];
  }, [movies]);

  useEffect(() => {
    const updateDimensions = () => {
      const isMobile = window.innerWidth < 640;
      const isTablet = window.innerWidth >= 640 && window.innerWidth < 768;
      const isTvScreen = window.innerWidth >= 1920 || document.documentElement.classList.contains('tv-mode');

      if (isTvScreen) {
        setGap(isTop10 ? 40 : 28);
        setItemWidth(isTop10 ? 280 : 260);
        return;
      }
      setGap(isMobile ? (isTop10 ? 20 : 16) : (isTop10 ? 32 : 24));

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

  const getSingleWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track || loopMovies.length === 0) return 0;
    return track.scrollWidth / 3;
  }, [loopMovies.length]);

  useLayoutEffect(() => {
    const init = () => {
      const single = getSingleWidth();
      if (single > 0) {
        setDisableTransition(true);
        setOffset(single);
        requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
      }
    };
    const id = setTimeout(init, 60);
    window.addEventListener("resize", init);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", init);
    };
  }, [getSingleWidth, loopMovies]);

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const vp = viewportRef.current;
    const single = getSingleWidth();
    if (!vp || single === 0) return;
    const scrollAmount = Math.round(vp.clientWidth * 0.78);
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    const next = offset + delta;
    setOffset(next);
    // snap after transition if beyond clones
    setTimeout(() => {
      const cur = next;
      if (cur >= single * 2) {
        setDisableTransition(true);
        setOffset(cur - single);
        requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
      } else if (cur < 0) {
        setDisableTransition(true);
        setOffset(cur + single);
        requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
      } else if (cur < single * 0.2) {
        // near left edge, snap to middle
        // handled above
      }
    }, 760);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    startXRef.current = e.pageX;
    startOffsetRef.current = offset;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.pageX - startXRef.current;
    if (Math.abs(dx) > 5) hasMovedRef.current = true;
    setOffset(startOffsetRef.current - dx);
  };

  const onMouseUpOrLeave = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      // snap after drag if beyond
      const single = getSingleWidth();
      if (single > 0) {
        setTimeout(() => {
          if (offset >= single * 2) {
            setDisableTransition(true);
            setOffset(o => o - single);
            requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
          } else if (offset < 0) {
            setDisableTransition(true);
            setOffset(o => o + single);
            requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
          } else if (offset < single * 0.3) {
            // if dragged far left, snap to middle equivalent
            if (offset < single * 0.5) {
              setDisableTransition(true);
              setOffset(o => o + single);
              requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
            }
          }
        }, 0);
      }
      setTimeout(() => { hasMovedRef.current = false; }, 50);
    }
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

  const canScroll = movies.length > 2;

  return (
    <div className="relative group/row my-6 sm:my-8 px-4 sm:px-6 lg:px-8 select-none">
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

      <div className="relative -mx-2 px-2">
        {canScroll && (
          <button
            onClick={() => handleScrollBtn('left')}
            className={`absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 ${isTv ? 'w-11 h-20 opacity-100' : 'h-14 sm:h-16 opacity-0 group-hover/row:opacity-100'} bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer focus:opacity-100 focus:ring-2 focus:ring-blue-500 hover:scale-105 active:scale-95`}
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className={`${isTv ? 'w-6 h-6' : 'w-5 h-5'} hover:scale-110 transition-transform`} />
          </button>
        )}

        <div ref={viewportRef} className={`overflow-hidden py-4 ${rowHeightClass} cursor-grab active:cursor-grabbing`}>
          <div
            ref={trackRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            className="flex w-max will-change-transform"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              gap: `${gap}px`,
              transform: `translateX(-${offset}px)`,
              transition: isDragging || disableTransition ? "none" : "transform 750ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "transform",
            } as React.CSSProperties}
          >
            {loopMovies.map((movie, index) => {
              const origIndex = index % movies.length;
              return (
                <div
                  key={`${movie.slug || movie._id || 'movie'}-${index}`}
                  className="flex-shrink-0 h-full"
                  style={{ width: `${itemWidth}px` }}
                >
                  <MovieCard
                    movie={movie}
                    rank={isTop10 ? (origIndex + 1) : undefined}
                    isTop10={isTop10}
                    onPlay={handlePlay}
                    onOpenDetail={handleOpenDetail}
                    onToggleMyList={onToggleMyList}
                    isInMyList={checkIsInMyList(movie.slug || '')}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {canScroll && (
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
