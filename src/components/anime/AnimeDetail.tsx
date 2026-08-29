import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimeDetail,
  AnimeEpisode,
  AnimeStreamSource,
} from '../../types/anime';
import { animapperService, bestTitle, coverImage, proxiedImage } from '../../services/animapperService';
import { firestoreStorage } from '../../services/firestoreStorage';
import { AnimePlayer } from './AnimePlayer';
import { AnimeSimplePlayer } from './AnimeSimplePlayer';
import { Account, UserProfile } from '../../types';
import { ArrowLeft, Calendar, Clapperboard, Film, Play, Star, Tv, Clock, Bookmark, BookmarkCheck, Share2, Info, ChevronDown } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const epCache = new Map<string, AnimeEpisode[]>();
const srcCache = new Map<string, AnimeStreamSource>();

interface AnimeDetailProps {
  mediaId: number;
  onBack: () => void;
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
  initialEpisodeId?: string | null;
}

export const AnimeDetailView: React.FC<AnimeDetailProps> = ({
  mediaId,
  onBack,
  currentAccount,
  activeProfile,
  initialEpisodeId,
}) => {
  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<string>('');
  const [server, setServer] = useState<string>('');

  const [episodes, setEpisodes] = useState<AnimeEpisode[]>([]);
  const [servers, setServers] = useState<string[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [playerSource, setPlayerSource] = useState<AnimeStreamSource | null>(null);
  const [playerTitle, setPlayerTitle] = useState('');
  const [playerEpisodeLabel, setPlayerEpisodeLabel] = useState('');
  const [playerEpisodeId, setPlayerEpisodeId] = useState<string | null>(null);
  const [resolvingEpId, setResolvingEpId] = useState<string | null>(null);
  const resolvingRef = useRef(false);
  const [inMyList, setInMyList] = useState(false);
  const autoPlayedRef = useRef(false);
  const [showFullDesc, setShowFullDesc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    animapperService
      .getMetadata(mediaId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.result) {
          setError('Không tìm thấy thông tin anime.');
          setLoading(false);
          return;
        }
        setDetail(res.result);
        const provs = Object.keys(res.result.streamingProviders || {});
        if (provs.length > 0) {
          // Ưu tiên NINIYO (đang hoạt động ổn định), ANIMEVIETSUB hiện timeout nên để cuối
          if (provs.includes('NINIYO')) setProvider('NINIYO');
          else if (provs.includes('ANIMETVN')) setProvider('ANIMETVN');
          else if (provs.includes('ANIZONE')) setProvider('ANIZONE');
          else setProvider(provs[0]);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Lỗi tải dữ liệu');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  useEffect(() => {
    if (!currentAccount || !activeProfile) {
      setInMyList(false);
      return;
    }
    let cancelled = false;
    firestoreStorage
      .getMyList(currentAccount.id, activeProfile.id)
      .then((list) => {
        if (!cancelled) setInMyList(list.some((i) => i.movieSlug === `anime:${mediaId}`));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentAccount, activeProfile, mediaId]);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setLoadingEps(true);
    // ANIMEVIETSUB đang timeout toàn bộ (test 21,101922,113415 đều timeout sau 7s), để cuối để không block
    const knownProviders = ['NINIYO', 'ANIMETVN', 'ANIZONE', 'ANIME47', 'OANIME', 'ANIMEVIETSUB'];
    // Luôn ưu tiên NINIYO trước, kể cả khi provider state đang là ANIMEVIETSUB
    const order = Array.from(
      new Set([
        'NINIYO',
        ...(provider ? [provider] : []),
        ...Object.keys(detail.streamingProviders || {}).filter((p) => p !== 'ANIMEVIETSUB'),
        ...knownProviders,
        'ANIMEVIETSUB',
      ])
    );
    let tried = 0;
    const tryNext = () => {
      if (cancelled) return;
      if (tried >= order.length) {
        setEpisodes([]);
        setServers([]);
        setLoadingEps(false);
        return;
      }
      const p = order[tried++];
      Promise.all([
        animapperService.getEpisodes(mediaId, p, server || undefined),
        animapperService.getServers(mediaId, p).catch(() => ({ servers: [] as string[] })),
      ])
        .then(([eps, srv]) => {
          if (cancelled) return;
          const list = eps.episodes || [];
          if (list.length === 0) {
            tryNext();
            return;
          }
          setEpisodes(list);
          setServers(srv.servers || []);
          if (!server && srv.servers && srv.servers.length > 0) setServer(srv.servers[0]);
          if (!epCache.has(`${mediaId}:NINIYO`)) {
            animapperService
              .getEpisodes(mediaId, 'NINIYO')
              .then((e) => epCache.set(`${mediaId}:NINIYO`, e.episodes || []))
              .catch(() => {});
          }
          setLoadingEps(false);
        })
        .catch(() => {
          tryNext();
        });
    };
    tryNext();
    return () => {
      cancelled = true;
    };
  }, [detail, provider, server, mediaId]);

  const title = detail ? bestTitle(detail.titles) : '';
  const cover = detail ? proxiedImage(coverImage(detail.images)) : '';
  const banner = detail?.images?.bannerUrl ? proxiedImage(detail.images.bannerUrl) : '';

  const description = useMemo(() => {
    if (!detail?.descriptions) return '';
    return detail.descriptions.vi || detail.descriptions.en || '';
  }, [detail]);

  const resolveSource = async (
    ep: AnimeEpisode
  ): Promise<{ src: AnimeStreamSource; usedProvider: string } | null> => {
    if (!detail) return null;
    const knownProviders = ['NINIYO', 'ANIMETVN', 'ANIZONE', 'ANIME47', 'OANIME', 'ANIMEVIETSUB'];
    const providers = Array.from(
      new Set([
        'NINIYO',
        ...(provider ? [provider] : []),
        ...Object.keys(detail.streamingProviders || {}).filter((p) => p !== 'ANIMEVIETSUB'),
        ...knownProviders,
        'ANIMEVIETSUB',
      ])
    );
    for (const p of providers) {
      try {
        let episodeId = ep.episodeId;
        if (p !== provider) {
          const cacheKey = `${mediaId}:${p}`;
          let list = epCache.get(cacheKey);
          if (!list) {
            const e = await animapperService.getEpisodes(mediaId, p);
            list = e.episodes || [];
            epCache.set(cacheKey, list);
          }
          const targetNum = Number(ep.episodeNumber);
          const match =
            list.find((x) => Number(x.episodeNumber) === targetNum) ||
            list.find((x) => x.episodeNumber === ep.episodeNumber) ||
            list[0];
          if (!match) continue;
          episodeId = match.episodeId;
        }
        const srcKey = `${p}:${episodeId}`;
        let s = srcCache.get(srcKey);
        if (!s) {
          s = await animapperService.getSource(episodeId, p);
          if (s && s.url) srcCache.set(srcKey, s);
        }
        if (s && s.url) return { src: s, usedProvider: p };
      } catch {
        /* try next */
      }
    }
    return null;
  };

  const handlePlay = async (ep: AnimeEpisode) => {
    if (!detail || resolvingRef.current) return;
    resolvingRef.current = true;
    setResolvingEpId(ep.episodeId);
    const res = await resolveSource(ep);
    resolvingRef.current = false;
    setResolvingEpId(null);
    if (!res) {
      alert('Không tìm thấy nguồn phát cho tập này trên bất kỳ provider nào.');
      return;
    }
    setPlayerSource(res.src);
    setPlayerTitle(title);
    setPlayerEpisodeLabel(`Tập ${ep.episodeNumber} • ${res.usedProvider}`);
    setPlayerEpisodeId(ep.episodeId);
  };

  const prefetch = (ep: AnimeEpisode) => {
    if (!detail || resolvingRef.current) return;
    const knownProviders = ['NINIYO', 'ANIMETVN', 'ANIZONE', 'ANIME47', 'OANIME', 'ANIMEVIETSUB'];
    const providers = Array.from(
      new Set([
        'NINIYO',
        ...(provider ? [provider] : []),
        ...Object.keys(detail.streamingProviders || {}).filter((p) => p !== 'ANIMEVIETSUB'),
        ...knownProviders,
        'ANIMEVIETSUB',
      ])
    );
    for (const p of providers) {
      let episodeId = ep.episodeId;
      if (p !== provider) {
        const list = epCache.get(`${mediaId}:${p}`);
        if (!list) return;
        const targetNum = Number(ep.episodeNumber);
        const match =
          list.find((x) => Number(x.episodeNumber) === targetNum) ||
          list.find((x) => x.episodeNumber === ep.episodeNumber) ||
          list[0];
        if (!match) return;
        episodeId = match.episodeId;
      }
      if (!srcCache.has(`${p}:${episodeId}`)) {
        resolveSource(ep).catch(() => {});
        return;
      }
    }
  };

  const playAdjacent = (dir: -1 | 1) => {
    if (!playerSource || episodes.length === 0 || !playerEpisodeId) return;
    const idx = episodes.findIndex((e) => e.episodeId === playerEpisodeId);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= episodes.length) return;
    handlePlay(episodes[nextIdx]);
  };

  useEffect(() => {
    if (autoPlayedRef.current || !initialEpisodeId || episodes.length === 0) return;
    const ep = episodes.find((e) => e.episodeId === initialEpisodeId) || episodes[0];
    if (ep) {
      autoPlayedRef.current = true;
      handlePlay(ep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, initialEpisodeId]);

  const toggleMyList = async () => {
    if (!currentAccount || !activeProfile) return;
    const slug = `anime:${mediaId}`;
    const item = {
      movieSlug: slug,
      movieName: title,
      movieOriginName: detail?.titles?.ja || '',
      movieThumb: cover,
      moviePoster: cover,
      year: detail?.seasonYear,
      quality: detail?.format,
      lang: 'Việt',
      episode_current: detail?.totalUnits ? `${detail.totalUnits} tập` : undefined,
    };
    try {
      const added = await firestoreStorage.toggleMyList(currentAccount.id, activeProfile.id, item);
      setInMyList(added);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10">
        <div className="h-[360px] rounded-[24px] bg-white/5 animate-pulse border border-white/5" />
        <div className="flex gap-6 mt-6">
          <div className="w-44 h-64 rounded-2xl bg-white/5 animate-pulse hidden sm:block" />
          <div className="flex-1 space-y-3">
            <div className="h-8 bg-white/5 rounded-xl w-2/3 animate-pulse" />
            <div className="h-4 bg-white/5 rounded w-1/3 animate-pulse" />
            <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Info className="w-6 h-6 text-white/30" />
        </div>
        <p className="text-white font-semibold mb-4">{error || 'Không có dữ liệu'}</p>
        <button onClick={onBack} className="px-6 py-2.5 rounded-full bg-white text-black font-bold text-sm">
          Quay lại
        </button>
      </div>
    );
  }

  const providers = Object.keys(detail.streamingProviders || {});
  const isManga = detail.mediaType === 'MANGA';
  const isUnreleased = (() => {
    const s = (detail.status || '').toUpperCase();
    return s === 'NOT_YET_RELEASED' || s === 'NOT_YET_AIRED' || s.includes('NOT_YET');
  })();

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-10">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 mt-4 mb-4 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10 text-sm text-white/80 hover:bg-white hover:text-black transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại
      </button>

      {/* Banner + Header */}
      <div className="relative rounded-[24px] overflow-hidden border border-white/10 bg-zinc-900">
        {/* banner */}
        <div className="absolute inset-0 h-[320px] sm:h-[380px]">
          {banner ? (
            <img src={banner} alt="" className="w-full h-full object-cover" />
          ) : cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover opacity-50" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/70 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent hidden sm:block" />
        </div>

        <div className="relative pt-[120px] sm:pt-[160px] p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* poster */}
            <div className="shrink-0 mx-auto sm:mx-0">
              <div className="w-[160px] sm:w-[200px] aspect-[2/3] rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-2xl bg-zinc-800">
                <img src={cover} alt={title} className="w-full h-full object-cover" />
              </div>
            </div>

            {/* meta */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3">
                <span className={`text-[11px] font-black tracking-widest px-2.5 py-1 rounded-full ${isManga ? 'bg-violet-600 text-white' : 'bg-amber-400 text-black'}`}>
                  {isManga ? 'MANGA' : 'ANIME'}
                </span>
                {detail.format && <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/10 backdrop-blur">{detail.format}</span>}
                {detail.status && <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">{detail.status}</span>}
              </div>

              <h1 className="text-[26px] sm:text-[32px] font-black leading-tight tracking-tighter text-white drop-shadow">
                {title}
              </h1>
              {detail.titles?.ja && <p className="text-sm text-white/50 mt-1">{detail.titles.ja}</p>}

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-xs">
                {detail.seasonYear && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10">
                    <Calendar className="w-3.5 h-3.5" /> {detail.seasonYear}
                  </span>
                )}
                {detail.totalUnits && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10">
                    <Clapperboard className="w-3.5 h-3.5" /> {detail.totalUnits} {isManga ? 'chương' : 'tập'}
                  </span>
                )}
                {detail.unitDurationMin && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10">
                    <Clock className="w-3.5 h-3.5" /> {detail.unitDurationMin} phút/tập
                  </span>
                )}
                {detail.genres?.[0] && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400 text-black font-bold text-[11px]">
                    {detail.genres[0].name}
                  </span>
                )}
              </div>

              {detail.genres && detail.genres.length > 0 && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-4">
                  {detail.genres.slice(0, 6).map((g) => (
                    <span key={g.id} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-white/60 border border-white/10">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {description && (
                <div className="mt-4 text-left bg-black/30 backdrop-blur rounded-2xl border border-white/5 p-4">
                  <p className={`text-[13px] leading-relaxed text-white/70 ${!showFullDesc ? 'line-clamp-3' : ''}`}>{description.replace(/<[^>]*>/g, '')}</p>
                  {description.length > 180 && (
                    <button onClick={() => setShowFullDesc(!showFullDesc)} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 mt-2 hover:text-amber-200">
                      {showFullDesc ? 'Thu gọn' : 'Xem thêm'} <ChevronDown className={`w-3 h-3 transition-transform ${showFullDesc ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 mt-5 justify-center sm:justify-start">
                {!isManga && episodes.length > 0 && (
                  <button
                    onClick={() => handlePlay(episodes[0])}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-black text-sm hover:bg-zinc-100 shadow-lg transition-colors"
                  >
                    <Play className="w-4 h-4 fill-black" /> Phát ngay
                  </button>
                )}
                {currentAccount && activeProfile && (
                  <button
                    onClick={toggleMyList}
                    className={`inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm border backdrop-blur transition-all ${
                      inMyList
                        ? 'bg-amber-400 text-black border-amber-400'
                        : 'bg-white/10 text-white border-white/15 hover:bg-white/15'
                    }`}
                  >
                    {inMyList ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    {inMyList ? 'Đã lưu' : 'Lưu lại'}
                  </button>
                )}
                <button className="w-11 h-11 rounded-full bg-white/10 border border-white/10 text-white/70 hover:bg-white hover:text-black flex items-center justify-center transition-colors backdrop-blur">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes */}
      {isManga ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mx-auto mb-3">
            <Film className="w-6 h-6 text-violet-300" />
          </div>
          <p className="text-white font-semibold">Đây là manga</p>
          <p className="text-sm text-white/40 mt-1">Tính năng đọc truyện sẽ sớm ra mắt. Hãy lưu lại để không bỏ lỡ!</p>
        </div>
      ) : isUnreleased ? (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 backdrop-blur p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <Clock className="w-6 h-6 text-amber-300" />
          </div>
          <p className="text-white font-semibold">Phim sắp chiếu</p>
          <p className="text-sm text-white/50 mt-1">Anime này chưa phát hành (NOT_YET_RELEASED) nên chưa có tập nào để xem. Hãy lưu lại và quay lại sau nhé!</p>
          <p className="text-xs text-white/30 mt-2">Trạng thái: {detail.status} {detail.seasonYear ? `• ${detail.seasonYear}` : ''}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] backdrop-blur p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-black text-white flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-amber-400" />
              Danh sách tập
              {episodes.length > 0 && <span className="text-xs font-normal text-white/40">• {episodes.length} tập</span>}
            </h3>
            {episodes.length > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-white text-black font-bold">FULL HD</span>}
          </div>

          {providers.length > 0 && (
            <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setServer('');
                  }}
                  className={`shrink-0 text-xs font-bold px-4 py-2 rounded-full border transition-all ${
                    provider === p
                      ? 'bg-white text-black border-white shadow'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {servers.length > 0 && (
            <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
              {servers.map((s) => (
                <button
                  key={s}
                  onClick={() => setServer(s)}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    server === s
                      ? 'bg-amber-400 text-black border-amber-400'
                      : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Server {s}
                </button>
              ))}
            </div>
          )}

          {loadingEps ? (
            <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-white/5 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : episodes.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-white/60 text-sm font-semibold">Chưa có nguồn phát cho anime này</p>
              <p className="text-xs text-white/30 mt-1 max-w-md mx-auto">
                Đã thử {['NINIYO', 'ANIMETVN', 'ANIZONE'].join(', ')} + {providers.length} nguồn. Lưu ý: <span className="text-amber-300">ANIMEVIETSUB đang bảo trì (timeout)</span> nên chỉ hiện phim có NINIYO mới xem được. Anime này có thể chưa có bản Vietsub trên NINIYO.
              </p>
            </div>
          ) : (
            <div>
              {resolvingEpId && (
                <p className="text-xs text-amber-300 mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm nguồn phát...
                </p>
              )}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
                {episodes.map((ep) => {
                  const isResolving = resolvingEpId === ep.episodeId;
                  const isActive = playerEpisodeId === ep.episodeId;
                  return (
                    <button
                      key={ep.episodeId}
                      onClick={() => handlePlay(ep)}
                      onMouseEnter={() => prefetch(ep)}
                      disabled={resolvingEpId !== null}
                      className={`group relative aspect-[4/3] rounded-xl border flex flex-col items-center justify-center gap-1 transition-all overflow-hidden ${
                        isActive
                          ? 'bg-white text-black border-white shadow-lg scale-[1.02]'
                          : 'bg-white/[0.06] hover:bg-white text-white hover:text-black border-white/10 hover:border-white backdrop-blur hover:scale-[1.02] hover:shadow-lg'
                      } disabled:opacity-50`}
                    >
                      <span className="text-[11px] font-bold tracking-widest opacity-60">TẬP</span>
                      <span className="text-lg font-black leading-none">{ep.episodeNumber}</span>
                      {isResolving ? (
                        <Loader2 className="w-4 h-4 animate-spin absolute inset-0 m-auto" />
                      ) : (
                        <Play className={`w-3 h-3 absolute bottom-2 right-2 transition-opacity ${isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {playerSource && (
        playerSource.type === 'EMBED' ? (
          <AnimePlayer
            source={playerSource}
            title={playerTitle}
            episodeLabel={playerEpisodeLabel}
            onClose={() => setPlayerSource(null)}
            onPrev={() => playAdjacent(-1)}
            onNext={() => playAdjacent(1)}
            hasPrev={
              !!playerEpisodeId &&
              episodes.findIndex((e) => e.episodeId === playerEpisodeId) > 0
            }
            hasNext={
              !!playerEpisodeId &&
              (() => {
                const i = episodes.findIndex((e) => e.episodeId === playerEpisodeId);
                return i >= 0 && i < episodes.length - 1;
              })()
            }
          />
        ) : (
          <AnimeSimplePlayer
            source={playerSource}
            title={playerTitle}
            episodeLabel={playerEpisodeLabel}
            episodes={episodes}
            currentEpisodeId={playerEpisodeId ?? ''}
            mediaId={mediaId}
            coverUrl={cover}
            onSelectEpisode={handlePlay}
            onClose={() => setPlayerSource(null)}
            currentAccount={currentAccount}
            activeProfile={activeProfile}
          />
        )
      )}
    </div>
  );
};
