import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import {
  MangaItem,
  getFallbackMangaImageUrl,
  handleMangaImageError,
} from "../../services/mangaApi";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { MangaSourceBadge } from "./MangaSourceBadge";

interface MangaRowProps {
  title: string;
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
  icon?: React.ReactNode;
}

export const MangaRow: React.FC<MangaRowProps> = ({
  title,
  mangas,
  onOpenDetail,
  icon,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);

  const loopMangas = useMemo(() => {
    if (mangas.length <= 1) return mangas;
    return [...mangas, ...mangas, ...mangas];
  }, [mangas]);

  const getSingleWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.scrollWidth / 3;
  }, [loopMangas.length]);

  const handleScrollBtn = (direction: "left" | "right") => {
    const vp = viewportRef.current;
    const single = getSingleWidth();
    if (!vp || single === 0) return;
    const scrollAmount = Math.round(vp.clientWidth * 0.78);
    const delta = direction === "left" ? -scrollAmount : scrollAmount;
    const next = offset + delta;
    setOffset(next);
    setTimeout(() => {
      if (next >= single * 2) {
        setDisableTransition(true);
        setOffset(next - single);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setDisableTransition(false)),
        );
      } else if (next < 0) {
        setDisableTransition(true);
        setOffset(next + single);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setDisableTransition(false)),
        );
      }
    }, 760);
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
      if (single > 0) {
        setTimeout(() => {
          if (offset >= single * 2) {
            setDisableTransition(true);
            setOffset((o) => o - single);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => setDisableTransition(false)),
            );
          } else if (offset < 0) {
            setDisableTransition(true);
            setOffset((o) => o + single);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => setDisableTransition(false)),
            );
          }
        }, 0);
      }
      setTimeout(() => {
        hasMovedRef.current = false;
      }, 50);
    }
  };

  const handleClickItem = (manga: MangaItem) => {
    if (hasMovedRef.current) return;
    onOpenDetail(manga);
  };

  if (!mangas || mangas.length === 0) return null;

  const canScroll = mangas.length > 2;

  return (
    <div className="relative group/row my-8 px-4 sm:px-6 lg:px-8 select-none">
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-purple-500">{icon}</span>}
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>

      <div className="relative -mx-2 px-2">
        {canScroll && (
          <button
            onClick={() => handleScrollBtn("left")}
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-5 h-5 hover:scale-110 transition-transform" />
          </button>
        )}

        <div
          ref={viewportRef}
          className="overflow-hidden py-2 cursor-grab active:cursor-grabbing"
        >
          <div
            ref={trackRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            className="flex w-max gap-4 sm:gap-5 will-change-transform"
            style={
              {
                display: "flex",
                flexWrap: "nowrap",
                transform: `translateX(-${offset}px)`,
                transition:
                  isDragging || disableTransition
                    ? "none"
                    : "transform 750ms cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "transform",
              } as React.CSSProperties
            }
          >
            {loopMangas.map((manga, idx) => (
              <div
                key={`${manga.id || manga.slug || "manga"}-${idx}`}
                onClick={() => handleClickItem(manga)}
                className="group relative flex-shrink-0 w-32 sm:w-40 md:w-44 flex flex-col cursor-pointer"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#18181b] mb-3 shadow-md border border-white/5 group-hover:border-purple-500/50 transition-colors duration-300">
                  <img
                    src={manga.coverUrl}
                    alt={manga.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
                    loading="lazy"
                    onError={(e) => handleMangaImageError(e, manga.coverUrl)}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="bg-purple-600 text-white rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-purple-600/40">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
                    {manga.status ? (
                      <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-md border border-white/10 rounded text-[8px] font-bold text-gray-200 uppercase tracking-wider line-clamp-1 max-w-[60%]">
                        {manga.status}
                      </span>
                    ) : (
                      <span />
                    )}
                    <MangaSourceBadge source={manga.source} size="xs" />
                  </div>
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-gray-200 line-clamp-2 group-hover:text-purple-400 transition-colors leading-snug">
                  {manga.title}
                </h3>
              </div>
            ))}
          </div>
        </div>

        {canScroll && (
          <button
            onClick={() => handleScrollBtn("right")}
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className="w-5 h-5 hover:scale-110 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};
