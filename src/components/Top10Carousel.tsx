import React, { useRef, useEffect, useMemo } from 'react';
import { Movie } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '../services/movieApi';

interface Top10CarouselProps {
  title: string;
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay: (movie: Movie) => void;
}

export const Top10Carousel: React.FC<Top10CarouselProps> = ({ title, movies, onOpenDetail, onPlay }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const isScrollingRef = useRef(false);
  const top10Movies = movies.slice(0, 10);

  const tripleMovies = useMemo(() => [...top10Movies, ...top10Movies, ...top10Movies], [top10Movies]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || !top10Movies.length) return;
    const firstSet = top10Movies.length;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length < firstSet) return;

    let totalWidth = 0;
    for (let i = 0; i < firstSet; i++) {
      totalWidth += children[i].offsetWidth;
      if (i < firstSet - 1) {
        const style = window.getComputedStyle(el);
        totalWidth += parseFloat(style.gap) || 0;
      }
    }
    setWidthRef.current = totalWidth;
    el.scrollLeft = totalWidth;
  }, [top10Movies]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (isScrollingRef.current) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (isScrollingRef.current) return;
        const setWidth = setWidthRef.current;
        if (setWidth <= 0) return;
        const { scrollLeft, scrollWidth } = el;
        const third = scrollWidth / 3;
        const pos = el.scrollLeft;
        if (pos < third * 0.2) { try { (el as any).scrollTo({ left: pos + setWidth, behavior: 'instant' }); } catch { el.scrollLeft = pos + setWidth; } }
        else if (pos > third * 2.8) { try { (el as any).scrollTo({ left: pos - setWidth, behavior: 'instant' }); } catch { el.scrollLeft = pos - setWidth; } }
      }, 90);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (scrollTimer) clearTimeout(scrollTimer); };
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el || isScrollingRef.current) return;
    const scrollAmount = Math.round(el.clientWidth * 0.82);
    isScrollingRef.current = true;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    window.setTimeout(() => { isScrollingRef.current = false; }, 420);
  };

  return (
    <div className="bg-black py-8 px-4 sm:px-8">
      <h2 className="text-white text-2xl font-bold mb-6">{title}</h2>

      <div className="relative group">
        <button
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/50 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition"
          onClick={() => handleScroll('left')}
        >
          <ChevronLeft className="text-white w-5 h-5" />
        </button>

        <div
          ref={rowRef}
          className="flex items-end overflow-x-auto scrollbar-none gap-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {tripleMovies.map((movie, index) => (
            <div key={`${movie.slug || 'top10'}-${index}`} className="relative flex-shrink-0 w-64 h-80 flex items-end">
              <div className="absolute left-0 bottom-0 z-0 flex items-center justify-start h-full">
                <span
                  className="text-[12rem] font-black italic text-black select-none"
                  style={{
                    WebkitTextStroke: '3px #2563EB',
                    textShadow: '0 0 24px rgba(37,99,235,0.5)',
                  }}
                >
                  {(index % top10Movies.length) + 1}
                </span>
              </div>

              <div
                className="relative z-10 ml-16 w-48 h-72 rounded-lg overflow-hidden cursor-pointer shadow-2xl transition-transform hover:scale-105"
                onClick={() => onOpenDetail(movie)}
              >
                <img
                  src={getImageUrl(movie.thumb_url || movie.poster_url)}
                  alt={movie.name}
                  className="w-full h-full object-cover"
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

        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-black/50 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition"
          onClick={() => handleScroll('right')}
        >
          <ChevronRight className="text-white w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
