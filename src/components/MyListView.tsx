import React from 'react';
import { Movie, MyListItem, UserProfile } from '../types';
import { Bookmark, Play, Trash2, Film, Sparkles } from 'lucide-react';
import { getImageUrl } from '../services/movieApi';

interface MyListViewProps {
  myList: MyListItem[];
  activeProfile?: UserProfile | null;
  profileName?: string;
  onPlaySlug?: (slug: string, name: string) => void;
  onPlayMovieSlug?: (slug: string) => void;
  onOpenDetailSlug?: (slug: string, name: string, thumb: string) => void;
  onSelectMovieSlug?: (slug: string, name: string, thumb: string) => void;
  onRemoveItem: (slug: string) => void;
  onExploreMovies?: () => void;
  onExploreClick?: () => void;
}

export const MyListView: React.FC<MyListViewProps> = ({
  myList,
  activeProfile,
  profileName,
  onPlaySlug,
  onPlayMovieSlug,
  onOpenDetailSlug,
  onSelectMovieSlug,
  onRemoveItem,
  onExploreMovies,
  onExploreClick,
}) => {
  const displayProfileName = profileName || activeProfile?.name || 'Bạn';
  const handlePlay = (slug: string, name: string) => {
    if (onPlaySlug) onPlaySlug(slug, name);
    else if (onPlayMovieSlug) onPlayMovieSlug(slug);
  };
  const handleOpenDetail = (slug: string, name: string, thumb: string) => {
    if (onOpenDetailSlug) onOpenDetailSlug(slug, name, thumb);
    else if (onSelectMovieSlug) onSelectMovieSlug(slug, name, thumb);
  };
  const handleExplore = onExploreMovies || onExploreClick || (() => {});

  return (
    <div id="my-list-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-blue-900/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <Bookmark className="w-6 h-6 text-sky-400" />
            <span>Danh Sách Của Tôi</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Hồ sơ: <span className="text-white font-semibold">{displayProfileName}</span> • {myList.length} phim đã lưu
          </p>
        </div>
      </div>

      {myList.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 sm:gap-7 lg:gap-8">
          {myList.map((item, idx) => (
            <div
              key={`${item.movieSlug}-${idx}`}
              id={`mylist-card-${item.movieSlug}`}
              className="group relative bg-[#0f172a] rounded-2xl overflow-hidden border border-blue-900/50 hover:border-blue-500/80 transition-all hover:scale-105 shadow-lg flex flex-col"
            >
              {/* Poster */}
              <div
                className="aspect-[2/3] w-full overflow-hidden cursor-pointer relative"
                onClick={() =>
                  handleOpenDetail(
                    item.movieSlug,
                    item.movieName,
                    item.moviePoster || item.movieThumb
                  )
                }
              >
                <img
                  src={getImageUrl(item.moviePoster || item.movieThumb)}
                  alt={item.movieName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80';
                  }}
                />

                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {item.quality && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-950/80 text-cyan-300 border border-blue-700/60 backdrop-blur-md">
                      {item.quality}
                    </span>
                  )}
                </div>

                {/* Quick Play Overlay */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/40">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Info + Actions */}
              <div className="p-3 flex flex-col justify-between flex-1 bg-[#0b1329]">
                <div>
                  <h3 className="text-xs font-bold text-white line-clamp-1 group-hover:text-sky-300">
                    {item.movieName}
                  </h3>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>{item.year || '2024'}</span>
                    {item.episode_current && <span className="text-sky-400 font-semibold">{item.episode_current}</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800">
                  <button
                    onClick={() => handlePlay(item.movieSlug, item.movieName)}
                    className="flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" /> Xem ngay
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.movieSlug)}
                    className="text-slate-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                    title="Xóa khỏi danh sách"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center bg-[#0f172a]/60 rounded-2xl border border-blue-900/40 p-8 max-w-lg mx-auto">
          <Bookmark className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1">Danh sách của bạn đang trống</h2>
          <p className="text-xs text-slate-400 mb-6">
            Thêm các bộ phim yêu thích vào danh sách để dễ dàng tìm và xem lại bất cứ lúc nào trên Gấu.
          </p>
          <button
            onClick={handleExplore}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-xl shadow-blue-600/30 cursor-pointer"
          >
            Khám phá phim ngay
          </button>
        </div>
      )}
    </div>
  );
};
