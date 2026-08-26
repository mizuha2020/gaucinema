import React, { useRef, useState, useEffect } from 'react';
import { MangaItem } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

interface MangaRowProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
  icon?: React.ReactNode;
}

export const MangaRow: React.FC<MangaRowProps> = ({ title, mangas, onOpenDetail, icon }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  useEffect(() => {
    if (containerRef.current) {
      setShowRightArrow(containerRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [mangas]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowLeftArrow(el.scrollLeft > 20);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 20);
  };

  const handleScrollBtn = (direction: 'left' | 'right') => {
    if (containerRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = containerRef.current;
      const scrollAmount = clientWidth * 0.75;
      
      if (direction === 'right' && scrollLeft + clientWidth >= scrollWidth - 10) {
        containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const newScrollLeft = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
        containerRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
      }
    }
  };

  if (!mangas || mangas.length === 0) return null;

  return (
    <div className="relative group/row my-8 px-4 sm:px-6 lg:px-8">
      {/* Row Header */}
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-purple-500">{icon}</span>}
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{title}</h2>
      </div>

      <div className="relative -mx-2 px-2">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => handleScrollBtn('left')}
            className="absolute -left-3 sm:-left-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-r-xl border border-white/10 shadow-lg"
          >
            <ChevronLeft className="w-6 h-6 hover:scale-125 transition-transform" />
          </button>
        )}

        {/* Scroll Container */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="flex w-full overflow-x-auto scrollbar-none scroll-smooth gap-4 sm:gap-5 py-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {mangas.map((manga, idx) => (
            <div
              key={`${manga.id || manga.slug || 'manga'}-${idx}`}
              onClick={() => onOpenDetail(manga)}
              className="group relative flex-shrink-0 w-32 sm:w-40 md:w-44 flex flex-col cursor-pointer"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#18181b] mb-3 shadow-md border border-white/5 group-hover:border-purple-500/50 transition-colors duration-300">
                <img
                  src={manga.coverUrl}
                  alt={manga.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <div className="bg-purple-600 text-white rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-purple-600/40">
                    <BookOpen className="w-5 h-5" />
                  </div>
                </div>
                {manga.status && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-md border border-white/10 rounded border-purple-500/30">
                    <span className="text-[9px] font-bold text-gray-200 uppercase tracking-wider">{manga.status}</span>
                  </div>
                )}
              </div>
              <h3 className="font-bold text-xs sm:text-sm text-gray-200 line-clamp-2 group-hover:text-purple-400 transition-colors leading-snug">
                {manga.title}
              </h3>
            </div>
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && (
          <button
            onClick={() => handleScrollBtn('right')}
            className="absolute -right-3 sm:-right-5 top-0 bottom-0 z-30 w-10 sm:w-12 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-l-xl border border-white/10 shadow-lg"
          >
            <ChevronRight className="w-6 h-6 hover:scale-125 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};
