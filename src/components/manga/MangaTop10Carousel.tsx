import React, { useRef } from 'react';
import { MangaItem } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

interface MangaTop10CarouselProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
}

export const MangaTop10Carousel: React.FC<MangaTop10CarouselProps> = ({ title, mangas, onOpenDetail }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const top10 = mangas.slice(0, 10);

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

  if (!top10.length) return null;

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-transparent bg-clip-text">Top 10</span>
        <span>{title}</span>
      </h2>
      
      <div className="relative group">
        <button
          className="absolute -left-3 sm:-left-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-r-xl border border-white/10 shadow-lg"
          onClick={() => handleScroll('left')}
        >
          <ChevronLeft className="w-6 h-6 hover:scale-125 transition-transform" />
        </button>

        <div
          ref={rowRef}
          className="flex items-end overflow-x-auto scrollbar-none scroll-smooth gap-4 sm:gap-6 py-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {top10.map((manga, index) => (
            <div key={manga.id} className="relative flex-shrink-0 w-48 sm:w-56 h-64 sm:h-72 flex items-end">
              {/* Background Number Layer */}
              <div className="absolute -left-4 sm:-left-6 bottom-[-10px] z-0 flex items-center justify-start h-full">
                <span
                  className="text-[8rem] sm:text-[10rem] font-black italic text-transparent select-none leading-none"
                  style={{
                    WebkitTextStroke: '2px rgba(168, 85, 247, 0.8)', // purple-500
                    textShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                  }}
                >
                  {index + 1}
                </span>
              </div>

              {/* Foreground Card Layer */}
              <div 
                className="relative z-10 ml-12 sm:ml-16 w-36 sm:w-40 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer shadow-2xl transition-all duration-300 hover:scale-105 border border-white/10 hover:border-purple-500/50 group/card bg-[#18181b]"
                onClick={() => onOpenDetail(manga)}
              >
                <img 
                  src={manga.coverUrl} 
                  alt={manga.title} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-90 group-hover/card:opacity-100 transition-opacity" 
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('/api/proxy/image') && manga.coverUrl && manga.coverUrl.startsWith('http')) {
                      target.src = `/api/proxy/image?url=${encodeURIComponent(manga.coverUrl)}`;
                    } else {
                      target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                    }
                  }}
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-80" />
                
                {/* Text Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex flex-col justify-end h-full">
                  <h3 className="text-white font-bold text-xs sm:text-sm line-clamp-2 leading-snug group-hover/card:text-purple-300 transition-colors">
                    {manga.title}
                  </h3>
                </div>

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px]">
                  <div className="bg-purple-600 text-white rounded-full p-2.5 transform translate-y-2 group-hover/card:translate-y-0 transition-all duration-300 shadow-lg">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="absolute -right-3 sm:-right-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-l-xl border border-white/10 shadow-lg"
          onClick={() => handleScroll('right')}
        >
          <ChevronRight className="w-6 h-6 hover:scale-125 transition-transform" />
        </button>
      </div>
    </div>
  );
};
