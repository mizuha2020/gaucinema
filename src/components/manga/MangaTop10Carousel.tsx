import React, { useRef, useEffect, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import { MangaItem, getFallbackMangaImageUrl } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { MangaSourceBadge } from './MangaSourceBadge';

interface MangaTop10CarouselProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
}

export const MangaTop10Carousel: React.FC<MangaTop10CarouselProps> = ({ title, mangas, onOpenDetail }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);
  const [page, setPage] = useState(0);

  const top10 = useMemo(() => mangas.slice(0, 10), [mangas]);
  const loopTop10 = useMemo(() => [...top10, ...top10, ...top10], [top10]);

  const getSingleWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.scrollWidth / 3;
  }, [loopTop10.length]);

  const getMaxSingle = useCallback(() => {
    const vp = viewportRef.current;
    const single = getSingleWidth();
    if (!vp || single === 0) return 0;
    return Math.max(0, single - vp.clientWidth);
  }, [getSingleWidth]);

  useLayoutEffect(() => {
    const init = () => {
      const single = getSingleWidth();
      if (single > 0) {
        setDisableTransition(true);
        setOffset(single);
        setPage(0);
        requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
      }
    };
    const id = setTimeout(init, 60);
    window.addEventListener("resize", init);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", init);
    };
  }, [getSingleWidth, loopTop10]);

  const handleScrollBtn = (direction: 'left' | 'right') => {
    const single = getSingleWidth();
    const maxSingle = getMaxSingle();
    if (single === 0) return;
    if (direction === 'right') {
      if (page === 0) {
        setOffset(single + maxSingle);
        setPage(1);
      } else {
        setOffset(single * 2);
        setTimeout(() => {
          setDisableTransition(true);
          setOffset(single);
          setPage(0);
          requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
        }, 760);
      }
    } else {
      if (page === 1) {
        setOffset(single);
        setPage(0);
      } else {
        setOffset(maxSingle);
        setTimeout(() => {
          setDisableTransition(true);
          setOffset(single + maxSingle);
          setPage(1);
          requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
        }, 760);
      }
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    startXRef.current = e.pageX;
    startOffsetRef.current = offset;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.pageX - startXRef.current;
    if (Math.abs(dx) > 5) hasMovedRef.current = true;
    setOffset(startOffsetRef.current - dx);
  };

  const onMouseUpOrLeave = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      const single = getSingleWidth();
      const maxSingle = getMaxSingle();
      if (single === 0) return;
      const middle0 = single;
      const middle1 = single + maxSingle;
      const nearest = Math.abs(offset - middle0) < Math.abs(offset - middle1) ? middle0 : middle1;
      setOffset(nearest);
      setPage(nearest === middle0 ? 0 : 1);
      // handle clone snap if dragged far
      setTimeout(() => {
        if (offset < single * 0.5 || offset >= single * 2) {
          const normalized = offset < single * 0.5 ? offset + single : offset - single;
          const snap = Math.abs(normalized - middle0) < Math.abs(normalized - middle1) ? middle0 : middle1;
          setDisableTransition(true);
          setOffset(snap);
          setPage(snap === middle0 ? 0 : 1);
          requestAnimationFrame(() => requestAnimationFrame(() => setDisableTransition(false)));
        }
      }, 760);
      setTimeout(() => { hasMovedRef.current = false; }, 50);
    }
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
        <button
          className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
          onClick={() => handleScrollBtn('left')}
          aria-label="Cuộn sang trái"
        >
          <ChevronLeft className="w-5 h-5 hover:scale-110 transition-transform" />
        </button>

        <div ref={viewportRef} className="overflow-hidden py-4 cursor-grab active:cursor-grabbing">
          <div
            ref={trackRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            className="flex items-end gap-4 sm:gap-6 py-2 will-change-transform"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "flex-end",
              width: "max-content",
              transform: `translateX(-${offset}px)`,
              transition: isDragging || disableTransition ? "none" : "transform 750ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "transform",
            } as React.CSSProperties}
          >
            {loopTop10.map((manga, idx) => {
              const origIndex = idx % 10;
              return (
                <div key={`${manga.id || manga.slug || 'top10'}-${idx}`} className="relative flex-shrink-0 w-48 sm:w-56 h-64 sm:h-72 flex items-end">
                  <div className="absolute -left-4 sm:-left-6 bottom-[-10px] z-0 flex items-center justify-start h-full">
                    <span
                      className="text-[8rem] sm:text-[10rem] font-black italic text-transparent select-none leading-none"
                      style={{
                        WebkitTextStroke: '2px rgba(168, 85, 247, 0.8)',
                        textShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
                      }}
                    >
                      {origIndex + 1}
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
              );
            })}
          </div>
        </div>

        <button
          className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
          onClick={() => handleScrollBtn('right')}
          aria-label="Cuộn sang phải"
        >
          <ChevronRight className="w-5 h-5 hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
