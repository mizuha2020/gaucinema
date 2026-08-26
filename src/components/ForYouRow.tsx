import React, { useEffect, useState, useMemo } from 'react';
import { Movie, WatchHistoryItem } from '../types';
import { movieApi } from '../services/movieApi';
import { MovieRow } from './MovieRow';
import { Sparkles, ThumbsUp, Compass, Film, Tag, User } from 'lucide-react';

interface ForYouRowProps {
  watchHistory: WatchHistoryItem[];
  activeProfileName?: string;
  onOpenDetail: (movie: Movie) => void;
  onPlay: (movie: Movie) => void;
  onToggleMyList: (movie: Movie) => void;
  isInMyList: boolean | ((slug: string) => boolean);
}

export const ForYouRow: React.FC<ForYouRowProps> = ({
  watchHistory,
  activeProfileName,
  onOpenDetail,
  onPlay,
  onToggleMyList,
  isInMyList,
}) => {
  const [recommendedMovies, setRecommendedMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [matchedTags, setMatchedTags] = useState<string[]>([]);
  const [basedOnTitles, setBasedOnTitles] = useState<string[]>([]);

  // Unique key representing top watched items
  const historySignature = useMemo(() => {
    return watchHistory
      .slice(0, 5)
      .map((item) => `${item.movieSlug}_${item.updatedAt}`)
      .join('|');
  }, [watchHistory]);

  useEffect(() => {
    let isMounted = true;

    async function fetchRecommendations() {
      setIsLoading(true);

      // Case 1: No watch history -> Fallback to popular trending recommendations
      if (!watchHistory || watchHistory.length === 0) {
        try {
          const trendingRes = await movieApi.getTrending(16);
          if (isMounted) {
            setRecommendedMovies(trendingRes.items || []);
            setMatchedTags(['Hot Trend', 'Phim Nổi Bật']);
            setBasedOnTitles([]);
            setIsLoading(false);
          }
        } catch {
          if (isMounted) setIsLoading(false);
        }
        return;
      }

      // Case 2: User has watch history -> Generate personalized recommendations
      try {
        const recentHistory = watchHistory.slice(0, 5);
        const historySlugs = new Set(watchHistory.map((h) => h.movieSlug));
        const titles: string[] = [];

        // 1. Fetch details for recent watched movies to extract genres and actors
        const detailPromises = recentHistory.map((item) => {
          titles.push(item.movieName);
          return movieApi.getMovieDetail(item.movieSlug).catch(() => null);
        });

        const detailResults = await Promise.all(detailPromises);

        const categoryCounts: Record<string, { count: number; name: string; slug: string }> = {};
        const actorCounts: Record<string, number> = {};

        detailResults.forEach((res) => {
          if (!res || !res.movie) return;
          const movie = res.movie;

          // Process Categories (Genres)
          if (Array.isArray(movie.category)) {
            movie.category.forEach((cat) => {
              if (cat && cat.slug) {
                if (!categoryCounts[cat.slug]) {
                  categoryCounts[cat.slug] = { count: 0, name: cat.name || cat.slug, slug: cat.slug };
                }
                categoryCounts[cat.slug].count += 1;
              }
            });
          }

          // Process Actors
          if (Array.isArray(movie.actor)) {
            movie.actor.forEach((act) => {
              if (!act) return;
              // Clean up actor name if comma separated string accidentally got passed
              const names = typeof act === 'string' ? act.split(',') : [String(act)];
              names.forEach((nameStr) => {
                const cleanName = nameStr.trim();
                if (cleanName && cleanName.length > 2 && cleanName !== 'Đang cập nhật' && cleanName !== 'N/A') {
                  actorCounts[cleanName] = (actorCounts[cleanName] || 0) + 1;
                }
              });
            });
          }
        });

        // Top categories sorted by frequency
        const topCategories = Object.values(categoryCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        // Top actors sorted by frequency
        const topActors = Object.entries(actorCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([actorName]) => actorName)
          .slice(0, 2);

        // Collect search promises
        const fetchPromises: Promise<Movie[]>[] = [];
        const tags: string[] = [];

        // Fetch movies for top genres
        topCategories.forEach((cat) => {
          tags.push(cat.name);
          fetchPromises.push(
            movieApi.getByGenre(cat.slug, 1, 16).then((res) => res.items || []).catch(() => [])
          );
        });

        // Fetch movies for top actors
        topActors.forEach((actorName) => {
          tags.push(`Diễn viên: ${actorName}`);
          fetchPromises.push(
            movieApi.search(actorName, 1, 12).then((res) => res.items || []).catch(() => [])
          );
        });

        // If no categories or actors found, fetch top hot
        if (fetchPromises.length === 0) {
          fetchPromises.push(movieApi.getTrending(16).then((res) => res.items || []));
          tags.push('Phim Nổi Bật');
        }

        const rawResults = await Promise.all(fetchPromises);

        // Combine and filter duplicates + filter out watched movies
        const map = new Map<string, Movie>();
        rawResults.forEach((movieList) => {
          movieList.forEach((movie) => {
            if (
              movie &&
              movie.slug &&
              !historySlugs.has(movie.slug) &&
              !map.has(movie.slug)
            ) {
              map.set(movie.slug, movie);
            }
          });
        });

        let candidates = Array.from(map.values());

        // If candidates are too few, supplement with trending movies
        if (candidates.length < 8) {
          try {
            const trending = await movieApi.getTrending(16);
            (trending.items || []).forEach((m) => {
              if (m && m.slug && !historySlugs.has(m.slug) && !map.has(m.slug)) {
                map.set(m.slug, m);
              }
            });
            candidates = Array.from(map.values());
          } catch {}
        }

        if (isMounted) {
          setRecommendedMovies(candidates.slice(0, 24));
          setMatchedTags(tags.slice(0, 4));
          setBasedOnTitles(titles.slice(0, 3));
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to build "Dành riêng cho bạn" recommendations', err);
        if (isMounted) {
          // Fallback
          const fallbackRes = await movieApi.getNewUpdated(1, 16).catch(() => ({ items: [] }));
          setRecommendedMovies(fallbackRes.items || []);
          setIsLoading(false);
        }
      }
    }

    fetchRecommendations();

    return () => {
      isMounted = false;
    };
  }, [historySignature, watchHistory]);

  if (!isLoading && recommendedMovies.length === 0) {
    return null;
  }

  const titleText = `Dành Riêng Cho ${activeProfileName || 'Bạn'}`;

  // Subtitle explaining recommendation source
  const subtitleText =
    basedOnTitles.length > 0
      ? `Gợi ý theo thể loại & diễn viên bạn từng xem`
      : `Phim đề xuất hấp dẫn phù hợp với sở thích của bạn`;

  return (
    <div className="relative my-2 sm:my-4">
      {/* Dynamic Recommendation Header Tags */}
      {matchedTags.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-1 flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 shrink-0">
            <Tag className="w-3.5 h-3.5 text-blue-400" /> Sở thích nổi bật:
          </span>
          {matchedTags.map((tag, idx) => (
            <span
              key={idx}
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-950/80 text-sky-300 border border-blue-800/60 shrink-0 shadow-sm flex items-center gap-1"
            >
              {tag.startsWith('Diễn viên') ? <User className="w-3 h-3 text-amber-400" /> : <Film className="w-3 h-3 text-sky-400" />}
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Movie Row */}
      <MovieRow
        title={titleText}
        subtitle={subtitleText}
        icon={<Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />}
        movies={recommendedMovies}
        onOpenDetail={onOpenDetail}
        onSelectMovie={onOpenDetail}
        onPlay={onPlay}
        onPlayMovie={onPlay}
        onToggleMyList={onToggleMyList}
        isInMyList={isInMyList}
      />
    </div>
  );
};
