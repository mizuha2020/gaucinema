import React, { useEffect, useState, useMemo } from "react";
import {
  MangaItem,
  MangaSource,
  mangaApi,
  getFallbackMangaImageUrl,
} from "../../services/mangaApi";
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Filter,
  TrendingUp,
  Clock,
  Star,
} from "lucide-react";
import { systemApiService } from "../../services/systemApiService";
import { MangaSourceBadge } from "./MangaSourceBadge";

type SearchSource = MangaSource | "all";
interface MangaSearchViewProps {
  initialKeyword?: string;
  initialSource?: SearchSource;
  onOpenDetail: (manga: MangaItem) => void;
  onSearchChange?: (keyword: string) => void;
}

// Curated genre pills for quick filter (client-side)
const GENRE_PILLS = [
  "Hành Động",
  "Tình Cảm",
  "Hài Hước",
  "Phiêu Lưu",
  "Fantasy",
  "Kinh Dị",
  "Xuyên Không",
  "Đời Thường",
];
const SOURCE_OPTIONS: { id: SearchSource; label: string; desc: string }[] = [
  { id: "all", label: "Tất Cả", desc: "Tổng hợp từ nhiều nguồn" },
  {
    id: "truyenqq",
    label: "TruyenQQ",
    desc: "Kho truyện khổng lồ, cập nhật nhanh",
  },
  { id: "otruyen", label: "OTruyen", desc: "Nguồn ổn định, nhiều thể loại" },
  { id: "mangadex", label: "MangaDex", desc: "Quốc tế, đa ngôn ngữ" },
  { id: "cuutruyen", label: "Cứu Truyện", desc: "Giao diện đẹp, truyện hot" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "ongoing", label: "Đang tiến hành" },
  { value: "completed", label: "Đã hoàn thành" },
];

