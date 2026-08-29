import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimeCard } from './AnimeCard';
import { AnimeMediaType, AnimeSearchResult } from '../../types/anime';
import { animapperService } from '../../services/animapperService';
import { Loader2, Search, TrendingUp, Clock, Flame, X, Sparkles, Film } from 'lucide-react';
import { Account, UserProfile } from '../../types';

interface AnimeViewProps {
  activeProfile: UserProfile | null;
  currentAccount: Account | null;
  onSelect: (id: number) => void;
  initialSort?: SortMode;
}

type SortMode = 'POPULARITY' | 'UPDATED_AT' | 'START_DATE';

const SORTS: { key: SortMode; label: string; icon: React.ReactNode }[] = [
  { key: 'POPULARITY', label: 'Thịnh hành', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'UPDATED_AT', label: 'Mới cập nhật', icon: <Clock className="w-3.5 h-3.5" /> },
  { key: 'START_DATE', label: 'Mới ra mắt', icon: <Flame className="w-3.5 h-3.5" /> },
];

export const AnimeView: React.FC<AnimeViewProps> = ({
  onSelect,
  initialSort,
}) => {
  const [mediaType, setMediaType] = useState<AnimeMediaType>('ANIME');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>(initialSort || 'POPULARITY');
  const [items, setItems] = useState<AnimeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const debounceRef = useRef<number | null>(null);

  const isUnreleased = (s?: string) => {
    if (!s) return false;
    const v = s.toUpperCase();
    return v === 'NOT_YET_RELEASED' || v === 'NOT_YET_AIRED' || v.includes('NOT_YET');
  };

  const hasProviderCache = React.useRef<Map<number, boolean>>(new Map());
  const hasPlayableProvider = async (id: number): Promise<boolean> => {
    if (hasProviderCache.current.has(id)) return hasProviderCache.current.get(id)!;
    try {
      const meta = await animapperService.getMetadata(id);
      const providers = Object.keys(meta.result.streamingProviders || {});
      const has = providers.includes('NINIYO');
      hasProviderCache.current.set(id, has);
      return has;
    } catch {
      hasProviderCache.current.set(id, false);
      return false;
    }
  };

  const load = useCallback(
    async (reset: boolean, q: string, m: AnimeMediaType, s: SortMode) => {
      setLoading(true);
      const nextOffset = reset ? 0 : offset;
      try {
        const fetchLimit = !q ? 40 : 24;
        const res = await animapperService.search({
          title: q || undefined,
          mediaType: m,
          countryOfOrigin: !q && m === 'ANIME' ? 'JP' : undefined,
          sortBy: q ? undefined : s,
          sortOrder: q ? undefined : 'DESC',
          limit: fetchLimit,
          offset: nextOffset,
        });
        let newItems = res.results || [];
        if (!q) {
          newItems = newItems.filter((it) => !isUnreleased(it.status));
          // For ANIME browsing, ensure "bấm vào có tập" — filter to only those with Vietnamese providers
          if (m === 'ANIME') {
            const chunkSize = 6;
            const filtered: AnimeSearchResult[] = [];
            for (let i = 0; i < newItems.length; i += chunkSize) {
              const chunk = newItems.slice(i, i + chunkSize);
              const checks = await Promise.all(chunk.map((it) => hasPlayableProvider(it.id).then((has) => ({ it, has }))));
              for (const { it, has } of checks) if (has) filtered.push(it);
              if (filtered.length >= 24) break;
            }
            newItems = filtered.slice(0, 24);
          } else {
            newItems = newItems.slice(0, 24);
          }
        }
        setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
        setHasMore(!!res.hasNextPage);
        setTotal(res.total || 0);
        if (reset) setOffset(fetchLimit);
        else setOffset(nextOffset + fetchLimit);
      } catch (e) {
        if (reset) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [offset]
  );

  useEffect(() => {
    setItems([]);
    setOffset(0);
    load(true, query, mediaType, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, sort]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setItems([]);
      setOffset(0);
      load(true, query, mediaType, sort);
    }, 450);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-black tracking-tight text-white">Khám phá</h1>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-amber-400 text-black ml-2">
            <Sparkles className="w-3 h-3" /> ANIME • MANGA
          </span>
        </div>
        <p className="text-[13px] text-white/40 max-w-xl">Tìm kiếm hàng ngàn bộ anime và manga vietsub, cập nhật liên tục mỗi ngày. Không quảng cáo, chất lượng 4K.</p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white flex items-center justify-center">
          <Search className="w-4 h-4 text-black" />
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm kiếm anime, manga, tên tiếng Việt, tiếng Nhật..."
          className="w-full pl-14 pr-12 py-3.5 rounded-2xl bg-white/[0.06] backdrop-blur border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.08] focus:border-white/20 transition-all text-[14px]"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-white/60 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex p-1 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur">
          {(['ANIME', 'MANGA'] as AnimeMediaType[]).map((m) => (
            <button
              key={m}
              onClick={() => setMediaType(m)}
              className={`text-[13px] font-bold px-5 py-2 rounded-full transition-all ${
                mediaType === m
                  ? 'bg-white text-black shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {m === 'ANIME' ? 'Anime' : 'Manga'}
            </button>
          ))}
        </div>

        {!query && (
          <div className="flex gap-1.5 p-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full transition-all ${
                  sort === s.key
                    ? 'bg-amber-400 text-black'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto hidden sm:flex items-center gap-2 text-xs text-white/30">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {total > 0 ? `${total.toLocaleString()} kết quả` : 'Sẵn sàng tìm kiếm'}
        </div>
      </div>

      {/* Results */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-white font-semibold">Không tìm thấy kết quả</p>
          <p className="text-sm text-white/40 mt-1">Thử từ khóa khác hoặc đổi bộ lọc nhé</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
            {items.map((it) => (
              <AnimeCard key={`${it.id}-${it.mediaType}`} item={it} onClick={(i) => onSelect(i.id)} />
            ))}
          </div>

          <div className="flex flex-col items-center mt-10 gap-3">
            {hasMore ? (
              <button
                onClick={() => load(false, query, mediaType, sort)}
                disabled={loading}
                className="px-8 py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-100 disabled:opacity-60 transition-colors shadow-lg inline-flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Đang tải...' : 'Xem thêm'}
              </button>
            ) : (
              <span className="text-xs text-white/30">Đã hiển thị tất cả {total} kết quả • Kéo lên để tìm tiếp</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
