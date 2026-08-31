import React, { useState, useMemo } from "react";
import {
  MangaItem,
  MangaChapter,
  MangaHistoryItem,
  getFallbackMangaImageUrl,
} from "../../services/mangaApi";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  User,
  Search,
  Play,
  Share2,
  Check,
  Info,
  Sparkles,
  Clock,
  Star,
  Layers,
  Flame,
  Heart,
} from "lucide-react";
import { motion } from "motion/react";
import { MangaSourceBadge } from "./MangaSourceBadge";

interface MangaDetailViewProps {
  manga: MangaItem;
  onBack: () => void;
  onReadChapter: (chapter: MangaChapter, pageIndex?: number) => void;
  recentHistory?: MangaHistoryItem;
  isSaved: boolean;
  onToggleSave: () => void;
  relatedMangas?: MangaItem[];
  onOpenRelated?: (manga: MangaItem) => void;
}

export const MangaDetailView: React.FC<MangaDetailViewProps> = ({
  manga,
  onBack,
  onReadChapter,
  recentHistory,
  isSaved,
  onToggleSave,
  relatedMangas = [],
  onOpenRelated,
}) => {
  const [chapterSearch, setChapterSearch] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return manga.chapters;
    const q = chapterSearch.toLowerCase();
    return manga.chapters.filter(
      (ch) =>
        ch.title.toLowerCase().includes(q) ||
        ch.chapterNumber.toLowerCase().includes(q),
    );
  }, [manga.chapters, chapterSearch]);

  const handleShare = () => {
    try {
      const url = window.location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {}
  };

  const firstChapter = manga.chapters[0];
  const lastChapter = manga.chapters[manga.chapters.length - 1];

  return (
    <div className="min-h-screen bg-[#0b0c16] text-white pb-10 -mx-4 sm:-mx-8 -mt-6">
      {/* Hero Stage */}
      <section className="relative w-full min-h-[520px] sm:min-h-[560px] overflow-hidden mb-6">
        {/* Backdrop */}
        <div className="absolute inset-0">
          <img
            src={manga.coverUrl}
            alt={manga.title}
            className="w-full h-full object-cover object-top scale-105 blur-[2px] sm:blur-none opacity-40 sm:opacity-60"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              t.src = getFallbackMangaImageUrl(manga.coverUrl, t.src);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c16] via-[#0b0c16]/70 to-[#0b0c16]/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c16] via-[#0b0c16]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-fuchsia-900/10" />
        </div>

        {/* Content overlay - tăng pt để không bị navbar fixed đè khi navbar luôn hiện */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 pt-20 sm:pt-24 pb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur border border-white/10 text-white/80 hover:text-white text-sm font-medium transition mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại thư viện
          </button>

          <div className="flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
            {/* Cover */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative w-[170px] sm:w-[220px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0 mx-auto md:mx-0 bg-black"
            >
              <img
                src={manga.coverUrl}
                alt={manga.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  t.src = getFallbackMangaImageUrl(manga.coverUrl, t.src);
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {manga.chapters.length} chương
                </div>
              </div>
            </motion.div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <MangaSourceBadge source={manga.source} size="sm" />
                {manga.status && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/10 text-white/80">
                    {manga.status}
                  </span>
                )}
                {manga.genres?.slice(0, 1).map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-fuchsia-500/15 border border-fuchsia-500/20 text-fuchsia-300"
                  >
                    {g}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 text-xs text-white/50 bg-black/30 border border-white/10 px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3 text-amber-400" /> 4.8 • Hot
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]">
                {manga.title}
              </h1>
              {manga.altTitles && manga.altTitles[0] && (
                <p className="text-sm text-white/50 line-clamp-1">
                  {manga.altTitles.slice(0, 2).join(" • ")}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {manga.authors && manga.authors.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-white/80">
                    <User className="w-3.5 h-3.5 text-fuchsia-400" /> Tác giả:{" "}
                    <strong className="text-white">
                      {manga.authors.slice(0, 2).join(", ")}
                    </strong>
                  </span>
                )}
                {manga.updatedAt && (
                  <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-white/60">
                    <Clock className="w-3.5 h-3.5" />{" "}
                    {new Date(manga.updatedAt).toLocaleDateString("vi-VN")}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-white/60">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />{" "}
                  {manga.chapters.length} chương
                </span>
              </div>

              {manga.genres && manga.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {manga.genres.slice(0, 8).map((g, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-white/70 hover:bg-white/10 transition-colors"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {recentHistory ? (
                  <button
                    onClick={() => {
                      const found =
                        manga.chapters.find(
                          (c) => c.id === recentHistory.chapterId,
                        ) || manga.chapters[0];
                      if (found)
                        onReadChapter(found, recentHistory.pageIndex || 0);
                    }}
                    className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold rounded-2xl shadow-xl shadow-purple-600/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" /> Đọc tiếp (
                    {recentHistory.chapterTitle})
                  </button>
                ) : firstChapter ? (
                  <button
                    onClick={() => onReadChapter(firstChapter, 0)}
                    className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold rounded-2xl shadow-xl shadow-purple-600/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" /> Đọc từ đầu
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-7 py-3.5 bg-white/5 border border-white/10 text-white/30 font-medium rounded-2xl cursor-not-allowed"
                  >
                    Đang cập nhật chương...
                  </button>
                )}
                {recentHistory && firstChapter && (
                  <button
                    onClick={() => onReadChapter(firstChapter, 0)}
                    className="px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white rounded-2xl font-medium transition cursor-pointer"
                  >
                    Đọc lại từ đầu
                  </button>
                )}
                <button
                  onClick={onToggleSave}
                  className={`inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl font-semibold border transition cursor-pointer hover:scale-[1.02] active:scale-95 ${
                    isSaved
                      ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {isSaved ? (
                    <>
                      <Check className="w-4 h-4" /> Đã lưu
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" /> Lưu truyện
                    </>
                  )}
                </button>
                <button
                  onClick={handleShare}
                  className="relative p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition cursor-pointer"
                >
                  <Share2 className="w-5 h-5" />
                  {isCopied && (
                    <span className="absolute -top-9 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-xl whitespace-nowrap">
                      Đã sao chép link!
                    </span>
                  )}
                </button>
                {lastChapter && (
                  <button
                    onClick={() => onReadChapter(lastChapter)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-black/30 border border-white/10 text-white/60 hover:text-white text-xs font-medium cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5 text-orange-400" /> Chương mới
                    nhất
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 space-y-6 sm:space-y-8 -mt-2">
        {/* Stats / highlights - dùng data thực, không hardcode */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center">
            <span className="text-2xl font-black text-white">
              {manga.chapters.length}
            </span>
            <span className="text-xs text-white/40 font-medium uppercase tracking-wider">
              Tổng chương
            </span>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center">
            <span className="text-sm font-bold text-fuchsia-300 flex items-center gap-1.5 line-clamp-1">
              <MangaSourceBadge source={manga.source} size="xs" />
            </span>
            <span className="text-xs text-white/40 font-medium uppercase tracking-wider mt-1">
              Nguồn truyện
            </span>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center">
            <span className="text-sm font-bold text-emerald-300 line-clamp-1">
              {manga.status || "Đang cập nhật"}
            </span>
            <span className="text-xs text-white/40 font-medium uppercase tracking-wider mt-1">
              Trạng thái
            </span>
          </div>
        </div>

        {/* Description + Meta grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {manga.description && (
              <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 sm:p-7 space-y-3">
                <h2 className="text-sm font-black tracking-widest text-white/60 uppercase flex items-center gap-2">
                  <Info className="w-4 h-4 text-fuchsia-400" /> Tóm tắt nội dung
                </h2>
                <p className="text-sm sm:text-[15px] leading-relaxed text-white/70 whitespace-pre-wrap">
                  {manga.description.replace(/<[^>]*>/g, "")}
                </p>
              </div>
            )}
            {/* Chapters */}
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-5 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-fuchsia-500" /> Danh sách
                  chương
                  <span className="text-xs font-bold bg-purple-600 text-white px-2 py-1 rounded-full">
                    {manga.chapters.length}
                  </span>
                </h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    placeholder="Tìm chương (vd: 10, 25...)"
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-500/50"
                  />
                </div>
              </div>

              {filteredChapters.length === 0 ? (
                <div className="text-center py-12 text-white/30 text-sm bg-black/20 rounded-2xl border border-white/5">
                  Không tìm thấy chương phù hợp.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[520px] overflow-y-auto pr-1.5 custom-scrollbar">
                  {filteredChapters.map((ch, idx) => {
                    const isRecent = recentHistory?.chapterId === ch.id;
                    return (
                      <button
                        key={`${ch.id || ch.chapterNumber}-${idx}`}
                        onClick={() => onReadChapter(ch)}
                        className={`group relative text-left px-3.5 py-3 rounded-2xl border text-sm transition-all flex items-center justify-between cursor-pointer hover:scale-[1.02] active:scale-95 ${
                          isRecent
                            ? "bg-fuchsia-600 border-fuchsia-500 text-white shadow-lg shadow-fuchsia-600/20"
                            : "bg-white/[0.04] hover:bg-white/10 border-white/10 text-white/70 hover:text-white"
                        }`}
                      >
                        <span className="line-clamp-1 font-medium flex-1 min-w-0 pr-2">
                          {ch.title}
                        </span>
                        {isRecent ? (
                          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            Đang đọc
                          </span>
                        ) : (
                          <BookOpen className="w-4 h-4 text-white/20 group-hover:text-fuchsia-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredChapters.length > 16 && (
                <p className="text-xs text-white/30 text-center">
                  Cuộn để xem thêm • {filteredChapters.length} chương
                </p>
              )}
            </div>
          </div>

          {/* Right meta card */}
          <div className="space-y-6">
            <div className="bg-white/[0.03] border border-purple-900/30 rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-black tracking-widest text-fuchsia-400 uppercase border-b border-white/5 pb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Thông tin chi tiết
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Nguồn</span>
                  <MangaSourceBadge source={manga.source} size="xs" />
                </div>
                {manga.status && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Trạng thái</span>
                    <span className="text-white font-medium">
                      {manga.status}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/40">Cập nhật</span>
                  <span className="text-white/80 text-xs">
                    {manga.updatedAt
                      ? new Date(manga.updatedAt).toLocaleString("vi-VN")
                      : "Hôm nay"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Số chương</span>
                  <span className="text-white font-bold">{manga.chapters.length} chương</span>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={onToggleSave}
                  className={`w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                    isSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-600/20"
                  }`}
                >
                  <Bookmark
                    className={`w-4 h-4 ${isSaved ? "fill-white" : ""}`}
                  />{" "}
                  {isSaved ? "Đã lưu vào tủ sách" : "Lưu vào tủ sách"}
                </button>
              </div>
            </div>

            {/* Ad / highlight placeholder */}
            <div className="bg-gradient-to-br from-purple-900/30 to-fuchsia-900/20 border border-purple-800/30 rounded-3xl p-6">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" /> Vì sao nên đọc
                trên Gấu Manga?
              </h4>
              <ul className="mt-3 space-y-2 text-xs text-white/60 leading-relaxed">
                <li>• Cập nhật chương mới nhanh nhất, không quảng cáo.</li>
                <li>
                  • Chế độ đọc cuộn dọc & từng trang, lưu tiến độ tự động.
                </li>
                <li>• Đồng bộ tủ sách & lịch sử trên mọi thiết bị.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Related */}
        {relatedMangas.length > 0 && onOpenRelated && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-400" /> Truyện tương tự
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {relatedMangas.slice(0, 6).map((m, idx) => (
                <div
                  key={`${m.id}-${idx}`}
                  onClick={() => onOpenRelated(m)}
                  className="group cursor-pointer"
                >
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-fuchsia-500/30 transition-colors">
                    <img
                      src={m.coverUrl}
                      alt={m.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const t = e.target as HTMLImageElement;
                        t.src =
                          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop";
                      }}
                    />
                  </div>
                  <p className="text-xs font-semibold text-white/80 group-hover:text-fuchsia-300 line-clamp-2 mt-2 leading-snug">
                    {m.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