export const MangaSearchView: React.FC<MangaSearchViewProps> = ({
  initialKeyword = "",
  initialSource = "all",
  onOpenDetail,
  onSearchChange,
}) => {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedSource, setSelectedSource] =
    useState<SearchSource>(initialSource);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstLoadRef = React.useRef(true);
  const [enabledSources, setEnabledSources] = useState<MangaSource[]>([
    "truyenqq",
    "mangadex",
    "otruyen",
    "cuutruyen",
  ]);

  useEffect(() => {
    const sync = () => {
      const eps = systemApiService.getActiveEndpointsForCategory("manga");
      const srcs = eps
        .map((e) => e.id)
        .filter((id): id is MangaSource =>
          ["truyenqq", "otruyen", "mangadex", "cuutruyen"].includes(id),
        );
      if (srcs.length) {
        setEnabledSources(srcs);
        if (
          selectedSource !== "all" &&
          !srcs.includes(selectedSource as MangaSource)
        ) {
          setSelectedSource("all");
        }
      }
    };
    sync();
    const unsub = systemApiService.subscribe(sync);
    return () => unsub();
  }, []);

  // Đồng bộ từ parent khi parent đổi (vd: navbar search ABC -> XYZ), tránh đè khi user đang gõ XYZ
  useEffect(() => {
    if (initialKeyword !== keyword) {
      setKeyword(initialKeyword);
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKeyword]);
  useEffect(() => {
    setSelectedSource(initialSource);
  }, [initialSource]);

  // Propagate keyword ra parent để back navigation giữ đúng XYZ thay vì ABC (fix bug báo cáo)
  useEffect(() => {
    if (keyword !== initialKeyword) {
      const t = setTimeout(() => onSearchChange?.(keyword), 350);
      return () => clearTimeout(t);
    }
  }, [keyword]);

  const visibleSources = useMemo(
    () =>
      SOURCE_OPTIONS.filter(
        (s) => s.id === "all" || enabledSources.includes(s.id as MangaSource),
      ),
    [enabledSources],
  );

  useEffect(() => {
    let mounted = true;
    const fetchId = Date.now();
    const isFirstLoad = isFirstLoadRef.current;
    setError(null);
    const showLoadingTimer = setTimeout(() => {
      if (mounted && !isFirstLoad) setIsLoading(true);
    }, 220);
    const timeoutGuard = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 15000);
    const load = async () => {
      try {
        const res =
          selectedSource === "all"
            ? await mangaApi.getMixedMangaList(currentPage, keyword.trim())
            : await mangaApi.getMangaList(
                selectedSource as MangaSource,
                currentPage,
                keyword.trim(),
              );
        if (!mounted) return;
        let items = res.items || [];
        // client-side genre/status filter
        if (selectedGenre) {
          items = items.filter(
            (m) =>
              (m.genres || []).some((g) =>
                g.toLowerCase().includes(selectedGenre.toLowerCase()),
              ) || m.title.toLowerCase().includes(selectedGenre.toLowerCase()),
          );
        }
        if (selectedStatus) {
          items = items.filter((m) =>
            (m.status || "")
              .toLowerCase()
              .includes(selectedStatus.toLowerCase()),
          );
        }
        // if filtered, paginate client side
        if (selectedGenre || selectedStatus) {
          const total = items.length;
          setTotalPages(Math.max(1, Math.ceil(total / 24)));
          setMangas(items.slice(0, 24));
        } else {
          setMangas(items);
          setTotalPages(res.totalPages || 1);
        }
        // Nếu không có kết quả, đảm bảo không treo loading
        if (items.length === 0) setTotalPages(1);
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || "Không thể tải danh sách truyện");
          setMangas([]);
          setTotalPages(1);
        }
      } finally {
        clearTimeout(showLoadingTimer);
        clearTimeout(timeoutGuard);
        if (mounted && !isFirstLoad) setIsLoading(false);
        if (mounted) isFirstLoadRef.current = false;
      }
    };
    load();
    return () => {
      mounted = false;
      clearTimeout(showLoadingTimer);
      clearTimeout(timeoutGuard);
    };
  }, [selectedSource, currentPage, keyword, selectedGenre, selectedStatus]);

  const handleReset = () => {
    setKeyword("");
    setCurrentPage(1);
    setSelectedGenre("");
    setSelectedStatus("");
    onSearchChange?.("");
  };

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    onSearchChange?.(keyword);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-600/20">
              <Search className="w-5 h-5 text-white" />
            </span>
            <span>
              {keyword ? `Kết quả: "${keyword}"` : "Khám Phá Truyện Tranh"}
            </span>
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Tìm kiếm hàng ngàn tựa manga chất lượng cao — cập nhật liên tục từ 4
            nguồn lớn.
          </p>
        </div>
        {(keyword ||
          selectedGenre ||
          selectedStatus ||
          selectedSource !== "all") && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 self-start text-xs bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 px-3.5 py-2 rounded-xl cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Source selector */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <BookOpen className="w-4 h-4 text-fuchsia-400" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
            Chọn nguồn truyện:
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {visibleSources.map((s) => {
            const isSelected = selectedSource === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSource(s.id);
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? "bg-purple-950/60 border-purple-600 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/40"
                    : "bg-white/[0.03] border-white/10 hover:border-white/15"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`text-xs font-bold ${
                      isSelected ? "text-fuchsia-300" : "text-white"
                    }`}
                  >
                    {s.label}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                      isSelected
                        ? "bg-fuchsia-600 text-white border-fuchsia-500"
                        : "bg-white/5 text-white/40 border-white/10"
                    }`}
                  >
                    {s.id === "all" ? "MIX" : "VIP"}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 line-clamp-1">
                  {s.desc}
                </p>
                {isSelected && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-fuchsia-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4 backdrop-blur">
        <form
          onSubmit={handleSubmitSearch}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-white/40 uppercase mb-1.5">
              Từ khóa tìm kiếm
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Nhập tên truyện, tác giả..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword("");
                    onSearchChange?.("");
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase mb-1.5">
              Thể loại
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 cursor-pointer"
            >
              <option value="">Tất cả thể loại</option>
              {GENRE_PILLS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase mb-1.5">
              Trạng thái
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 cursor-pointer"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </form>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-white/30 shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Gợi ý:
          </span>
          {GENRE_PILLS.slice(0, 6).map((g) => (
            <button
              key={g}
              onClick={() => {
                setSelectedGenre(selectedGenre === g ? "" : g);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs shrink-0 transition-colors cursor-pointer ${
                selectedGenre === g
                  ? "bg-fuchsia-600 text-white font-bold shadow"
                  : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Active keyword banner */}
      {keyword && (
        <div className="flex items-center justify-between gap-3 bg-purple-950/30 border border-purple-800/40 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-white/70">
              Kết quả cho:{" "}
              <strong className="text-fuchsia-300">"{keyword}"</strong>
            </span>
          </div>
          <button
            onClick={() => {
              setKeyword("");
              onSearchChange?.("");
              setCurrentPage(1);
            }}
            className="text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 cursor-pointer"
          >
            Xóa ✕
          </button>
        </div>
      )}

      {/* Results grid */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-white/10 border-t-fuchsia-500 rounded-full animate-spin" />
          <p className="text-sm text-white/40">Đang tải danh sách truyện...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center bg-white/[0.02] rounded-3xl border border-white/5 p-8">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button
            onClick={() => setCurrentPage(1)}
            className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold rounded-xl"
          >
            Thử lại
          </button>
        </div>
      ) : mangas.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/40 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Tìm thấy {mangas.length} truyện • Trang {currentPage}/{totalPages}
            </p>
            <span className="text-xs text-white/30 hidden sm:inline">
              Nguồn:{" "}
              {selectedSource === "all"
                ? "Tất cả"
                : selectedSource.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
            {mangas.map((manga, idx) => (
              <div
                key={`${manga.id || manga.slug}-${idx}`}
                onClick={() => onOpenDetail(manga)}
                className="group cursor-pointer flex flex-col"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/5 border border-white/10 group-hover:border-fuchsia-500/40 transition-colors shadow-lg">
                  <img
                    src={manga.coverUrl}
                    alt={manga.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => {
                      const t = e.target as HTMLImageElement;
                      t.src = getFallbackMangaImageUrl(manga.coverUrl, t.src);
                    }}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <div className="bg-fuchsia-600 text-white rounded-full p-3 shadow-xl shadow-fuchsia-600/30 translate-y-2 group-hover:translate-y-0 transition-transform">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
                    {manga.status ? (
                      <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur border border-white/10 rounded text-[8px] font-bold text-white/80 uppercase line-clamp-1 max-w-[55%]">
                        {manga.status}
                      </span>
                    ) : (
                      <span />
                    )}
                    <MangaSourceBadge source={manga.source} size="xs" />
                  </div>
                </div>
                <h3 className="font-bold text-sm text-white line-clamp-2 group-hover:text-fuchsia-300 transition-colors leading-snug mt-2">
                  {manga.title}
                </h3>
                <p className="text-xs text-white/30 truncate mt-0.5">
                  {manga.authors?.[0] || "Tác giả đang cập nhật"}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 pt-8">
            <button
              disabled={currentPage <= 1}
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold text-white border border-white/10 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Trang trước
            </button>
            <span className="text-xs text-white/60 font-medium px-3.5 py-2 bg-white/[0.03] border border-purple-900/30 rounded-xl">
              Trang{" "}
              <span className="text-fuchsia-400 font-bold">{currentPage}</span>{" "}
              / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold text-white border border-white/10 cursor-pointer"
            >
              Trang sau <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="py-16 text-center bg-white/[0.02] rounded-3xl border border-white/5 p-8 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <Search className="w-7 h-7 text-white/20" />
          </div>
          <p className="text-white font-semibold">
            Không tìm thấy truyện phù hợp
          </p>
          <p className="text-xs text-white/30">
            Thử đổi nguồn, xóa bộ lọc hoặc tìm với từ khóa khác.
          </p>
          <button
            onClick={handleReset}
            className="mt-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            Xem tất cả truyện mới
          </button>
        </div>
      )}
    </div>
  );
};
