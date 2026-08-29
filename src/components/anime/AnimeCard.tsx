import React from 'react';
import { AnimeSearchResult } from '../../types/anime';
import { bestTitle, coverImage, proxiedImage } from '../../services/animapperService';
import { Play, Star } from 'lucide-react';

interface AnimeCardProps {
  item: AnimeSearchResult;
  onClick: (item: AnimeSearchResult) => void;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({ item, onClick }) => {
  const title = bestTitle(item.titles);
  const cover = proxiedImage(coverImage(item.images));
  const isManga = item.mediaType === 'MANGA';
  const year = item.seasonYear;

  return (
    <button
      onClick={() => onClick(item)}
      className="group relative flex flex-col text-left w-full"
    >
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-zinc-900 ring-1 ring-white/10 group-hover:ring-amber-400/30 transition-all duration-300">
        {cover ? (
          <img
            src={cover}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-white/20 text-3xl font-black">?</div>
        )}

        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* top badges */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={`text-[10px] font-black tracking-wider px-2 py-1 rounded-full backdrop-blur-md border shadow-sm ${isManga ? 'bg-violet-600/90 text-white border-violet-500/30' : 'bg-amber-400 text-black border-amber-300'}`}>
            {isManga ? 'MANGA' : 'ANIME'}
          </span>
          {item.format && (
            <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-1 rounded-full bg-black/60 text-white/80 backdrop-blur border border-white/10">
              {item.format}
            </span>
          )}
        </div>

        {year && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur border border-white/10">
            {year}
          </span>
        )}

        {/* hover play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>

        {/* bottom title on image */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-2 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
            {title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            {item.status && <span className="text-[11px] text-white/60 truncate">{item.status}</span>}
            {item.status && year && <span className="w-1 h-1 rounded-full bg-white/30" />}
            {year && <span className="text-[11px] text-white/50">{year}</span>}
          </div>
        </div>
      </div>
    </button>
  );
};
