import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { MangaItem } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { MangaSourceBadge } from './MangaSourceBadge';

interface MangaRowProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
  icon?: React.ReactNode;
}

export const MangaRow: React.FC<MangaRowProps> = ({ title, mangas, onOpenDetail, icon }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const setWidthRef = useRef(0);
  const isScrollingRef = useRef(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const tripleMangas = useMemo(() => [...mangas, ...mangas, ...mangas], [mangas]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mangas.length) return;
    const firstSet = mangas.length;
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
  }, [mangas]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLeft = false;
    let lastRight = true;
    const update = () => {
      ticking = false;
      const setWidth = setWidthRef.current;
      if (setWidth <= 0) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const third = scrollWidth / 3;
      let nextLeft: boolean; let nextRight: boolean;
      const inMiddleZone = scrollLeft > third * 0.1 && scrollLeft < third * 2.9;
      if (inMiddleZone) { nextLeft = scrollLeft > third + 20; nextRight = scrollLeft < third * 2 - clientWidth - 20; }
      else { nextLeft = scrollLeft > 20; nextRight = scrollLeft < scrollWidth - clientWidth - 20; }
      if (nextLeft !== lastLeft) { lastLeft = nextLeft; setShowLeftArrow(nextLeft); }
      if (nextRight !== lastRight) { lastRight = nextRight; setShowRightArrow(nextRight); }
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
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
    requestAnimationFrame(update);
    return () => { el.removeEventListener('scroll', onScroll); if (scrollTimer) clearTimeout(scrollTimer); };
  }, []);

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el || isScrollingRef.current) return;
    const scrollAmount = Math.round(el.clientWidth * 0.82);
    isScrollingRef.current = true;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    window.setTimeout(() => { isScrollingRef.current = false; }, 420);
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
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 h-14 sm:h-16 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
          >
            <ChevronLeft className="w-4 h-4 hover:scale-125 transition-transform" />
          </button>
        )}

        {/* Infinity Scroll Container */}
        <div
          ref={containerRef}
          className="flex w-full overflow-x-auto scrollbar-none gap-4 sm:gap-5 py-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {tripleMangas.map((manga, idx) => (
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
                <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
                  {manga.status ? (
                    <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-md border border-white/10 rounded text-[8px] font-bold text-gray-200 uppercase tracking-wider line-clamp-1 max-w-[60%]">{manga.status}</span>
                  ) : <span />}
                  <MangaSourceBadge source={manga.source} size="xs" />
                </div>
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
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-7 sm:w-8 h-14 sm:h-16 bg-[#0b0c16]/80 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-lg"
          >
            <ChevronRight className="w-4 h-4 hover:scale-125 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};
