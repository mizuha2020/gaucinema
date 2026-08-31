import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Movie } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '../services/movieApi';
import { smoothScrollHorizontal } from '../utils/scrollUtils';

interface Top10CarouselProps {
  title: string;
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay: (movie: Movie) => void;
}

export const Top10Carousel: React.FC<Top10CarouselProps> = ({ title, movies, onOpenDetail }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const top10Movies = useMemo(() => movies.slice(0, 10), [movies]);

  const checkScrollBounds = useCallback(() => {
    const el = rowRef.current;
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
  }, [checkScrollBounds, top10Movies]);

  const scrollAnimCancelRef = useRef<(() => void) | null>(null);

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;
    if (scrollAnimCancelRef.current) {
      scrollAnimCancelRef.current();
    }
    const scrollAmount = Math.round(el.clientWidth * 0.75);
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    scrollAnimCancelRef.current = smoothScrollHorizontal(el, delta, 460, checkScrollBounds);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const el = rowRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftStartRef.current = el.scrollLeft;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = rowRef.current;
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

  const handleClickItem = (movie: Movie) => {
    if (hasMovedRef.current) return;
    onOpenDetail(movie);
  };

  if (!top10Movies.length) return null;

  return (
    <div className="bg-black py-8 px-4 sm:px-8 select-none">
      <h2 className="text-white text-2xl font-bold mb-6">{title}</h2>

      <div className="relative group">
        {canScrollLeft && (
          <button
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            onClick={() => handleScrollBtn('left')}
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-5 h-5 hover:scale-110 transition-transform" />
          </button>
        )}

        <div
          ref={rowRef}
          onScroll={checkScrollBounds}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpOrLeave}
          onMouseLeave={onMouseUpOrLeave}
          className="flex items-end overflow-x-auto scrollbar-none overscroll-x-contain gap-0 cursor-grab active:cursor-grabbing py-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {top10Movies.map((movie, index) => (
            <div key={`${movie.slug || 'top10'}-${index}`} className="relative flex-shrink-0 w-64 h-80 flex items-end">
              <div className="absolute left-0 bottom-0 z-0 flex items-center justify-start h-full">
                <span
                  className="text-[12rem] font-black italic text-black select-none"
                  style={{
                    WebkitTextStroke: '3px #2563EB',
                    textShadow: '0 0 24px rgba(37,99,235,0.5)',
                  }}
                >
                  {index + 1}
                </span>
              </div>

              <div
                className="relative z-10 ml-16 w-48 h-72 rounded-lg overflow-hidden cursor-pointer shadow-2xl transition-transform hover:scale-105"
                onClick={() => handleClickItem(movie)}
              >
                <img
                  src={getImageUrl(movie.thumb_url || movie.poster_url)}
                  alt={movie.name}
                  className="w-full h-full object-cover pointer-events-none"
                  loading="lazy"
                  decoding="async"
                />

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                  <p className="text-white font-bold truncate">{movie.name}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {canScrollRight && (
          <button
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            onClick={() => handleScrollBtn('right')}
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className="w-5 h-5 hover:scale-110 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};

