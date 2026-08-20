import React, { useEffect, useState, useCallback } from 'react';
import {
  Account,
  EpisodeServer,
  Movie,
  MovieEpisode,
  MyListItem,
  NavTab,
  UserProfile,
  WatchHistoryItem,
} from './types';
import { authService } from './services/authService';
import { firestoreStorage } from './services/firestoreStorage';
import { movieApi } from './services/movieApi';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { Top10Carousel } from './components/Top10Carousel';
import { Theater3DCarousel } from './components/Theater3DCarousel';
import { CinematicCarousel } from './components/CinematicCarousel';
import { MovieRow } from './components/MovieRow';
import { MovieDetailModal } from './components/MovieDetailModal';
import { SimplePlayer } from './components/SimplePlayer';
import { ProfileSelector } from './components/ProfileSelector';
import { FilterSection } from './components/FilterSection';
import { MyListView } from './components/MyListView';
import { HistoryView } from './components/HistoryView';
import { LiveTvView } from './components/LiveTvView';
import { MangaView } from './components/manga/MangaView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { App as CapApp } from '@capacitor/app';
import {
  Sparkles,
  Flame,
  Film,
  Tv,
  Smile,
  Heart,
  Sword,
  Clapperboard,
  ShieldCheck,
  CheckCircle2,
  Info,
  Lock,
} from 'lucide-react';

