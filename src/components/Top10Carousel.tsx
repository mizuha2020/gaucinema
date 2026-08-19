import React, { useRef } from 'react';
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
  const top10Movies = movies.slice(0, 10);

  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = rowRef.current;
      const scrollAmount = clientWidth * 0.8;
      
      if (direction === 'right' && scrollLeft + clientWidth >= scrollWidth - 10) {
        rowRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const newScrollLeft = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
        rowRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="bg-black py-8 px-4 sm:px-8">
      <h2 className="text-white text-2xl font-bold mb-6">{title}</h2>
      
      <div className="relative group">
        <button
          className="absolute left-0 top-0 bottom-0 z-20 bg-black/50 p-2 opacity-0 group-hover:opacity-100 transition"
          onClick={() => handleScroll('left')}
        >
          <ChevronLeft className="text-white w-8 h-8" />
        </button>

        <div
          ref={rowRef}
          className="flex items-end overflow-x-auto scrollbar-none scroll-smooth gap-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {top10Movies.map((movie, index) => (
            <div key={movie.slug || index} className="relative flex-shrink-0 w-64 h-80 flex items-end">
              {/* Background Number Layer */}
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

              {/* Foreground Card Layer */}
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
                
                {/* Text Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                  <p className="text-white font-bold truncate">{movie.name}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="absolute right-0 top-0 bottom-0 z-20 bg-black/50 p-2 opacity-0 group-hover:opacity-100 transition"
          onClick={() => handleScroll('right')}
        >
          <ChevronRight className="text-white w-8 h-8" />
        </button>
      </div>
    </div>
  );
};

