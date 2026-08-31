import React, { useState } from 'react';
import { MangaItem, getFallbackMangaImageUrl } from '../../services/mangaApi';
import { ChevronLeft, ChevronRight, BookOpen, Sparkles } from 'lucide-react';
import { MangaSourceBadge } from './MangaSourceBadge';

interface MangaGenreBannerProps {
  mangas: MangaItem[];
  onOpenDetail: (manga: MangaItem) => void;
}

interface GenreCategory {
  id: string;
  name: string;
  subtitle: string;
}

const GENRES: GenreCategory[] = [
  { id: 'action', name: 'HÀNH ĐỘNG', subtitle: 'Shounen & Siêu Phẩm Hot Nhất' },
  { id: 'romance', name: 'NGÔN TÌNH', subtitle: 'Tình Cảm & Lãng Mạn Ngọt Ngào' },
  { id: 'fantasy', name: 'CHUYỂN SINH', subtitle: 'Thế Giới Khác & Phép Thuật' },
  { id: 'cultivation', name: 'TIÊN HIỆP', subtitle: 'Tu Tiên & Võ Hiệp Đỉnh Cao' },
  { id: 'comedy', name: 'HÀI HƯỚC', subtitle: 'Giải Trí & Đời Thường Vui Nhộn' },
];

export const MangaGenreBanner: React.FC<MangaGenreBannerProps> = ({ mangas, onOpenDetail }) => {
  const [currentGenreIndex, setCurrentGenreIndex] = useState(0);

  if (!mangas || mangas.length < 3) return null;

  const currentGenre = GENRES[currentGenreIndex];

  // Pick 3 mangas for desktop, and 1 main manga for mobile
  const startIndex = (currentGenreIndex * 3) % Math.max(1, mangas.length - 2);
  const selectedMangas = [
    mangas[startIndex % mangas.length],
    mangas[(startIndex + 1) % mangas.length],
    mangas[(startIndex + 2) % mangas.length],
  ];

  const handlePrev = () => {
    setCurrentGenreIndex((prev) => (prev === 0 ? GENRES.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentGenreIndex((prev) => (prev === GENRES.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative py-6 sm:py-8 px-3 sm:px-6 lg:px-8 bg-gradient-to-b from-[#0b0c16] via-[#121324] to-[#0b0c16] rounded-3xl sm:rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl my-6">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 sm:w-96 h-72 sm:h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header title & Navigation arrows */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="text-center sm:text-left">
          <div className="inline-flex items-center space-x-2 bg-red-600/20 border border-red-500/30 px-3 py-1 rounded-full mb-2">
            <Sparkles className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wider text-red-400 uppercase">Khám Phá Theo Thể Loại</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center sm:justify-start gap-2">
            <span>TRUYỆN</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-fuchsia-500 to-purple-500">
              {currentGenre.name}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 font-medium mt-1">{currentGenre.subtitle}</p>
        </div>

        {/* Category Switcher & Arrows */}
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
          {/* Mobile & Desktop genre scrollable or selectable pills */}
          <div className="flex items-center space-x-1 bg-black/50 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md overflow-x-auto max-w-full no-scrollbar">
            {GENRES.map((g, idx) => (
              <button
                key={g.id}
                onClick={() => setCurrentGenreIndex(idx)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                  currentGenreIndex === idx
                    ? 'bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center space-x-2">
            <button
              onClick={handlePrev}
              className="w-10 h-10 rounded-2xl bg-black/60 hover:bg-purple-600 text-white border border-white/10 flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95"
              aria-label="Previous genre"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              className="w-10 h-10 rounded-2xl bg-black/60 hover:bg-purple-600 text-white border border-white/10 flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95"
              aria-label="Next genre"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Showcase Banner: 1 poster on mobile, 3 posters on desktop */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-center py-2 sm:py-6 px-1 sm:px-6">
        {selectedMangas.map((manga, idx) => {
          // On mobile, only show the center/first manga (idx === 1), hide idx 0 and 2 on mobile
          const mobileVisibilityClass = idx === 1 ? 'block' : 'hidden md:block';

          const slantClass = idx === 0 
            ? 'md:-rotate-3 md:translate-y-4 hover:rotate-0' 
            : idx === 2 
            ? 'md:rotate-3 md:translate-y-4 hover:rotate-0' 
            : 'md:scale-105 md:-translate-y-2 z-20';

          return (
            <div
              key={`${manga.id}-${idx}`}
              onClick={() => onOpenDetail(manga)}
              className={`group relative rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 shadow-2xl border border-white/15 bg-black/60 aspect-[3/4] sm:aspect-[3/4] ${slantClass} hover:border-purple-500 hover:shadow-purple-500/30 ${mobileVisibilityClass}`}
            >
              <img
                src={manga.coverUrl}
                alt={manga.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = getFallbackMangaImageUrl(manga.coverUrl, target.src);
                }}
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90 group-hover:opacity-80 transition-opacity" />

              {/* Top Badges */}
              <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                <div className="flex items-center space-x-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span className="text-[10px] font-bold text-white uppercase">{currentGenre.name} #{idx + 1}</span>
                </div>
                <MangaSourceBadge source={manga.source} size="xs" />
              </div>

              {/* Content info at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 flex flex-col justify-end">
                <h3 className="font-extrabold text-sm sm:text-base text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                  {manga.title}
                </h3>
                <p className="text-[11px] text-gray-300 font-medium mt-0.5 line-clamp-1">
                  Cập nhật chương mới
                </p>
              </div>

              {/* Read button overlay on hover */}
              <div className="absolute inset-0 bg-purple-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="bg-gradient-to-r from-red-600 to-purple-600 text-white px-5 py-2.5 rounded-2xl font-bold text-xs shadow-2xl flex items-center space-x-2 transform translate-y-3 group-hover:translate-y-0 transition-all duration-300">
                  <BookOpen className="w-4 h-4" />
                  <span>Đọc Ngay</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paint splatter graphic accent at bottom center */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-48 h-6 bg-white/5 blur-md rounded-full pointer-events-none" />
    </div>
  );
};