export default function App() {
  // Auth State (Gatekeeper: Require login)
  const [currentAccount, setCurrentAccount] = useState<Account | null>(() =>
    authService.getSessionAccount()
  );
  const [showAdminDashboard, setShowAdminDashboard] = useState<boolean>(false);

  // Profiles State per logged-in account
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [showProfileSelector, setShowProfileSelector] = useState<boolean>(true);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(false);

  // App Navigation Tab
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Movie collections for Home
  const [newUpdated, setNewUpdated] = useState<Movie[]>([]);
  const [topHotAll, setTopHotAll] = useState<Movie[]>([]);
  const [topSeries, setTopSeries] = useState<Movie[]>([]);
  const [topSingle, setTopSingle] = useState<Movie[]>([]);
  const [theaterList, setTheaterList] = useState<Movie[]>([]);
  const [seriesList, setSeriesList] = useState<Movie[]>([]);
  const [singleList, setSingleList] = useState<Movie[]>([]);
  const [animeList, setAnimeList] = useState<Movie[]>([]);
  const [actionList, setActionList] = useState<Movie[]>([]);
  const [romanceList, setRomanceList] = useState<Movie[]>([]);
  const [horrorList, setHorrorList] = useState<Movie[]>([]);
  const [sciFiList, setSciFiList] = useState<Movie[]>([]);
  const [koreanList, setKoreanList] = useState<Movie[]>([]);
  const [isLoadingHome, setIsLoadingHome] = useState<boolean>(true);

  // Active Modals & Player State
  const [selectedMovieForDetail, setSelectedMovieForDetail] = useState<Movie | null>(null);

  // Player State
  const [playingMovie, setPlayingMovie] = useState<Movie | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<MovieEpisode | null>(null);
  const [playingServer, setPlayingServer] = useState<EpisodeServer | null>(null);
  const [allServers, setAllServers] = useState<EpisodeServer[]>([]);
  const [initialResumeTime, setInitialResumeTime] = useState<number>(0);

  // User Profile Data (My List & History scoped to activeProfile)
  const [myList, setMyList] = useState<MyListItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Bootstrap admin on initial start
  useEffect(() => {
    authService.bootstrapAdminAccount().catch((err) => {
      console.warn('Firebase bootstrap admin notice:', err);
    });
  }, []);

  // Load profiles whenever currentAccount changes
  const loadAccountProfiles = useCallback(async (account: Account) => {
    setIsLoadingProfiles(true);
    try {
      const profs = await firestoreStorage.getProfiles(account.id);
      setProfiles(profs);

      const savedActiveId = firestoreStorage.getActiveProfileId(account.id);
      const found = profs.find((p) => p.id === savedActiveId);
      if (found) {
        if (found.pin) {
          // Profile is protected by PIN -> Require PIN verification on profile selector screen
          setActiveProfile(null);
          setShowProfileSelector(true);
        } else {
          setActiveProfile(found);
          setShowProfileSelector(false);
        }
      } else {
        setActiveProfile(null);
        setShowProfileSelector(true);
      }
    } catch (e) {
      console.error('Error loading account profiles', e);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    if (currentAccount) {
      loadAccountProfiles(currentAccount);
    } else {
      setProfiles([]);
      setActiveProfile(null);
      setShowProfileSelector(true);
      setShowAdminDashboard(false);
    }
  }, [currentAccount, loadAccountProfiles]);

  // Load My List and History when active profile changes
  const refreshProfileData = useCallback(async () => {
    if (!currentAccount || !activeProfile) {
      setMyList([]);
      setWatchHistory([]);
      return;
    }
    try {
      const [list, history] = await Promise.all([
        firestoreStorage.getMyList(currentAccount.id, activeProfile.id),
        firestoreStorage.getHistory(currentAccount.id, activeProfile.id),
      ]);
      setMyList(list);
      setWatchHistory(history);
    } catch (e) {
      console.error('Error fetching profile data', e);
    }
  }, [currentAccount, activeProfile]);

  useEffect(() => {
    refreshProfileData();
  }, [refreshProfileData]);

  // Fetch Home collections
  useEffect(() => {
    let isMounted = true;
    setIsLoadingHome(true);

    const loadHomeData = async () => {
      try {
        const [newRes, trendingAllRes, topSeriesRes, topSingleRes, theaterRes] = await Promise.all([
          movieApi.getNewUpdated(1, 36).catch(() => null),
          movieApi.getTrending(12).catch(() => null),
          movieApi.getTrending(10, 'series').catch(() => null),
          movieApi.getTrending(10, 'single').catch(() => null),
          movieApi.getTheaterMovies(1, 10).catch(() => null),
        ]);

        if (isMounted) {
          const trendingItems = trendingAllRes?.items || [];
          if (trendingItems.length) setTopHotAll(trendingItems);

          if (theaterRes?.items?.length) setTheaterList(theaterRes.items);

          if (newRes?.items?.length) {
            // Lọc bỏ các phim đã có trong Top Hot (All, Series, Single) để tránh trùng lặp
            const hotSlugs = new Set([
              ...trendingItems.map((m: any) => m.slug),
              ...(topSeriesRes?.items || []).map((m: any) => m.slug),
              ...(topSingleRes?.items || []).map((m: any) => m.slug)
            ]);
            const filteredNew = newRes.items.filter((m: any) => !hotSlugs.has(m.slug));
            setNewUpdated(filteredNew);
          }

          if (topSeriesRes?.items?.length) setTopSeries(topSeriesRes.items);
          if (topSingleRes?.items?.length) setTopSingle(topSingleRes.items);
          if (newRes?.items?.length || trendingItems.length || topSeriesRes?.items?.length || topSingleRes?.items?.length) {
            setIsLoadingHome(false);
          }
        }

        const [
          seriesRes,
          singleRes,
          animeRes,
          actionRes,
          romanceRes,
          horrorRes,
          sciFiRes,
          koreanRes,
        ] = await Promise.allSettled([
          movieApi.getSeries(1, 24),
          movieApi.getSingleMovies(1, 24),
          movieApi.getAnime(1, 16),
          movieApi.getByGenre('hanh-dong', 1, 16),
          movieApi.getByGenre('tinh-cam', 1, 16),
          movieApi.getByGenre('kinh-di', 1, 16),
          movieApi.getByGenre('vien-tuong', 1, 16),
          movieApi.getByCountry('han-quoc', 1, 16),
        ]);

        if (isMounted) {
          if (!newUpdated.length && newRes?.items?.length) {
            setNewUpdated(newRes.items);
          }
          if (seriesRes.status === 'fulfilled') setSeriesList(seriesRes.value.items?.slice(10) || []);
          if (singleRes.status === 'fulfilled') setSingleList(singleRes.value.items?.slice(10) || []);
          if (animeRes.status === 'fulfilled') setAnimeList(animeRes.value.items || []);
          if (actionRes.status === 'fulfilled') setActionList(actionRes.value.items || []);
          if (romanceRes.status === 'fulfilled') setRomanceList(romanceRes.value.items || []);
          if (horrorRes.status === 'fulfilled') setHorrorList(horrorRes.value.items || []);
          if (sciFiRes.status === 'fulfilled') setSciFiList(sciFiRes.value.items || []);
          if (koreanRes.status === 'fulfilled') setKoreanList(koreanRes.value.items || []);
        }
      } catch (e) {
        console.error('Failed to load initial movie data', e);
      } finally {
        if (isMounted) {
          setIsLoadingHome(false);
        }
      }
    };

    loadHomeData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auth Handlers
  const handleLoginSuccess = (account: Account) => {
    setCurrentAccount(account);
    setShowAdminDashboard(false);
    showToast(`Chào mừng @${account.username} đến với Gấu Cinema!`);
  };

  const handleLogout = () => {
    if (currentAccount) {
      firestoreStorage.clearActiveProfileId(currentAccount.id);
    }
    authService.logout();
    setCurrentAccount(null);
    setActiveProfile(null);
    setShowProfileSelector(true);
    setShowAdminDashboard(false);
    setPlayingMovie(null);
    showToast('Đã đăng xuất khỏi tài khoản.');
  };

  // Profile management handlers
  const handleSelectProfile = (profile: UserProfile) => {
    if (!currentAccount) return;
    setActiveProfile(profile);
    firestoreStorage.setActiveProfileId(currentAccount.id, profile.id);
    setShowProfileSelector(false);
  };

  const handleUpdateProfiles = async (updated: UserProfile[]) => {
    if (!currentAccount) return;
    setProfiles(updated);
    // Persist each updated profile in Firestore
    for (const p of updated) {
      await firestoreStorage.updateProfile(currentAccount.id, p);
    }
    if (activeProfile) {
      const activeUpdated = updated.find((p) => p.id === activeProfile.id);
      if (activeUpdated) setActiveProfile(activeUpdated);
    }
    showToast('Đã cập nhật hồ sơ người xem');
  };

  const handleAddProfile = async (newProf: Omit<UserProfile, 'id' | 'createdAt'>) => {
    if (!currentAccount) return;
    const created = await firestoreStorage.addProfile(currentAccount.id, newProf);
    setProfiles((prev) => [...prev, created]);
    showToast(`Đã tạo thành công hồ sơ "${created.name}"`);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!currentAccount) return;
    await firestoreStorage.deleteProfile(currentAccount.id, profileId);
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    if (activeProfile?.id === profileId) {
      const remaining = profiles.filter((p) => p.id !== profileId);
      setActiveProfile(remaining[0] || null);
    }
    showToast('Đã xóa hồ sơ người xem');
  };

  // Toggle My List
  const handleToggleMyList = async (movie: Movie) => {
    if (!currentAccount || !activeProfile) return;
    const added = await firestoreStorage.toggleMyList(currentAccount.id, activeProfile.id, {
      movieSlug: movie.slug,
      movieName: movie.name,
      movieOriginName: movie.origin_name,
      movieThumb: movie.thumb_url,
      moviePoster: movie.poster_url,
      year: movie.year,
      quality: movie.quality,
      lang: movie.lang,
      episode_current: movie.episode_current,
    });
    await refreshProfileData();
    showToast(
      added
        ? `Đã thêm "${movie.name}" vào Danh sách của ${activeProfile.name}`
        : `Đã xóa "${movie.name}" khỏi Danh sách`
    );
  };

  const isInMyList = (slug: string) => {
    return myList.some((item) => item.movieSlug === slug);
  };

  // Prevent body scroll ONLY when modal dialog or player overlay is open
  useEffect(() => {
    const shouldLock = Boolean(playingMovie || selectedMovieForDetail);
    if (shouldLock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [playingMovie, selectedMovieForDetail]);

  // Unified History/Back Button Manager
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (playingMovie) {
        setPlayingMovie(null);
        setSelectedMovieForDetail(playingMovie);
        refreshProfileData();
      } else if (selectedMovieForDetail) {
        setSelectedMovieForDetail(null);
      } else if (showAdminDashboard) {
        setShowAdminDashboard(false);
      } else if (showProfileSelector && currentAccount && activeProfile) {
        setShowProfileSelector(false);
      } else if (e.state && e.state.tab) {
        setActiveTab(e.state.tab);
      } else if (!e.state) {
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    // Capacitor Back Button for Android (Safe check for native platform)
    let backUnsub: (() => void) | undefined;
    try {
      if (typeof window !== 'undefined' && (window as any)?.Capacitor?.isNativePlatform?.()) {
        CapApp.addListener('backButton', ({ canGoBack }) => {
          if (playingMovie || selectedMovieForDetail || showAdminDashboard || (showProfileSelector && currentAccount && activeProfile)) {
            window.history.back();
          } else if (activeTab !== 'home') {
            window.history.back();
          } else {
            if (canGoBack) {
              window.history.back();
            } else {
              CapApp.exitApp();
            }
          }
        }).then((l) => {
          backUnsub = () => l.remove();
        }).catch(() => {});
      }
    } catch {
      // Ignore on web browser
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backUnsub) backUnsub();
    };
  }, [playingMovie, selectedMovieForDetail, showAdminDashboard, showProfileSelector, currentAccount, activeProfile, refreshProfileData]);

  // Wrapper for state changes
  const handleTabChange = (tab: NavTab) => {
    if (tab === activeTab) return;
    window.history.pushState({ tab }, '', '');
    setActiveTab(tab);
    if (tab !== 'filter') setSearchKeyword('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAdminDashboard = () => {
    window.history.pushState({ overlay: 'admin' }, '', '');
    setShowAdminDashboard(true);
  };

  const closeAdminDashboard = () => {
    if (window.history.state && window.history.state.overlay === 'admin') {
      window.history.back();
    } else {
      setShowAdminDashboard(false);
    }
  };

  const openProfileSelector = () => {
    window.history.pushState({ overlay: 'profiles' }, '', '');
    setShowProfileSelector(true);
  };

  const openDetailModal = (movie: Movie) => {
    if (!selectedMovieForDetail) {
      window.history.pushState({ overlay: 'detail' }, '', '');
    }
    setSelectedMovieForDetail(movie);
  };

  const closeDetailModal = () => {
    if (window.history.state && window.history.state.overlay === 'detail') {
      window.history.back();
    } else {
      setSelectedMovieForDetail(null);
    }
  };

  const openPlayerWithHistory = (
    movie: Movie,
    episode: MovieEpisode,
    server: EpisodeServer,
    servers: EpisodeServer[],
    resumeTime: number
  ) => {
    setPlayingMovie(movie);
    setPlayingEpisode(episode);
    setPlayingServer(server);
    setAllServers(servers);
    setInitialResumeTime(resumeTime);
    setSelectedMovieForDetail(null);
    window.history.pushState({ playerOpen: true }, '', '');
  };

  const closePlayer = () => {
    if (window.history.state && window.history.state.playerOpen) {
      window.history.back();
    } else {
      const currentMovie = playingMovie;
      setPlayingMovie(null);
      setSelectedMovieForDetail(currentMovie);
      refreshProfileData();
    }
  };

  // Start Playing a Movie directly
  const handlePlayMovie = async (movie: Movie) => {
    try {
      showToast(`Đang kết nối phim: ${movie.name}...`);
      let resumeSeconds = 0;
      if (currentAccount && activeProfile) {
        const matchHist = watchHistory.find((h) => h.movieSlug === movie.slug);
        if (matchHist && matchHist.currentTime > 10) {
          resumeSeconds = matchHist.currentTime;
        }
      }

      let movieData = movie;
      let servers: EpisodeServer[] = movie.episodes || [];

      if (!servers || servers.length === 0) {
        const detail = await movieApi.getMovieDetail(movie.slug);
        movieData = detail.movie || movie;
        servers = detail.episodes || [];
      }

      if (servers.length > 0 && servers[0].server_data && servers[0].server_data.length > 0) {
        const defaultServer = servers[0];
        const defaultEpisode = defaultServer.server_data[0];

        openPlayerWithHistory(movieData, defaultEpisode, defaultServer, servers, resumeSeconds);
      } else {
        openDetailModal(movieData || movie);
      }
    } catch (err: any) {
      console.error('Error starting movie playback', err);
      showToast(`Không thể tải phim: ${err?.message || 'Vui lòng thử lại sau'}`);
      openDetailModal(movie);
    }
  };

  // Play a specific episode
  const handlePlayEpisode = (
    movie: Movie,
    episode: MovieEpisode,
    server: EpisodeServer
  ) => {
    let resumeTime = 0;
    if (activeProfile) {
      const match = watchHistory.find(
        (h) => h.movieSlug === movie.slug && h.episodeSlug === episode.slug
      );
      if (match && match.currentTime > 10) {
        resumeTime = match.currentTime;
      }
    }
    openPlayerWithHistory(movie, episode, server, movie.episodes || [server], resumeTime);
  };

  // Resume from History View
  const handleResumeHistoryItem = async (item: WatchHistoryItem) => {
    try {
      const detail = await movieApi.getMovieDetail(item.movieSlug);
      const servers = detail.episodes || [];
      const srv =
        servers.find((s) => s.server_name === item.serverName) || servers[0];
      if (srv) {
        const ep =
          srv.server_data.find((e) => e.slug === item.episodeSlug) ||
          srv.server_data[0];
        if (ep) {
          openPlayerWithHistory(detail.movie, ep, srv, servers, item.currentTime);
        }
      }
    } catch (e) {
      console.error('Error resuming history item', e);
      handlePlaySlug(item.movieSlug);
    }
  };

  const handlePlaySlug = async (slug: string) => {
    try {
      const detail = await movieApi.getMovieDetail(slug);
      handlePlayMovie(detail.movie);
    } catch (e) {
      console.error('Failed to play slug', slug, e);
    }
  };

  const handleOpenDetailSlug = async (slug: string, name: string, thumb: string) => {
    try {
      const detail = await movieApi.getMovieDetail(slug);
      openDetailModal(detail.movie);
    } catch (e) {
      openDetailModal({
        name,
        slug,
        origin_name: '',
        poster_url: thumb,
        thumb_url: thumb,
      });
    }
  };

  // Save Progress Callback from Player to Firestore
  const handleSaveProgress = useCallback(
    async (currentTime: number, duration: number) => {
      if (!currentAccount || !activeProfile || !playingMovie || !playingEpisode || !playingServer) return;
      if (duration <= 0) return;

      const progressPercent = Math.min(100, (currentTime / duration) * 100);
      await firestoreStorage.saveWatchProgress(currentAccount.id, activeProfile.id, {
        id: `${playingMovie.slug}_${playingEpisode.slug}`,
        movieSlug: playingMovie.slug,
        movieName: playingMovie.name,
        movieOriginName: playingMovie.origin_name,
        movieThumb: playingMovie.thumb_url,
        moviePoster: playingMovie.poster_url,
        episodeName: playingEpisode.name,
        episodeSlug: playingEpisode.slug,
        serverName: playingServer.server_name,
        linkM3u8: playingEpisode.link_m3u8,
        currentTime,
        duration,
        progressPercent,
      });
    },
    [currentAccount, activeProfile, playingMovie, playingEpisode, playingServer]
  );

  // Search Submit Handler
  const handleSearchSubmit = (keyword: string) => {
    setSearchKeyword(keyword);
    handleTabChange('filter');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. GATEKEEPER: Not Logged In -> Show LoginScreen Only
  if (!currentAccount) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. ADMIN DASHBOARD SCREEN
  if (showAdminDashboard && currentAccount.role === 'admin') {
    return (
      <AdminDashboard
        currentAccount={currentAccount}
        onBackToCinema={closeAdminDashboard}
        onShowToast={showToast}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#070b16] text-white font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Who's Watching Profile Selector Screen */}
      {showProfileSelector && (
        <ProfileSelector
          currentAccount={currentAccount}
          profiles={profiles}
          onSelectProfile={handleSelectProfile}
          onUpdateProfiles={handleUpdateProfiles}
          onAddProfile={handleAddProfile}
          onDeleteProfile={handleDeleteProfile}
          onLogout={handleLogout}
          onOpenAdminDashboard={
            currentAccount.role === 'admin' ? openAdminDashboard : undefined
          }
        />
      )}

      {/* 2. Fullscreen HLS Video Player (0 Ads) */}
      {playingMovie && playingEpisode && playingServer && (
        <SimplePlayer
          movie={playingMovie}
          currentEpisode={playingEpisode}
          currentServer={playingServer}
          allServers={allServers}
          initialTime={initialResumeTime}
          onBack={closePlayer}
          onSelectEpisode={(ep, srv, resumeTime) => {
            setPlayingEpisode(ep);
            setPlayingServer(srv);
            setInitialResumeTime(resumeTime ?? 0);
          }}
          onSaveProgress={handleSaveProgress}
        />
      )}

      {/* 3. Main Navigation Header */}
      {!playingMovie && !showProfileSelector && (
        <Navbar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          profiles={profiles}
          onSelectProfile={handleSelectProfile}
          onSwitchProfileScreen={openProfileSelector}
          onSelectMovie={(movie) => openDetailModal(movie)}
          onPlayMovie={handlePlayMovie}
          onSearchSubmit={handleSearchSubmit}
          onOpenAdminDashboard={
            currentAccount.role === 'admin' ? openAdminDashboard : undefined
          }
          onLogout={handleLogout}
        />
      )}

      {/* 4. Tab Views Content */}
      {!showProfileSelector && !playingMovie && (
        <main className="relative min-h-[calc(100vh-160px)] pb-24 md:pb-16">
          {/* HOME TAB */}
          {activeTab === 'home' && (
            <>
              {/* Featured Cinematic Hero Banner */}
              <HeroBanner
                movies={newUpdated.slice(0, 5)}
                onPlay={handlePlayMovie}
                onOpenDetail={(m) => openDetailModal(m)}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />

              {/* Continue Watching Row (if user has active history) */}
              {watchHistory.length > 0 && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-sky-400" />
                      <span>Tiếp Tục Xem ({activeProfile?.name})</span>
                    </h2>
                    <button
                      onClick={() => handleTabChange('history')}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Xem tất cả →
                    </button>
                  </div>
                  <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-none">
                    {watchHistory.slice(0, 6).map((item) => (
                      <div
                        key={item.movieSlug}
                        onClick={() => handleResumeHistoryItem(item)}
                        className="group relative w-64 shrink-0 bg-[#0f172a] rounded-2xl overflow-hidden border border-blue-900/50 hover:border-blue-500/80 transition-all cursor-pointer shadow-md hover:scale-105"
                      >
                        <div className="relative aspect-video w-full">
                          <img
                            src={item.movieThumb || item.moviePoster}
                            alt={item.movieName}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-blue-600 text-white p-2.5 rounded-full shadow-xl shadow-blue-600/40">
                              ▶
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${item.progressPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="p-3">
                          <h4 className="font-semibold text-xs text-white truncate">
                            {item.movieName}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {item.episodeName} • {Math.round(item.progressPercent)}% đã xem
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Categorized Rows */}
              <div className="space-y-4">
                <Theater3DCarousel
                  title="Top Phim Hot Nhất Hôm Nay"
                  movies={topHotAll}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                />

                <Top10Carousel
                  title="Top 10 Phim Bộ Hôm Nay"
                  movies={topSeries}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                />

                <MovieRow
                  title="Anime & Hoạt Hình"
                  icon={<Smile className="w-5 h-5 text-emerald-400" />}
                  movies={animeList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Điện Ảnh Hàn Quốc"
                  icon={<Clapperboard className="w-5 h-5 text-blue-400" />}
                  movies={koreanList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Hành Động Đỉnh Cao"
                  icon={<Sword className="w-5 h-5 text-red-400" />}
                  movies={actionList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <Top10Carousel
                  title="Top 10 Phim Lẻ Hôm Nay"
                  movies={topSingle}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                />

                <MovieRow
                  title="Phim Mới Cập Nhật"
                  icon={<Flame className="w-5 h-5 text-amber-400" />}
                  movies={newUpdated}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Phim Bộ Hot"
                  icon={<Tv className="w-5 h-5 text-sky-400" />}
                  movies={seriesList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Phim Lẻ Đặc Sắc"
                  icon={<Film className="w-5 h-5 text-indigo-400" />}
                  movies={singleList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Tình Cảm & Lãng Mạn"
                  icon={<Heart className="w-5 h-5 text-pink-400" />}
                  movies={romanceList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Kinh Dị & Bí Ẩn"
                  icon={<Flame className="w-5 h-5 text-purple-400" />}
                  movies={horrorList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <MovieRow
                  title="Viễn Tưởng & Phiêu Lưu"
                  icon={<Sparkles className="w-5 h-5 text-cyan-400" />}
                  movies={sciFiList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onSelectMovie={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                  onPlayMovie={handlePlayMovie}
                  onToggleMyList={handleToggleMyList}
                  isInMyList={isInMyList}
                />

                <CinematicCarousel
                  title="Mãn Nhãn Phim Chiếu Rạp"
                  movies={theaterList}
                  onOpenDetail={(m) => openDetailModal(m)}
                  onPlay={handlePlayMovie}
                />
              </div>
            </>
          )}

          {/* SERIES TAB */}
          {activeTab === 'series' && (
            <div className="pt-20">
              <FilterSection
                key="tab-series"
                fixedType="series"
                onOpenDetail={(m) => openDetailModal(m)}
                onSelectMovie={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onPlayMovie={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />
            </div>
          )}

          {/* SINGLE MOVIES TAB */}
          {activeTab === 'single' && (
            <div className="pt-20">
              <FilterSection
                key="tab-single"
                fixedType="single"
                onOpenDetail={(m) => openDetailModal(m)}
                onSelectMovie={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onPlayMovie={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />
            </div>
          )}

          {/* ANIME TAB */}
          {activeTab === 'anime' && (
            <div className="pt-20">
              <FilterSection
                key="tab-anime"
                fixedType="anime"
                onOpenDetail={(m) => openDetailModal(m)}
                onSelectMovie={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onPlayMovie={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />
            </div>
          )}

          {/* TV SHOWS TAB */}
          {activeTab === 'tv-shows' && (
            <div className="pt-20">
              <FilterSection
                key="tab-tv-shows"
                fixedType="tv-shows"
                onOpenDetail={(m) => openDetailModal(m)}
                onSelectMovie={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onPlayMovie={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />
            </div>
          )}

          {/* FILTER & EXPLORE TAB */}
          {activeTab === 'filter' && (
            <div className="pt-20">
              <FilterSection
                initialKeyword={searchKeyword}
                onOpenDetail={(m) => openDetailModal(m)}
                onSelectMovie={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onPlayMovie={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />
            </div>
          )}

          {/* MY LIST TAB */}
          {activeTab === 'my-list' && (
            <div className="pt-20">
              <MyListView
                myList={myList}
                profileName={activeProfile?.name || 'Bạn'}
                onSelectMovieSlug={(slug, name, thumb) =>
                  handleOpenDetailSlug(slug, name, thumb)
                }
                onPlayMovieSlug={(slug) => handlePlaySlug(slug)}
                onRemoveItem={async (slug) => {
                  if (!currentAccount || !activeProfile) return;
                  await firestoreStorage.toggleMyList(currentAccount.id, activeProfile.id, {
                    movieSlug: slug,
                    movieName: '',
                    movieThumb: '',
                  });
                  await refreshProfileData();
                  showToast('Đã xóa khỏi danh sách yêu thích');
                }}
                onExploreClick={() => handleTabChange('filter')}
              />
            </div>
          )}

          {/* WATCH HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="pt-20">
              <HistoryView
                history={watchHistory}
                profileName={activeProfile?.name || 'Bạn'}
                onResumeItem={handleResumeHistoryItem}
                onRemoveItem={async (slug) => {
                  if (!currentAccount || !activeProfile) return;
                  await firestoreStorage.removeHistoryItem(currentAccount.id, activeProfile.id, slug);
                  await refreshProfileData();
                  showToast('Đã xóa khỏi lịch sử xem');
                }}
                onClearAll={async () => {
                  if (!currentAccount || !activeProfile) return;
                  for (const item of watchHistory) {
                    await firestoreStorage.removeHistoryItem(currentAccount.id, activeProfile.id, item.movieSlug);
                  }
                  await refreshProfileData();
                  showToast('Đã dọn sạch lịch sử xem của hồ sơ');
                }}
                onExploreClick={() => handleTabChange('home')}
              />
            </div>
          )}

          {/* LIVE TV & SPORTS TAB */}
          {activeTab === 'tv-live' && (
            <LiveTvView currentAccount={currentAccount} />
          )}

          {/* MANGA READER TAB */}
          {activeTab === 'manga' && (
            <MangaView activeProfile={activeProfile} currentAccount={currentAccount} />
          )}
        </main>
      )}

      {/* 5. Movie Detail Modal */}
      {selectedMovieForDetail && (
        <MovieDetailModal
          movie={selectedMovieForDetail}
          onClose={closeDetailModal}
          onPlayMovie={handlePlayMovie}
          onPlayEpisode={handlePlayEpisode}
          onToggleMyList={handleToggleMyList}
          isInMyList={isInMyList}
          onSelectRelatedMovie={(m) => openDetailModal(m)}
        />
      )}

      {/* Toast Notification Box */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 bg-[#0f172a] border border-blue-500/80 text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 6. Comprehensive Footer */}
      {!showProfileSelector && !playingMovie && (
        <footer className="border-t border-slate-800/80 bg-[#070b16] py-8 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-900">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400">
                  Gấu Cinema HD
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-semibold">Rạp Phim Cá Nhân Gia Đình</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full text-[11px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>100% Phi Thương Mại & Không Quảng Cáo</span>
                </div>
                <div className="flex items-center gap-1.5 text-sky-400 bg-sky-950/40 border border-sky-800/40 px-3 py-1 rounded-full text-[11px] font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Bảo Mật Riêng Biệt 5 Hồ Sơ</span>
                </div>
              </div>
            </div>

            {/* Quick Navigation Directory */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 text-slate-400">
              <div className="space-y-1.5">
                <p className="text-slate-200 font-semibold uppercase text-[11px] tracking-wider">Khám Phá</p>
                <p onClick={() => handleTabChange('home')} className="hover:text-sky-300 cursor-pointer transition-colors">Trang Chủ</p>
                <p onClick={() => handleTabChange('series')} className="hover:text-sky-300 cursor-pointer transition-colors">Phim Bộ</p>
                <p onClick={() => handleTabChange('single')} className="hover:text-sky-300 cursor-pointer transition-colors">Phim Lẻ</p>
                <p onClick={() => handleTabChange('anime')} className="hover:text-sky-300 cursor-pointer transition-colors">Anime & Hoạt Hình</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-slate-200 font-semibold uppercase text-[11px] tracking-wider">Hồ Sơ Của Bạn</p>
                <p onClick={() => setShowProfileSelector(true)} className="hover:text-sky-300 cursor-pointer transition-colors">5 Hồ Sơ Người Xem</p>
                <p onClick={() => handleTabChange('my-list')} className="hover:text-sky-300 cursor-pointer transition-colors">Danh Sách Đã Lưu</p>
                <p onClick={() => handleTabChange('history')} className="hover:text-sky-300 cursor-pointer transition-colors">Lịch Sử & Tiến Độ Xem</p>
                <p onClick={() => handleTabChange('filter')} className="hover:text-sky-300 cursor-pointer transition-colors">Tìm Kiếm Nâng Cao</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-slate-200 font-semibold uppercase text-[11px] tracking-wider">Công Nghệ</p>
                <p className="text-slate-400">Stream HLS .m3u8 Full HD</p>
                <p className="text-slate-400">Tự động chuyển tập thông minh</p>
                <p className="text-slate-400">Đồng bộ Firebase Cloud</p>
                <p className="text-slate-400">Tối ưu iPhone / iPad / PC</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-slate-200 font-semibold uppercase text-[11px] tracking-wider">Bản Quyền & Nguồn</p>
                <p className="text-slate-400">Dữ liệu nguồn mở (Public APIs)</p>
                <p className="text-slate-400">Không lưu trữ video trên máy chủ</p>
                <p className="text-slate-400">Không thu phí người dùng</p>
                <p className="text-slate-400">Bảo vệ bản quyền gốc</p>
              </div>
            </div>

            {/* Formal Disclaimer Box */}
            <div className="p-4 rounded-2xl bg-[#0c1427] border border-blue-900/50 space-y-2.5 text-slate-400 text-[11px] leading-relaxed">
              <div className="flex items-center gap-2 text-sky-300 font-bold uppercase tracking-wider text-xs">
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Tuyên Bố Miễn Trừ Trách Nhiệm & Mục Đích Sử Dụng</span>
              </div>
              <p>
                <strong className="text-slate-200">1. Dự án cá nhân phi thương mại:</strong> Website này là một sản phẩm nghiên cứu, học tập công nghệ và phục vụ nhu cầu giải trí cá nhân/gia đình (Non-commercial Personal Project). Trang web hoàn toàn <strong>KHÔNG</strong> kinh doanh, <strong>KHÔNG</strong> buôn bán, <strong>KHÔNG</strong> thu bất kỳ khoản phí nào và <strong>KHÔNG</strong> chèn bất kỳ hình thức quảng cáo thương mại kiếm tiền nào.
              </p>
              <p>
                <strong className="text-slate-200">2. Không lưu trữ tệp tin đa phương tiện:</strong> Hệ thống hoàn toàn không lưu trữ, không tải lên và không tự ý phân phối bất kỳ tệp tin video/phim bản quyền nào trên máy chủ riêng. Toàn bộ hình ảnh, thông tin mô tả và luồng phát được nhúng tự động theo thời gian thực từ các giao diện lập trình mở công khai trên Internet. Mọi bản quyền tác giả, nhãn hiệu và quyền phát hành thuộc về các nhà sản xuất và chủ sở hữu tác quyền hợp pháp tương ứng.
              </p>
            </div>

            {/* Bottom Copyright Note */}
            <div className="pt-2 border-t border-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-2 text-slate-500 text-[11px]">
              <p>© 2026 Gấu Cinema • Dự án cá nhân phi lợi nhuận • Trải nghiệm điện ảnh gia đình chất lượng cao.</p>
              <p className="text-slate-600">Private Personal & Educational Use Only</p>
            </div>
          </div>
        </footer>
      )}

      {/* 7. Mobile Bottom Dock Navigation (iOS & Android) */}
      {!showProfileSelector && !playingMovie && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          activeProfile={activeProfile}
          profiles={profiles}
          onSelectProfile={handleSelectProfile}
          onSwitchProfileScreen={openProfileSelector}
        />
      )}
    </div>
  );
}
