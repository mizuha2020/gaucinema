import React, { useEffect, useState } from 'react';
import { AnimeSearchResult } from '../../types/anime';
import { animapperService, bestTitle, coverImage, proxiedImage } from '../../services/animapperService';
import { firestoreStorage } from '../../services/firestoreStorage';
import { watchHistoryService } from '../../services/watchHistoryService';
import { Account, UserProfile, UserActivityItem, MyListItem } from '../../types';
import { AnimeCard } from './AnimeCard';
import { AnimeRow } from './AnimeRow';
import { ContinueWatchingCard, MyListCard } from './AnimeCards';
import { Loader2, Play, Sparkles, TrendingUp, Clock, Zap, Info } from 'lucide-react';

type SortKey = 'POPULARITY' | 'UPDATED_AT' | 'START_DATE';

interface AnimeHomeProps {
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
  onSelect: (id: number) => void;
  onResume: (item: UserActivityItem) => void;
  onBrowse: (sort: SortKey) => void;
}

const TOPIC_ROWS: { key: SortKey; title: string; subtitle: string; icon: React.ReactNode }[] = [
  { key: 'POPULARITY', title: 'Thịnh hành', subtitle: 'Top anime được xem nhiều nhất tuần này', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'UPDATED_AT', title: 'Mới cập nhật', subtitle: 'Vừa ra mắt tập mới - xem ngay', icon: <Zap className="w-4 h-4" /> },
  { key: 'START_DATE', title: 'Mùa này', subtitle: 'Anime mới ra mắt season này', icon: <Clock className="w-4 h-4" /> },
];

// Curated popular anime — all verified to have Vietnamese providers (ANIMEVIETSUB/NINIYO)
const CURATED_POPULAR_IDS = [21, 20, 101922, 113415, 16498, 21459, 154587, 151807, 127230, 140960, 110221, 14813, 136, 1, 1535, 30, 110, 269, 379, 10588];

const isUnreleased = (s?: string) => {
  if (!s) return false;
  const v = s.toUpperCase();
  return v === 'NOT_YET_RELEASED' || v === 'NOT_YET_AIRED' || v.includes('NOT_YET');
};

// Cache metadata hasProvider check to avoid hammering Animapper (60 req/min limit)
const hasProviderCache = new Map<number, boolean>();

async function hasPlayableProvider(id: number): Promise<boolean> {
  if (hasProviderCache.has(id)) return hasProviderCache.get(id)!;
  try {
    const meta = await animapperService.getMetadata(id);
    const providers = Object.keys(meta.result.streamingProviders || {});
    // ANIMEVIETSUB đang timeout toàn bộ (đã test 21,101922,113415 đều timeout sau 7s), chỉ NINIYO đang ổn định
    // nên homepage chỉ coi là playable nếu có NINIYO
    const has = providers.includes('NINIYO');
    hasProviderCache.set(id, has);
    return has;
  } catch {
    hasProviderCache.set(id, false);
    return false;
  }
}

async function filterPlayableByProvider(list: AnimeSearchResult[]): Promise<AnimeSearchResult[]> {
  // Filter NOT_YET first (cheap)
  const notUnreleased = list.filter((it) => !isUnreleased(it.status));
  // Then check provider existence with concurrency limit 6 to stay under rate limit
  const chunkSize = 6;
  const playable: AnimeSearchResult[] = [];
  for (let i = 0; i < notUnreleased.length; i += chunkSize) {
    const chunk = notUnreleased.slice(i, i + chunkSize);
    const checks = await Promise.all(chunk.map((it) => hasPlayableProvider(it.id).then((has) => ({ it, has }))));
    for (const { it, has } of checks) if (has) playable.push(it);
    // small pause to respect 60 req/min
    if (i + chunkSize < notUnreleased.length) await new Promise((r) => setTimeout(r, 120));
  }
  return playable;
}

