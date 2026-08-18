import React, { useEffect, useState } from 'react';
import { Movie, MovieListPagination, ApiSource } from '../types';
import { COUNTRIES, GENRES, YEARS, movieApi, API_SOURCES } from '../services/movieApi';
import { MovieCard } from './MovieCard';
import { Filter, Search, ChevronLeft, ChevronRight, Sparkles, RefreshCw, Database, Server } from 'lucide-react';

interface FilterSectionProps {
  initialType?: string;
  fixedType?: string;
  initialGenre?: string;
  initialCountry?: string;
  initialKeyword?: string;
  onPlay?: (movie: Movie) => void;
  onPlayMovie?: (movie: Movie) => void;
  onOpenDetail?: (movie: Movie) => void;
  onSelectMovie?: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  initialType = 'all',
  fixedType,
  initialGenre = '',
  initialCountry = '',
  initialKeyword = '',
  onPlay,
  onPlayMovie,
  onOpenDetail,
  onSelectMovie,
  onToggleMyList,
  isInMyList,
}) => {
  const actualInitialType = fixedType || initialType || 'all';
  const [movieType, setMovieType] = useState<string>(actualInitialType);
  const [selectedGenre, setSelectedGenre] = useState<string>(initialGenre);
  const [selectedCountry, setSelectedCountry] = useState<string>(initialCountry);
  const [selectedSource, setSelectedSource] = useState<ApiSource>(movieApi.getActiveSource());
  const [keyword, setKeyword] = useState<string>(initialKeyword);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [pagination, setPagination] = useState<MovieListPagination | undefined>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handlePlay = onPlay || onPlayMovie || (() => {});
  const handleOpenDetail = onOpenDetail || onSelectMovie || (() => {});

  const checkIsInMyList = (slug: string) =>
    typeof isInMyList === 'function' ? isInMyList(slug) : Boolean(isInMyList);

  // Sync props if changed
  useEffect(() => {
    const t = fixedType || initialType;
    if (t) setMovieType(t);
    if (initialGenre) setSelectedGenre(initialGenre);
    if (initialCountry) setSelectedCountry(initialCountry);
    if (initialKeyword !== undefined) setKeyword(initialKeyword);
    setCurrentPage(1);
  }, [fixedType, initialType, initialGenre, initialCountry, initialKeyword]);

  // Fetch filtered movies
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const loadFilteredData = async () => {
      try {
        let res;
        if (keyword.trim()) {
          res = await movieApi.search(keyword.trim(), currentPage, 24, selectedSource);
        } else if (selectedGenre) {
          res = await movieApi.getByGenre(selectedGenre, currentPage, 24, selectedSource);
        } else if (selectedCountry) {
          res = await movieApi.getByCountry(selectedCountry, currentPage, 24, selectedSource);
        } else if (movieType === 'series') {
          res = await movieApi.getSeries(currentPage, 24, selectedSource);
        } else if (movieType === 'single') {
          res = await movieApi.getSingleMovies(currentPage, 24, selectedSource);
        } else if (movieType === 'anime') {
          res = await movieApi.getAnime(currentPage, 24, selectedSource);
        } else if (movieType === 'tv-shows') {
          res = await movieApi.getTvShows(currentPage, 24, selectedSource);
        } else {
          res = await movieApi.getNewUpdated(currentPage, 24, selectedSource);
        }

        if (isMounted) {
          setMovies(res.items || []);
          setPagination(res.pagination);
        }
      } catch (err: any) {
        console.error('Filter fetch error', err);
        if (isMounted) {
          setError('Không thể tải danh sách phim từ nguồn đã chọn. Vui lòng thử đổi nguồn API khác.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadFilteredData();
    return () => {
      isMounted = false;
    };
  }, [movieType, selectedGenre, selectedCountry, keyword, currentPage, selectedSource]);

  const handleResetFilters = () => {
    setMovieType('all');
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedSource('all');
    setKeyword('');
    setCurrentPage(1);
  };

  return (
    <div id="filter-explore-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
            <Filter className="w-6 h-6 text-sky-400" />
            <span>
              {keyword
                ? `Kết Quả Tìm Kiếm: "${keyword}"`
                : movieType === 'series'
                ? 'Kho Phim Bộ'
                : movieType === 'single'
                ? 'Kho Phim Lẻ'
                : movieType === 'anime'
                ? 'Phim Hoạt Hình & Anime'
                : movieType === 'tv-shows'
                ? 'Chương Trình Truyền Hình & TV Shows'
                : 'Khám Phá & Lọc Phim'}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Hơn hàng nghìn bộ phim Full HD phụ đề Vietsub từ KKPhim, OPhim và NguonC, 100% không quảng cáo, cập nhật liên tục.
          </p>
        </div>

        {/* Reset Filter Button */}
        {(selectedGenre || selectedCountry || keyword || movieType !== 'all' || selectedSource !== 'all') && (
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 self-start text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl border border-slate-700 cursor-pointer shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Xóa bộ lọc</span>
          </button>
        )}
      </div>

      {/* API Source Selector Tabs */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2.5">
          <Database className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Chọn Nguồn Phim Vietsub:</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {API_SOURCES.map((source) => {
            const isSelected = selectedSource === source.id;
            return (
              <button
                key={source.id}
                onClick={() => {
                  setSelectedSource(source.id);
                  movieApi.setSource(source.id);
                  setCurrentPage(1);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                  isSelected
                    ? 'bg-blue-950/80 border-blue-500 shadow-lg shadow-blue-950/60 ring-1 ring-blue-500'
                    : 'bg-[#0f172a] border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-xs font-bold ${isSelected ? 'text-sky-300' : 'text-white'}`}>
                    {source.shortName}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                      source.id === 'kkphim'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : source.id === 'ophim'
                        ? 'bg-sky-950 text-sky-300 border border-sky-800'
                        : source.id === 'nguonc'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-blue-900 text-blue-200'
                    }`}
                  >
                    Vietsub
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-1">{source.description}</p>
                {isSelected && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-sky-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-[#0f172a] border border-blue-900/60 rounded-2xl p-4 sm:p-5 mb-8 space-y-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Keyword Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Từ khóa tìm kiếm:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nhập tên phim, diễn viên..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {keyword && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setKeyword('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-white text-sm p-0.5 cursor-pointer"
                  aria-label="Xóa từ khóa"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Type Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Định dạng phim:
            </label>
            <select
              value={movieType}
              onChange={(e) => {
                setMovieType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
            >
              <option value="all">Tất cả định dạng</option>
              <option value="series">Phim Bộ (Nhiều tập)</option>
              <option value="single">Phim Lẻ (Chiếu rạp / 1 tập)</option>
              <option value="anime">Hoạt Hình & Anime</option>
              <option value="tv-shows">TV Shows / Game Shows</option>
            </select>
          </div>

          {/* Genre Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Thể loại:
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
            >
              <option value="">Tất cả thể loại</option>
              {GENRES.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Country Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Quốc gia:
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
            >
              <option value="">Tất cả quốc gia</option>
              {COUNTRIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Genre Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none text-xs">
          <span className="text-slate-400 shrink-0 mr-1 font-medium">Gợi ý:</span>
          {GENRES.slice(0, 8).map((g) => (
            <button
              key={g.slug}
              onClick={() => {
                setSelectedGenre(selectedGenre === g.slug ? '' : g.slug);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs shrink-0 transition-colors cursor-pointer ${
                selectedGenre === g.slug
                  ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Movie Results Grid */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Đang tải danh sách phim...</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center bg-slate-900/50 rounded-2xl p-8 border border-slate-800">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button
            onClick={() => setCurrentPage(1)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30"
          >
            Thử lại
          </button>
        </div>
      ) : movies.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 sm:gap-7 lg:gap-8">
            {movies.map((movie, idx) => (
              <div key={movie.slug || movie._id || idx} className="flex justify-center">
                <MovieCard
                  movie={movie}
                  onPlay={handlePlay}
                  onOpenDetail={handleOpenDetail}
                  onToggleMyList={onToggleMyList}
                  isInMyList={checkIsInMyList(movie.slug)}
                />
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-center gap-3 mt-12">
            <button
              id="pagination-prev-btn"
              disabled={currentPage <= 1}
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trang trước</span>
            </button>

            <span className="text-xs text-slate-300 font-medium px-3.5 py-2 bg-[#0f172a] border border-blue-900/60 rounded-xl shadow">
              Trang <span className="text-cyan-400 font-bold">{currentPage}</span>
              {pagination?.totalPages ? ` / ${pagination.totalPages}` : ''}
            </span>

            <button
              id="pagination-next-btn"
              onClick={() => {
                setCurrentPage((p) => p + 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
            >
              <span>Trang kế tiếp</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="py-20 text-center bg-slate-900/40 rounded-2xl border border-slate-800 p-8">
          <p className="text-slate-300 text-base font-semibold mb-2">
            Không tìm thấy phim phù hợp với tiêu chí lọc
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Hãy thử tìm bằng từ khóa khác hoặc xóa bớt tiêu chí lọc.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            Xem tất cả phim mới
          </button>
        </div>
      )}
    </div>
  );
};
