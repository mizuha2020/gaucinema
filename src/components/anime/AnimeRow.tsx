import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AnimeRowProps {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}

export const AnimeRow: React.FC<AnimeRowProps> = ({ title, subtitle, onSeeAll, children }) => {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 900), behavior: 'smooth' });
  };

  return (
    <section className="mb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-[18px] sm:text-[20px] font-black tracking-tight text-white flex items-center gap-3">
            <span className="hidden sm:block w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
            {title}
            <span className="hidden sm:inline-flex text-[11px] font-bold tracking-widest px-2 py-1 rounded-full bg-amber-400 text-black">HOT</span>
          </h2>
          {subtitle && <p className="text-[13px] text-white/40 mt-1 hidden sm:block">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="hidden sm:inline-flex text-[13px] font-semibold px-3 py-1.5 rounded-full bg-white text-black hover:bg-zinc-100 transition-colors"
            >
              Xem tất cả
            </button>
          )}
          <button
            onClick={() => scrollBy(-1)}
            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur border border-white/10 text-white hover:bg-white hover:text-black flex items-center justify-center transition-colors"
            aria-label="Cuộn trái"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur border border-white/10 text-white hover:bg-white hover:text-black flex items-center justify-center transition-colors"
            aria-label="Cuộn phải"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth"
      >
        {/* Wrap children to fix width */}
        {React.Children.map(children, (child) => (
          <div className="shrink-0 w-[148px] sm:w-[168px] snap-start">{child}</div>
        ))}
      </div>
    </section>
  );
};
