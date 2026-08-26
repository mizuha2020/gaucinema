import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Movie } from '../types';
import { MovieCard } from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  
  const [itemWidth, setItemWidth] = useState(isTop10 ? 224 : 208);
  const [gap, setGap] = useState(24);

  useEffect(() => {
    const updateDimensions = () => {
      const isMobile = window.innerWidth < 640;
      const isTablet = window.innerWidth >= 640 && window.innerWidth < 768;
      
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

  // Use a sensible default height for the row container
  const rowHeightClass = isTop10 ? 'h-[300px] sm:h-[360px]' : 'h-[250px] sm:h-[330px] md:h-[360px]';

  useEffect(() => {
    if (containerRef.current) {
      setShowRightArrow(containerRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [movies]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowLeftArrow(el.scrollLeft > 20);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 20);
  };

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
    if (containerRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = containerRef.current;
      const scrollAmount = clientWidth * 0.75;
      
      if (direction === 'right' && scrollLeft + clientWidth >= scrollWidth - 10) {
        containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const newScrollLeft = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
        containerRef.current.scrollTo({
          left: newScrollLeft,
          behavior: 'smooth',
        });
      }
    }
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
        {showLeftArrow && (
          <button
            onClick={() => handleScrollBtn('left')}
            className="absolute -left-3 sm:-left-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b1329]/80 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-r-xl border border-slate-700/80 shadow-lg cursor-pointer"
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-7 h-7 hover:scale-125 transition-transform" />
          </button>
        )}

        {/* Native Horizontal Scroll Container */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          className={`flex w-full overflow-x-auto scrollbar-none scroll-smooth ${rowHeightClass} py-4`}
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
        {showRightArrow && (
          <button
            onClick={() => handleScrollBtn('right')}
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

