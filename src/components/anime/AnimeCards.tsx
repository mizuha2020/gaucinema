import React from 'react';
import { MyListItem, UserActivityItem } from '../../types';
import { Play, Clock } from 'lucide-react';

function parseAnimeContentId(contentId: string): { mediaId: number; episodeId?: string } {
  const parts = contentId.split(':');
  const mediaId = Number(parts[1]);
  return { mediaId, episodeId: parts[2] };
}

interface ContinueWatchingCardProps {
  item: UserActivityItem;
  onResume: (item: UserActivityItem) => void;
}

export const ContinueWatchingCard: React.FC<ContinueWatchingCardProps> = ({ item, onResume }) => {
  const progress = Math.max(2, Math.min(100, item.progressPercent || 0));
  return (
    <button
      onClick={() => onResume(item)}
      className="group relative w-full text-left"
    >
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-zinc-900 ring-1 ring-white/10 group-hover:ring-amber-400/30 transition-all duration-300">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-white/20 text-3xl font-black">?</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        {/* play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="text-[10px] font-black px-2 py-1 rounded-full bg-white text-black">TIẾP TỤC</span>
          {progress > 5 && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur border border-white/10">{progress}%</span>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-2 drop-shadow">{item.title}</h3>
          <p className="text-[11px] text-white/60 mt-1 flex items-center gap-1 truncate">
            <Clock className="w-3 h-3 shrink-0" /> {item.subtitle || 'Đang xem dở'}
          </p>
        </div>
        {/* progress */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </button>
  );
};

interface MyListCardProps {
  item: MyListItem;
  onClick: (mediaId: number) => void;
}

export const MyListCard: React.FC<MyListCardProps> = ({ item, onClick }) => {
  const { mediaId } = parseAnimeContentId(item.movieSlug);
  return (
    <button
      onClick={() => onClick(mediaId)}
      className="group relative w-full text-left"
    >
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-zinc-900 ring-1 ring-white/10 group-hover:ring-amber-400/30 transition-all duration-300">
        {item.movieThumb ? (
          <img src={item.movieThumb} alt={item.movieName} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-white/20 text-3xl font-black">?</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-400 text-black">ĐÃ LƯU</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-[13px] font-bold text-white leading-tight line-clamp-2 drop-shadow">{item.movieName}</h3>
          <p className="text-[11px] text-white/50 mt-1 truncate">{[item.year, item.episode_current].filter(Boolean).join(' • ') || 'Anime'}</p>
        </div>
      </div>
    </button>
  );
};