export const AnimeHome: React.FC<AnimeHomeProps> = ({
  currentAccount,
  activeProfile,
  onSelect,
  onResume,
  onBrowse,
}) => {
  const [popular, setPopular] = useState<AnimeSearchResult[]>([]);
  const [updated, setUpdated] = useState<AnimeSearchResult[]>([]);
  const [newest, setNewest] = useState<AnimeSearchResult[]>([]);
  const [continueItems, setContinueItems] = useState<UserActivityItem[]>([]);
  const [myList, setMyList] = useState<MyListItem[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);

  const accountId = currentAccount?.id || currentAccount?.username || '';

  useEffect(() => {
    let cancelled = false;
    setLoadingTopics(true);

    const load = async () => {
      try {
        // 1) Popular — use curated list (guaranteed playable) + supplement with JP search filtered
        const curatedPromise = Promise.all(
          CURATED_POPULAR_IDS.slice(0, 12).map((id) =>
            animapperService
              .getMetadata(id)
              .then((m) => {
                const d = m.result;
                const r: AnimeSearchResult = {
                  id: d.id,
                  mediaType: d.mediaType,
                  titles: d.titles as any,
                  images: d.images,
                  status: d.status,
                  seasonYear: d.seasonYear,
                  format: d.format,
                  season: d.season,
                  startDate: d.startDate,
                };
                return r;
              })
              .catch(() => null)
          )
        );

        // 2) Updated & Newest — fetch with JP filter and over-fetch, then provider-filter
        const [curatedResults, updatedRaw, newestRaw] = await Promise.all([
          curatedPromise,
          animapperService.search({ mediaType: 'ANIME', sortBy: 'UPDATED_AT', sortOrder: 'DESC', limit: 40, countryOfOrigin: 'JP' }),
          animapperService.search({ mediaType: 'ANIME', sortBy: 'START_DATE', sortOrder: 'DESC', limit: 40, countryOfOrigin: 'JP' }),
        ]);

        if (cancelled) return;

        // Curated cũng phải lọc NINIYO (ANIMEVIETSUB đang timeout nên chỉ giữ NINIYO mới xem được)
        const curatedFiltered = (curatedResults.filter(Boolean) as AnimeSearchResult[]).filter((it) => !isUnreleased(it.status));
        const curatedPlayable = await filterPlayableByProvider(curatedFiltered);

        // Filter Updated/Newest by provider existence (ensures "bấm vào có tập")
        const [updatedPlayable, newestPlayable] = await Promise.all([
          filterPlayableByProvider(updatedRaw.results || []),
          filterPlayableByProvider(newestRaw.results || []),
        ]);

        if (cancelled) return;

        // For popular, if curated gives 12, top up with updatedPlayable to reach 20 and deduplicate
        const seen = new Set(curatedPlayable.map((x) => x.id));
        const popularCombined = [...curatedPlayable];
        for (const it of updatedPlayable) {
          if (popularCombined.length >= 20) break;
          if (!seen.has(it.id)) {
            popularCombined.push(it);
            seen.add(it.id);
          }
        }

        setPopular(popularCombined.slice(0, 20));
        setUpdated(updatedPlayable.slice(0, 20));
        setNewest(newestPlayable.slice(0, 20));
      } catch {
        // fallback: try at least curated
        try {
          const fallback = await Promise.all(
            CURATED_POPULAR_IDS.slice(0, 8).map((id) =>
              animapperService.getMetadata(id).then((m) => {
                const d = m.result;
                return {
                  id: d.id,
                  mediaType: d.mediaType,
                  titles: d.titles as any,
                  images: d.images,
                  status: d.status,
                  seasonYear: d.seasonYear,
                  format: d.format,
                } as AnimeSearchResult;
              })
            )
          );
          if (!cancelled) setPopular(fallback as AnimeSearchResult[]);
        } catch {}
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountId) {
      setContinueItems([]);
      return;
    }
    let cancelled = false;
    watchHistoryService
      .getUserHistory(accountId, 100)
      .then((items) => {
        if (cancelled) return;
        const anime = (items || []).filter((i) => i.mediaType === 'anime');
        const seen = new Set<string>();
        const deduped = anime
          .map((i) => ({ ...i, _mediaId: i.contentId.split(':')[1] }))
          .filter((i) => {
            if (!i._mediaId || seen.has(i._mediaId)) return false;
            seen.add(i._mediaId);
            return true;
          })
          .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
        setContinueItems(deduped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !activeProfile) {
      setMyList([]);
      return;
    }
    let cancelled = false;
    firestoreStorage
      .getMyList(currentAccount!.id || currentAccount!.username || '', activeProfile.id)
      .then((list) => {
        if (cancelled) return;
        setMyList(list.filter((i) => i.movieSlug.startsWith('anime:')));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId, activeProfile, currentAccount]);

  const hero = popular[0];
  const heroCover = hero ? proxiedImage(coverImage(hero.images)) : '';
  const heroBanner = hero?.images?.bannerUrl ? proxiedImage(hero.images.bannerUrl) : heroCover;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
      {/* Hero */}
      {hero ? (
        <div className="relative mt-4 sm:mt-6 rounded-[24px] overflow-hidden border border-white/10 bg-zinc-900">
          <div className="absolute inset-0">
            {heroBanner && <img src={heroBanner} alt="" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent hidden sm:block" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
          </div>

          <div className="relative flex flex-col sm:flex-row gap-6 p-5 sm:p-8 md:p-10 min-h-[360px] sm:min-h-[420px] items-end sm:items-center">
            <div className="hidden sm:block shrink-0">
              <div className="w-[200px] md:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-2xl bg-zinc-800">
                {heroCover && <img src={heroCover} alt={bestTitle(hero.titles)} className="w-full h-full object-cover" />}
              </div>
            </div>

            <div className="flex-1 min-w-0 max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-widest px-2.5 py-1 rounded-full bg-amber-400 text-black">
                  <Sparkles className="w-3 h-3" /> #1 THỊNH HÀNH
                </span>
                <span className="hidden sm:inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/15 text-white backdrop-blur border border-white/10">
                  {hero.format || 'TV'} • {hero.seasonYear || '2024'}
                </span>
              </div>

              <h1 className="text-[28px] sm:text-[36px] md:text-[44px] font-black leading-[0.95] tracking-tighter text-white drop-shadow-xl">
                {bestTitle(hero.titles)}
              </h1>
              {hero.titles?.ja && <p className="text-sm text-white/50 mt-1 truncate">{hero.titles.ja}</p>}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white text-black">HD</span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/10 backdrop-blur">
                  {hero.status || 'Đang chiếu'}
                </span>
                <span className="text-xs text-white/60">{[hero.format, hero.seasonYear].filter(Boolean).join(' • ')}</span>
              </div>

              <p className="hidden sm:block text-[13px] leading-relaxed text-white/60 mt-4 line-clamp-2 max-w-xl">
                Khám phá ngay siêu phẩm anime đang làm mưa làm gió. Vietsub sắc nét, 4K không quảng cáo, cập nhật tập mới mỗi ngày.
              </p>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => onSelect(hero.id)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-black text-sm hover:bg-zinc-100 transition-colors shadow-lg"
                >
                  <Play className="w-4 h-4 fill-black" /> Xem ngay
                </button>
                <button
                  onClick={() => onSelect(hero.id)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 text-white font-semibold text-sm backdrop-blur border border-white/15 hover:bg-white/15 transition-colors"
                >
                  <Info className="w-4 h-4" /> Chi tiết
                </button>
              </div>
            </div>

            <div className="sm:hidden absolute top-5 right-5 w-24 aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/20 shadow-xl">
              {heroCover && <img src={heroCover} alt="" className="w-full h-full object-cover" />}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 h-[320px] rounded-[24px] bg-white/5 border border-white/10 animate-pulse" />
      )}

      <div className="mt-8">
        {continueItems.length > 0 && (
          <AnimeRow title="Tiếp tục xem" subtitle={`${continueItems.length} bộ bạn đang dở dang`} onSeeAll={() => onBrowse('POPULARITY')}>
            {continueItems.map((item) => (
              <ContinueWatchingCard key={item.id} item={item} onResume={onResume} />
            ))}
          </AnimeRow>
        )}

        {myList.length > 0 && (
          <AnimeRow title="Bộ sưu tập của bạn" subtitle="Những bộ bạn đã lưu lại để xem sau">
            {myList.map((item) => (
              <MyListCard key={item.movieSlug} item={item} onClick={onSelect} />
            ))}
          </AnimeRow>
        )}

        {loadingTopics ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
              <span className="text-xs text-white/40">Đang tải anime hot...</span>
            </div>
          </div>
        ) : (
          TOPIC_ROWS.map((row) => {
            const data = row.key === 'POPULARITY' ? popular.slice(1) : row.key === 'UPDATED_AT' ? updated : newest;
            if (data.length === 0) return null;
            return (
              <AnimeRow key={row.key} title={row.title} subtitle={row.subtitle} onSeeAll={() => onBrowse(row.key)}>
                {data.map((it) => (
                  <AnimeCard key={`${it.id}-${it.mediaType}`} item={it} onClick={(i) => onSelect(i.id)} />
                ))}
              </AnimeRow>
            );
          })
        )}
      </div>
    </div>
  );
};
