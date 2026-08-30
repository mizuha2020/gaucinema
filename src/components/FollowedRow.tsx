import React from 'react';
import { FollowedMovie } from '../services/followMovieService';
import { getImageUrl } from '../services/movieApi';
import { Movie } from '../types';
import { Bell, Play, Eye, Trash2, Clock, Sparkles } from 'lucide-react';

interface FollowedRowProps {
  items: FollowedMovie[];
  onOpenDetail: (movie: Movie) => void;
  onPlay: (movie: Movie) => void;
  onClearNew: (slug: string) => void;
  onUnfollow: (slug: string) => void;
}

export const FollowedRow: React.FC<FollowedRowProps> = ({ items, onOpenDetail, onPlay, onClearNew, onUnfollow }) => {
  if (!items || items.length === 0) return null;
  const hasNew = items.filter(m=> m.hasNewEpisode);
  const normal = items.filter(m=> !m.hasNewEpisode);

  const Card: React.FC<{it: FollowedMovie}> = ({ it }) => {
    const movie: Movie = it.movieSnapshot || {
      name: it.name, slug: it.slug, origin_name: it.origin_name,
      poster_url: it.poster_url, thumb_url: it.thumb_url, year: it.year, quality: it.quality, lang: it.lang, episode_current: it.episode_current,
    };
    return (
      <div className="group relative w-64 shrink-0 bg-[#0f172a] rounded-2xl overflow-hidden border border-violet-900/50 hover:border-violet-500/80 transition-all shadow-md">
        <div className="relative aspect-video w-full cursor-pointer" onClick={()=> onOpenDetail(movie)}>
          <img src={getImageUrl(it.thumb_url || it.poster_url)} alt={it.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="bg-violet-600 text-white p-2.5 rounded-full shadow-xl shadow-violet-600/40"><Play className="w-4 h-4 fill-white ml-0.5" /></span>
          </div>
          {it.hasNewEpisode && (
            <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">TẬP MỚI • {it.latestEpisode}</span>
          )}
          {!it.hasNewEpisode && it.episode_current && (
            <span className="absolute top-2 left-2 bg-slate-900/80 text-violet-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-violet-800/60">{it.lastKnownEpisode}</span>
          )}
          <button
            onClick={(e)=> { e.stopPropagation(); onUnfollow(it.slug); }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center border border-white/20 cursor-pointer"
            title="Bỏ theo dõi"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        <div className="p-3">
          <h4 className="font-semibold text-xs text-white truncate group-hover:text-violet-300">{it.name}</h4>
          <p className="text-[11px] text-slate-400 truncate">{it.origin_name}</p>
          {it.hasNewEpisode ? (
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={()=> { onClearNew(it.slug); onPlay(movie); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer">
                <Play className="w-3 h-3 fill-white" /> Xem tập mới
              </button>
              <button onClick={()=> onClearNew(it.slug)} className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 cursor-pointer flex items-center gap-1">
                <Eye className="w-3 h-3" /> Đã xem
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={()=> onPlay(movie)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer">
                <Play className="w-3 h-3 fill-white" /> Xem tiếp
              </button>
              <button onClick={()=> onOpenDetail(movie)} className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 cursor-pointer">Chi tiết</button>
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Theo dõi {new Date(it.followedAt).toLocaleDateString('vi-VN')}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-3 mb-4">
      {hasNew.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-400" />
              <span>Có tập mới ({hasNew.length})</span>
            </h2>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-none">
            {hasNew.map(it=> <Card key={it.slug} it={it} />)}
          </div>
        </>
      )}
      {normal.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 mt-4">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>Đang theo dõi ({normal.length})</span>
            </h2>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-none">
            {normal.map(it=> <Card key={it.slug} it={it} />)}
          </div>
        </>
      )}
    </div>
  );
};
