import React, { useRef, useState } from 'react';
import { Movie } from '../types';
import { MovieCard } from './MovieCard';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

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
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const lastScrollTime = useRef(0);

  const handlePlay = onPlay || onPlayMovie || (() => {});
  const handleOpenDetail = onOpenDetail || onSelectMovie || (() => {});

  const checkIsInMyList = (slug: string) =>
    typeof isInMyList === 'function' ? isInMyList(slug) : Boolean(isInMyList);

  if (!movies || movies.length === 0) return null;

  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = rowRef.current;
      const scrollAmount = clientWidth * 0.75;
      
      if (direction === 'right' && scrollLeft + clientWidth >= scrollWidth - 10) {
        rowRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const newScrollLeft = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
        rowRef.current.scrollTo({
          left: newScrollLeft,
          behavior: 'smooth',
        });
      }
    }
  };

  const onScrollCheck = () => {
    const now = Date.now();
    if (now - lastScrollTime.current < 100) return; // Throttled to 100ms
    lastScrollTime.current = now;

    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 20);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20);
    }
  };

  return (
    <div className="relative group/row my-6 sm:my-8 px-4 sm:px-6 lg:px-8">
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
      <div className="relative">
        {/* Left Scroll Arrow */}
        {showLeftArrow && (
          <button
            id={`scroll-left-${title.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => handleScroll('left')}
            className="absolute -left-3 sm:-left-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b1329]/80 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-r-xl border border-slate-700/80 shadow-lg cursor-pointer"
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-7 h-7 hover:scale-125 transition-transform" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={rowRef}
          onScroll={onScrollCheck}
          className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none scroll-smooth pb-4 pt-2 -mx-2 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {movies.slice(0, 15).map((movie, index) => (
            <MovieCard
              key={movie.slug || movie._id || index}
              movie={movie}
              rank={isTop10 ? index + 1 : undefined}
              isTop10={isTop10}
              onPlay={handlePlay}
              onOpenDetail={handleOpenDetail}
              onToggleMyList={onToggleMyList}
              isInMyList={checkIsInMyList(movie.slug)}
            />
          ))}
        </div>

        {/* Right Scroll Arrow */}
        {showRightArrow && (
          <button
            id={`scroll-right-${title.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => handleScroll('right')}
            className="absolute -right-3 sm:-right-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b1329]/80 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-l-xl border border-slate-700/80 shadow-lg cursor-pointer"
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className="w-7 h-7 hover:scale-125 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};
