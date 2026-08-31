import React, { useRef, useEffect, useMemo } from 'react';
import { MangaItem } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { MangaSourceBadge } from './MangaSourceBadge';
import { getProxyImageUrl } from '../../services/mangaApi';

interface MangaTop10CarouselProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
}

export const MangaTop10Carousel: React.FC<MangaTop10CarouselProps> = ({ title, mangas, onOpenDetail }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const isScrollingRef = useRef(false);
  const top10 = mangas.slice(0, 10);

  const tripleMangas = useMemo(() => [...top10, ...top10, ...top10], [top10]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || !top10.length) return;
    const firstSet = top10.length;
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
  }, [top10]);

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
        const { scrollWidth } = el;
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

  if (!top10.length) return null;

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-transparent bg-clip-text">Top 10</span>
        <span>{title}</span>
      </h2>

      <div className="relative group">
        <button
          className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 h-14 sm:h-16 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
          onClick={() => handleScroll('left')}
        >
          <ChevronLeft className="w-4 h-4 hover:scale-125 transition-transform" />
        </button>

        <div
          ref={rowRef}
          className="flex items-end overflow-x-auto scrollbar-none gap-4 sm:gap-6 py-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {tripleMangas.map((manga, index) => (
            <div key={`${manga.id || manga.slug || 'top10'}-${index}`} className="relative flex-shrink-0 w-48 sm:w-56 h-64 sm:h-72 flex items-end">
              <div className="absolute -left-4 sm:-left-6 bottom-[-10px] z-0 flex items-center justify-start h-full">
                <span
                  className="text-[8rem] sm:text-[10rem] font-black italic text-transparent select-none leading-none"
                  style={{
                    WebkitTextStroke: '2px rgba(168, 85, 247, 0.8)',
                    textShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                  }}
                >
                  {(index % top10.length) + 1}
                </span>
              </div>

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
                      target.src = getProxyImageUrl(manga.coverUrl);
                    } else {
                      target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                    }
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

        <button
          className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 h-14 sm:h-16 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
          onClick={() => handleScroll('right')}
        >
          <ChevronRight className="w-4 h-4 hover:scale-125 transition-transform" />
        </button>
      </div>
    </div>
  );
};
