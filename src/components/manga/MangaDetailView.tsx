import React, { useState } from 'react';
import { MangaItem, MangaChapter, MangaHistoryItem, getProxyImageUrl } from '../../services/mangaApi';
import { ArrowLeft, BookOpen, Heart, Bookmark, User, Calendar, Play, Search, CheckCircle } from 'lucide-react';

interface MangaDetailViewProps {
  manga: MangaItem;
  onBack: () => void;
  onReadChapter: (chapter: MangaChapter, pageIndex?: number) => void;
  recentHistory?: MangaHistoryItem;
  isSaved: boolean;
  onToggleSave: () => void;
}

export const MangaDetailView: React.FC<MangaDetailViewProps> = ({
  manga,
  onBack,
  onReadChapter,
  recentHistory,
  isSaved,
  onToggleSave,
}) => {
  const [chapterSearch, setChapterSearch] = useState<string>('');

  const filteredChapters = manga.chapters.filter((ch) =>
    ch.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
    ch.chapterNumber.toLowerCase().includes(chapterSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0f0f11] text-white pt-28 sm:pt-32 pb-36 px-4 sm:px-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Back Navigation */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại danh sách</span>
      </button>

      {/* Main Detail Header Card */}
      <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row gap-8 items-start">
        {/* Cover image */}
        <div className="relative w-44 sm:w-56 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex-shrink-0 mx-auto md:mx-0">
          <img
            src={manga.coverUrl}
            alt={manga.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.src.includes('/api/proxy/image') && manga.coverUrl && manga.coverUrl.startsWith('http')) {
                target.src = getProxyImageUrl(manga.coverUrl);
              } else {
                target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
              }
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider">
              {manga.source.toUpperCase()}
            </span>
            {manga.status && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-gray-300">
                {manga.status}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-snug">{manga.title}</h1>

          {manga.authors && manga.authors.length > 0 && (
            <p className="text-sm text-gray-300 flex items-center space-x-2">
              <User className="w-4 h-4 text-blue-400" />
              <span>Tác giả: <strong className="text-white">{manga.authors.join(', ')}</strong></span>
            </p>
          )}

          {manga.genres && manga.genres.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {manga.genres.map((genre, idx) => (
                <span key={idx} className="text-xs px-3 py-1 rounded-lg bg-white/5 text-gray-200 border border-white/10 font-medium">
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-4 flex flex-wrap items-center gap-4">
            {recentHistory ? (
              <button
                onClick={() => {
                  const foundCh = manga.chapters.find((c) => c.id === recentHistory.chapterId) || manga.chapters[0];
                  onReadChapter(foundCh, recentHistory.pageIndex || 0);
                }}
                className="px-7 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl text-sm flex items-center space-x-2 transition shadow-xl shadow-blue-600/30"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Đọc tiếp ({recentHistory.chapterTitle})</span>
              </button>
            ) : manga.chapters.length > 0 ? (
              <button
                onClick={() => onReadChapter(manga.chapters[0], 0)}
                className="px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl text-sm flex items-center space-x-2 transition shadow-lg shadow-blue-600/30"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Đọc từ đầu</span>
              </button>
            ) : null}

            {recentHistory && manga.chapters.length > 0 && (
              <button
                onClick={() => onReadChapter(manga.chapters[0], 0)}
                className="px-5 py-3.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 font-medium rounded-2xl text-sm transition"
              >
                Đọc từ đầu
              </button>
            )}

            <button
              onClick={onToggleSave}
              className={`px-5 py-3.5 rounded-2xl text-sm font-medium border transition flex items-center space-x-2 ${
                isSaved
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-blue-400' : ''}`} />
              <span>{isSaved ? 'Đã lưu vào tủ truyện' : 'Lưu truyện'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Description Section */}
      {manga.description && (
        <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-3">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Tóm tắt nội dung</h2>
          <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
            {manga.description}
          </p>
        </div>
      )}

      {/* Chapters Section */}
      <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <span>Danh sách chương ({manga.chapters.length})</span>
          </h2>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Tìm số chương (vd: 1, 15...)"
              value={chapterSearch}
              onChange={(e) => setChapterSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {filteredChapters.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Không tìm thấy chương phù hợp.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-2">
            {filteredChapters.map((ch, idx) => (
              <button
                key={`${ch.id || ch.chapterNumber || 'ch'}-${idx}`}
                onClick={() => onReadChapter(ch)}
                className="text-left px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm text-gray-200 hover:text-white transition flex items-center justify-between group"
              >
                <span className="line-clamp-1 font-medium">{ch.title}</span>
                <BookOpen className="w-4 h-4 text-gray-500 group-hover:text-blue-400 flex-shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
