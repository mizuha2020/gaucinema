import React, { useRef } from 'react';
import { Movie, MovieEpisode, EpisodeServer, Account, UserProfile } from '../../types';
import { AnimeStreamSource, AnimeEpisode } from '../../types/anime';
import { proxiedStreamUrl } from '../../services/animapperService';
import { watchHistoryService } from '../../services/watchHistoryService';
import { SimplePlayer } from '../SimplePlayer';

interface AnimeSimplePlayerProps {
  source: AnimeStreamSource;
  title: string;
  episodeLabel: string;
  episodes: AnimeEpisode[];
  currentEpisodeId: string;
  mediaId: number;
  coverUrl?: string;
  onSelectEpisode: (ep: AnimeEpisode) => void;
  onClose: () => void;
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
}

// Adapter: reuse the battle-tested Gấu Cinema SimplePlayer for anime playback.
// It only understands Movie/MovieEpisode/EpisodeServer shapes, so we translate
// the resolved AniMapper source + episode list into those and route episode
// navigation back through our resolver (which finds the right provider/source).
// History is recorded separately under mediaType 'anime' so it never pollutes
// the Cinema "Continue Watching" list.
export const AnimeSimplePlayer: React.FC<AnimeSimplePlayerProps> = ({
  source,
  title,
  episodeLabel,
  episodes,
  currentEpisodeId,
  mediaId,
  coverUrl,
  onSelectEpisode,
  onClose,
  currentAccount,
  activeProfile,
}) => {
  const referer = source.proxyHeaders?.Referer;
  const origin = source.proxyHeaders?.Origin;
  const m3u8 = proxiedStreamUrl(source.url, referer, origin);

  // Keep the latest metadata in a ref so onSaveProgress always records the
  // currently-playing episode without re-subscribing SimplePlayer's save timer.
  const saveRef = useRef({
    mediaId,
    title,
    episodeLabel,
    currentEpisodeId,
    coverUrl,
    account: currentAccount,
    profile: activeProfile,
  });
  saveRef.current = {
    mediaId,
    title,
    episodeLabel,
    currentEpisodeId,
    coverUrl,
    account: currentAccount,
    profile: activeProfile,
  };

  const movie: Movie = {
    name: title,
    origin_name: title,
    slug: `${mediaId}:${currentEpisodeId}`,
    poster_url: coverUrl || '',
    thumb_url: coverUrl || '',
  };

  const serverData: MovieEpisode[] = episodes.map((e) => ({
    name: `Tập ${e.episodeNumber}`,
    slug: e.episodeId,
    filename: e.episodeId,
    link_embed: '',
    link_m3u8: '',
  }));

  const currentServer: EpisodeServer = {
    server_name: referer ? 'NINIYO' : 'Anime',
    server_data: serverData,
  };

  const currentEpisode: MovieEpisode = {
    name: episodeLabel,
    slug: currentEpisodeId,
    filename: currentEpisodeId,
    link_embed: '',
    link_m3u8: m3u8,
  };

  const handleSelect = (ep: MovieEpisode) => {
    const animeEp = episodes.find((e) => e.episodeId === ep.slug);
    if (animeEp) onSelectEpisode(animeEp);
  };

  const handleSaveProgress = (cur: number, duration: number) => {
    const s = saveRef.current;
    if (!s.account || !s.profile || !duration) return;
    watchHistoryService.recordWatch({
      accountId: s.account.id || s.account.username,
      accountDisplayName: s.account.displayName || s.account.username,
      profileId: s.profile.id,
      profileName: s.profile.name,
      profileAvatar: s.profile.avatar,
      mediaType: 'anime',
      contentId: `anime:${s.mediaId}:${s.currentEpisodeId}`,
      title: s.title,
      subtitle: s.episodeLabel,
      coverUrl: s.coverUrl || '',
      apiSource: 'AniMapper',
      currentTime: cur,
      duration,
      progressPercent: Math.round((cur / duration) * 100),
      watchedDurationSeconds: 0,
    });
  };

  return (
    <SimplePlayer
      movie={movie}
      currentEpisode={currentEpisode}
      currentServer={currentServer}
      allServers={[currentServer]}
      onBack={onClose}
      onSelectEpisode={handleSelect}
      onSaveProgress={handleSaveProgress}
      disableHistory
      currentAccount={currentAccount}
      activeProfile={activeProfile}
    />
  );
};
