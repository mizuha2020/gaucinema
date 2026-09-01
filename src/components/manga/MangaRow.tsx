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
import { smoothScrollHorizontal } from "../../utils/scrollUtils";

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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ========== MOBILE: native scroll (e0ccb2e / 52269b8) ==========
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftStartRef = useRef(0);
  const hasMovedRef = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollAnimCancelRef = useRef<(() => void) | null>(null);

  const checkScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 8);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
  }, []);
  useEffect(() => {
    if (!isMobile) return;
    checkScrollBounds();
    window.addEventListener("resize", checkScrollBounds);
    return () => window.removeEventListener("resize", checkScrollBounds);
  }, [checkScrollBounds, mangas, isMobile]);

  const handleMobileScrollBtn = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollAnimCancelRef.current) scrollAnimCancelRef.current();
    const scrollAmount = Math.round(el.clientWidth * 0.75);
    const delta = direction === "left" ? -scrollAmount : scrollAmount;
    scrollAnimCancelRef.current = smoothScrollHorizontal(
      el,
      delta,
      460,
      checkScrollBounds,
    );
  };
  const onMobileMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftStartRef.current = el.scrollLeft;
  };
  const onMobileMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(walk) > 5) hasMovedRef.current = true;
    el.scrollLeft = scrollLeftStartRef.current - walk;
  };
  const onMobileMouseUpOrLeave = () => {
    isDraggingRef.current = false;
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 50);
  };
  const handleClickItem = (manga: MangaItem) => {
    if (hasMovedRef.current) return;
    onOpenDetail(manga);
  };

  // ========== DESKTOP: transform infinite loop ==========
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXDesktopRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const loopMangas = useMemo(() => {
    if (mangas.length <= 1) return mangas;
    return [...mangas, ...mangas, ...mangas];
  }, [mangas]);

  const getSingleWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.scrollWidth / 3;
  }, [loopMangas.length]);

  // desktop handlers
  const handleDesktopScrollBtn = (direction: "left" | "right") => {
    const vp = viewportRef.current;
    const single = getSingleWidth();
    if (!vp || single === 0) return;
    const scrollAmount = Math.round(vp.clientWidth * 0.78);
    const delta = direction === "left" ? -scrollAmount : scrollAmount;
    const next = offsetRef.current + delta;
    setOffset(next);
    offsetRef.current = next;
    if (trackRef.current)
      trackRef.current.style.transform = `translateX(-${next}px)`;
    setTimeout(() => {
      if (next >= single * 2) {
        setDisableTransition(true);
        setOffset(next - single);
        offsetRef.current = next - single;
        if (trackRef.current)
          trackRef.current.style.transform = `translateX(-${next - single}px)`;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setDisableTransition(false)),
        );
      } else if (next < 0) {
        setDisableTransition(true);
        setOffset(next + single);
        offsetRef.current = next + single;
        if (trackRef.current)
          trackRef.current.style.transform = `translateX(-${next + single}px)`;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setDisableTransition(false)),
        );
      }
    }, 760);
  };
  const onDesktopMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    setDisableTransition(true);
    startXDesktopRef.current = e.pageX;
    startOffsetRef.current = offsetRef.current;
  };
  const onDesktopMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.pageX - startXDesktopRef.current;
    if (Math.abs(dx) > 5) hasMovedRef.current = true;
    const next = startOffsetRef.current - dx;
    offsetRef.current = next;
    if (trackRef.current)
      trackRef.current.style.transform = `translateX(-${next}px)`;
  };
  const onDesktopMouseUpOrLeave = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      const single = getSingleWidth();
      const cur = offsetRef.current;
      if (single > 0) {
        let snapped = cur;
        let needsSnap = false;
        if (cur >= single * 2) {
          snapped = cur - single;
          needsSnap = true;
        } else if (cur < 0) {
          snapped = cur + single;
          needsSnap = true;
        }
        if (needsSnap) {
          setOffset(snapped);
          offsetRef.current = snapped;
          if (trackRef.current)
            trackRef.current.style.transform = `translateX(-${snapped}px)`;
          setDisableTransition(true);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setDisableTransition(false)),
          );
        } else {
          setOffset(cur);
          setDisableTransition(false);
        }
      } else {
        setOffset(cur);
        setDisableTransition(false);
      }
      setTimeout(() => {
        hasMovedRef.current = false;
      }, 50);
    } else setDisableTransition(false);
  };
  const onDesktopTouchStart = (e: React.TouchEvent) => {
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    setDisableTransition(true);
    startXDesktopRef.current = e.touches[0].pageX;
    startYRef.current = e.touches[0].pageY;
    startOffsetRef.current = offsetRef.current;
  };
  const onDesktopTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.touches[0].pageX - startXDesktopRef.current;
    const dy = e.touches[0].pageY - startYRef.current;
    if (!hasMovedRef.current && Math.abs(dy) > Math.abs(dx) * 1.2) {
      isDraggingRef.current = false;
      setIsDragging(false);
      setDisableTransition(false);
      return;
    }
    if (Math.abs(dx) > 5) hasMovedRef.current = true;
    const next = startOffsetRef.current - dx;
    offsetRef.current = next;
    if (trackRef.current)
      trackRef.current.style.transform = `translateX(-${next}px)`;
  };
  const onDesktopTouchEnd = () => onDesktopMouseUpOrLeave();

  if (!mangas || mangas.length === 0) return null;

  if (isMobile) {
    return (
      <div className="relative group/row my-8 px-4 sm:px-6 lg:px-8 select-none">
        <div className="flex items-center gap-2 mb-4">
          {icon && <span className="text-purple-500">{icon}</span>}
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {title}
          </h2>
        </div>
        <div className="relative -mx-2 px-2">
          {canScrollLeft && (
            <button
              onClick={() => handleMobileScrollBtn("left")}
              className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white hidden sm:flex items-center justify-center transition-all backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer"
              aria-label="Cuộn sang trái"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div
            ref={containerRef}
            onScroll={checkScrollBounds}
            onMouseDown={onMobileMouseDown}
            onMouseMove={onMobileMouseMove}
            onMouseUp={onMobileMouseUpOrLeave}
            onMouseLeave={onMobileMouseUpOrLeave}
            className="flex w-full overflow-x-auto scrollbar-none overscroll-x-contain gap-4 sm:gap-5 py-2 cursor-grab active:cursor-grabbing"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
          >
            {mangas.map((manga, idx) => (
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
          {canScrollRight && (
            <button
              onClick={() => handleMobileScrollBtn("right")}
              className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white hidden sm:flex items-center justify-center transition-all backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer"
              aria-label="Cuộn sang phải"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

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
            onClick={() => handleDesktopScrollBtn("left")}
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div
          ref={viewportRef}
          className="overflow-hidden py-2 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "pan-y" }}
        >
          <div
            ref={trackRef}
            onMouseDown={onDesktopMouseDown}
            onMouseMove={onDesktopMouseMove}
            onMouseUp={onDesktopMouseUpOrLeave}
            onMouseLeave={onDesktopMouseUpOrLeave}
            onTouchStart={onDesktopTouchStart}
            onTouchMove={onDesktopTouchMove}
            onTouchEnd={onDesktopTouchEnd}
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
            onClick={() => handleDesktopScrollBtn("right")}
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b0c16]/85 hover:bg-purple-600 text-white flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 backdrop-blur-md rounded-full border border-white/10 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
            aria-label="Cuộn sang phải"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
