import React, { useState } from 'react';
import { MangaItem, MangaChapter } from '../../services/mangaApi';
import { X, BookOpen, Star, User, Calendar, Tag, Search, Play } from 'lucide-react';

interface MangaDetailModalProps {
  manga: MangaItem;
  onClose: () => void;
  onReadChapter: (manga: MangaItem, chapter: MangaChapter) => void;
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  manga,
  onClose,
  onReadChapter,
}) => {
  const [chapterSearch, setChapterSearch] = useState<string>('');

  const filteredChapters = manga.chapters.filter((ch) =>
    ch.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
    ch.chapterNumber.toLowerCase().includes(chapterSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Banner area */}
        <div className="relative p-6 bg-gradient-to-b from-[#27272a] to-[#18181b] border-b border-white/10 flex items-start space-x-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 text-gray-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Cover image */}
          <img
            src={manga.coverUrl}
            alt={manga.title}
            className="w-28 h-40 sm:w-36 sm:h-52 object-cover rounded-xl shadow-lg border border-white/10 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
            }}
          />

          <div className="flex-1 pr-8 space-y-2">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-600/20 text-red-400 border border-red-500/30 uppercase">
                {manga.source.toUpperCase()}
              </span>
              {manga.status && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-gray-300">
                  {manga.status}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white line-clamp-2">{manga.title}</h2>

            {manga.authors && manga.authors.length > 0 && (
              <p className="text-xs sm:text-sm text-gray-400 flex items-center space-x-1.5">
                <User className="w-4 h-4 text-gray-500" />
                <span>Tác giả: {manga.authors.join(', ')}</span>
              </p>
            )}

            {manga.genres && manga.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {manga.genres.slice(0, 5).map((genre, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-gray-300 border border-white/5">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center space-x-3">
              {manga.chapters.length > 0 && (
                <button
                  onClick={() => onReadChapter(manga, manga.chapters[0])}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-xs sm:text-sm flex items-center space-x-2 transition shadow-lg shadow-red-600/20"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Đọc từ đầu</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content & Chapters */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          {manga.description && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Tóm tắt nội dung</h3>
              <p className="text-sm text-gray-400 leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">
                {manga.description}
              </p>
            </div>
          )}

          {/* Chapter list section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-red-500" />
                <span>Danh sách chương ({manga.chapters.length})</span>
              </h3>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Tìm chương (vd: 1, 15...)"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {filteredChapters.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">Không tìm thấy chương phù hợp.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredChapters.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => onReadChapter(manga, ch)}
                    className="text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-gray-200 hover:text-white transition flex items-center justify-between group"
                  >
                    <span className="line-clamp-1 font-medium">{ch.title}</span>
                    <BookOpen className="w-3.5 h-3.5 text-gray-500 group-hover:text-red-500 flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
