import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { Movie } from "../types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getImageUrl } from "../services/movieApi";

interface Top10CarouselProps {
  title: string;
  movies: Movie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay: (movie: Movie) => void;
}

export const Top10Carousel: React.FC<Top10CarouselProps> = ({
  title,
  movies,
  onOpenDetail,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);
  const [page, setPage] = useState(0); // 0: 1-6, 1: 5-10 (middle set)

  const top10Movies = useMemo(() => movies.slice(0, 10), [movies]);
  const loopMovies = useMemo(() => [...top10Movies, ...top10Movies, ...top10Movies], [top10Movies]);

  const singleWidthRef = useRef(0);
  const maxSingleRef = useRef(0);

  const getSingleWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.scrollWidth / 3;
  }, [loopMovies.length]);

  const getMaxSingle = useCallback(() => {
    const vp = viewportRef.current;
    const single = singleWidthRef.current || getSingleWidth();
    if (!vp || single === 0) return 0;
    return Math.max(0, single - vp.clientWidth);
  }, [getSingleWidth]);

  const refreshMetrics = useCallback(() => {
    const single = getSingleWidth();
    const vp = viewportRef.current;
    if (single > 0 && vp) {
      singleWidthRef.current = single;
      maxSingleRef.current = Math.max(0, single - vp.clientWidth);
    }
  }, [getSingleWidth]);

  // Init at middle page 0 (single) — 1-6, cache metrics to avoid forced reflow on first click
  useLayoutEffect(() => {
    const init = () => {
      refreshMetrics();
      const single = singleWidthRef.current;
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
  }, [refreshMetrics, loopMovies]);

  const handleScrollBtn = (direction: "left" | "right") => {
    const single = singleWidthRef.current || getSingleWidth();
    const maxSingle = maxSingleRef.current || getMaxSingle();
    if (single === 0) return;

    if (direction === "right") {
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
    const next = startOffsetRef.current - dx;
    setOffset(next);
  };

  const onMouseUpOrLeave = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      const single = singleWidthRef.current || getSingleWidth();
      const maxSingle = maxSingleRef.current || getMaxSingle();
      if (single === 0) return;
      const middle0 = single;
      const middle1 = single + maxSingle;
      const dist0 = Math.abs(offset - middle0);
      const dist1 = Math.abs(offset - middle1);
      let normalizedOffset = offset;
      let needsSnap = false;
      if (offset < single * 0.5) {
        normalizedOffset = offset + single;
        needsSnap = true;
      } else if (offset >= single * 2) {
        normalizedOffset = offset - single;
        needsSnap = true;
      }
      const snapTo = Math.abs(normalizedOffset - middle0) < Math.abs(normalizedOffset - middle1) ? middle0 : middle1;
      if (needsSnap) {
        setOffset(snapTo);
        setPage(snapTo === middle0 ? 0 : 1);
      } else {
        const nearest = dist0 < dist1 ? middle0 : middle1;
        setOffset(nearest);
        setPage(nearest === middle0 ? 0 : 1);
      }
      setTimeout(() => { hasMovedRef.current = false; }, 50);
    }
  };

  const handleClickItem = (movie: Movie) => {
    if (hasMovedRef.current) return;
    onOpenDetail(movie);
  };

  if (!top10Movies.length) return null;

  return (
    <div className="bg-black py-8 px-4 sm:px-8 select-none">
      <h2 className="text-white text-2xl font-bold mb-6">{title}</h2>

      <div className="relative group">
        <button
          className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
          onClick={() => handleScrollBtn("left")}
          aria-label="Cuộn sang trái"
        >
          <ChevronLeft className="w-5 h-5 hover:scale-110 transition-transform" />
        </button>

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
            className="flex items-end gap-12 sm:gap-14 py-2 will-change-transform"
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
            {loopMovies.map((movie, idx) => {
              const origIndex = idx % 10;
              const isMiddleSet = idx >= 10 && idx < 20;
              return (
                <div
                  key={`${movie.slug || "top10"}-${idx}`}
                  className="relative flex-shrink-0 w-64 h-80 flex items-end overflow-visible"
                  style={{ contain: "layout style", transform: "translateZ(0)" } as React.CSSProperties}
                >
                  <div className="absolute -left-8 bottom-6 z-0 flex items-center justify-start h-72 overflow-visible" style={{ willChange: "transform", transform: "translateZ(0)" } as React.CSSProperties}>
                    <span
                      className="text-[15rem] leading-none font-black italic text-black select-none"
                      style={{
                        WebkitTextStroke: "3px #2563EB",
                        textShadow: "0 0 24px rgba(37,99,235,0.5)",
                        transform: "translateZ(0)",
                        backfaceVisibility: "hidden",
                        willChange: "transform",
                        lineHeight: "1",
                        display: "block",
                      } as React.CSSProperties}
                    >
                      {origIndex + 1}
                    </span>
                  </div>

                  <div
                    className="relative z-10 ml-16 w-48 h-72 rounded-lg overflow-hidden cursor-pointer shadow-2xl transition-transform hover:scale-105 will-change-transform bg-[#0f172a]"
                    onClick={() => handleClickItem(movie)}
                    style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" } as React.CSSProperties}
                  >
                    <img
                      src={getImageUrl(movie.thumb_url || movie.poster_url)}
                      alt={movie.name}
                      className="w-full h-full object-cover pointer-events-none"
                      loading={isMiddleSet ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={isMiddleSet ? "high" : "low" as any}
                      style={{ transform: "translateZ(0)" } as React.CSSProperties}
                    />

                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                      <p className="text-white font-bold truncate">{movie.name}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-30 w-8 sm:w-9 h-14 sm:h-16 bg-[#0b1329]/85 hover:bg-blue-600 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md rounded-full border border-slate-700/80 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
          onClick={() => handleScrollBtn("right")}
          aria-label="Cuộn sang phải"
        >
          <ChevronRight className="w-5 h-5 hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
