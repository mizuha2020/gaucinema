import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { MangaItem, getFallbackMangaImageUrl } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { MangaSourceBadge } from './MangaSourceBadge';
import { smoothScrollHorizontal } from '../../utils/scrollUtils';

interface MangaTop10CarouselProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
}

export const MangaTop10Carousel: React.FC<MangaTop10CarouselProps> = ({ title, mangas, onOpenDetail }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const top10 = useMemo(() => mangas.slice(0, 10), [mangas]);

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
  }, [checkScrollBounds, top10]);

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

  const handleClickItem = (manga: MangaItem) => {
    if (hasMovedRef.current) return;
    onOpenDetail(manga);
  };

  if (!top10.length) return null;

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 select-none">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-transparent bg-clip-text">Top 10</span>
        <span>{title}</span>
      </h2>

      <div className="relative group">
        {canScrollLeft && (
          <button
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
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
          className="flex items-end overflow-x-auto scrollbar-none overscroll-x-contain gap-4 sm:gap-6 py-4 cursor-grab active:cursor-grabbing"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {top10.map((manga, index) => (
            <div key={`${manga.id || manga.slug || 'top10'}-${index}`} className="relative flex-shrink-0 w-48 sm:w-56 h-64 sm:h-72 flex items-end">
              <div className="absolute -left-4 sm:-left-6 bottom-[-10px] z-0 flex items-center justify-start h-full">
                <span
                  className="text-[8rem] sm:text-[10rem] font-black italic text-transparent select-none leading-none"
                  style={{
                    WebkitTextStroke: '2px rgba(168, 85, 247, 0.8)',
                    textShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                  }}
                >
                  {index + 1}
                </span>
              </div>

              <div
                className="relative z-10 ml-12 sm:ml-16 w-36 sm:w-40 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer shadow-2xl transition-all duration-300 hover:scale-105 border border-white/10 hover:border-purple-500/50 group/card bg-[#18181b]"
                onClick={() => handleClickItem(manga)}
              >
                <img
                  src={manga.coverUrl}
                  alt={manga.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-90 group-hover/card:opacity-100 transition-opacity pointer-events-none"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = getFallbackMangaImageUrl(manga.coverUrl, target.src);
                  }}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-80" />
                <div className="absolute top-2 left-2 right-2 flex justify-end">
                  <MangaSourceBadge source={manga.source} size="xs" />
                </div>
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

        {canScrollRight && (
          <button
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
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
