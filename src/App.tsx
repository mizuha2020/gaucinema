import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Account,
  EpisodeServer,
  Movie,
  MovieEpisode,
  MyListItem,
  NavTab,
  UserProfile,
  WatchHistoryItem,
  ActiveApp,
  RoomListItem,
} from './types';
import { authService } from './services/authService';
import { firestoreStorage } from './services/firestoreStorage';
import { movieApi } from './services/movieApi';
import { presenceService } from './services/presenceService';
import { appConfigService } from './services/appConfigService';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { Top10Carousel } from './components/Top10Carousel';
import { Theater3DCarousel } from './components/Theater3DCarousel';
import { CinematicCarousel } from './components/CinematicCarousel';
import { MovieRow } from './components/MovieRow';
import { ForYouRow } from './components/ForYouRow';
import { MovieDetailModal } from './components/MovieDetailModal';
import { SimplePlayer } from './components/SimplePlayer';
import { ProfileSelector } from './components/ProfileSelector';
import { FilterSection } from './components/FilterSection';
import { MyListView } from './components/MyListView';
import { HistoryView } from './components/HistoryView';
import { OfflineSavedView } from './components/OfflineSavedView';
import { MangaAppWrapper } from './apps/MangaAppWrapper';
import { LiveTvAppWrapper } from './apps/LiveTvAppWrapper';
import { AppSwitcherLoading } from './components/AppSwitcherLoading';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NotificationTickerBanner } from './components/NotificationTickerBanner';
import { WatchTogetherRoom } from './components/watch-together/WatchTogetherRoom';
import { JoinRoomModal } from './components/watch-together/JoinRoomModal';
import { CustomDialog, ToastContainer } from './components/CustomDialog';
import { watchTogetherService } from './services/watchTogetherService';
import { offlineMovieService } from './services/offlineMovieService';
import { followMovieService, FollowedMovie } from './services/followMovieService';
import { FollowedRow } from './components/FollowedRow';
import { Capacitor } from '@capacitor/core';
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
  Info,
  Lock,
  AlertTriangle,
  Users,
  Loader2,
} from 'lucide-react';

export default function App() {
  // Gatekeeper state...
  const [currentAccount, setCurrentAccount] = useState<Account | null>(() => authService.getSessionAccount());
  const [showAdminDashboard, setShowAdminDashboard] = useState<boolean>(false);

  // App Switcher State
  const [activeApp, setActiveApp] = useState<ActiveApp>(() => {
    try {
      const savedApp = localStorage.getItem('gau_active_app');
      if (savedApp === 'cinema' || savedApp === 'manga' || savedApp === 'livetv') {
        return savedApp as ActiveApp;
      }
    } catch (e) {
      console.error('Failed to read activeApp from localStorage:', e);
    }
    return 'cinema';
  });
  const [isSwitchingApp, setIsSwitchingApp] = useState<boolean>(false);
  const [targetApp, setTargetApp] = useState<ActiveApp | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('gau_active_app', activeApp);
    } catch (e) {
      console.error('Failed to save activeApp to localStorage:', e);
    }
  }, [activeApp]);

  const handleSwitchApp = (app: ActiveApp) => {
    if (app === activeApp) return;
    setTargetApp(app);
    setActiveApp(app); // Mount target immediately to fetch data in background
    setIsSwitchingApp(true);
    
    if (app === 'cinema') {
      setTimeout(() => {
        window.dispatchEvent(new Event('app-data-loaded'));
      }, 100);
    }
  };

  const handleSwitchAppRef = useRef(handleSwitchApp);
  handleSwitchAppRef.current = handleSwitchApp;

  const handleSwitchAppComplete = () => {
    setTargetApp(null);
    setIsSwitchingApp(false);
  };

  // App Config State (real-time from RTDB)
  const [appConfig, setAppConfig] = useState<Record<string, { enabled: boolean }>>({});

  useEffect(() => {
    const unsub = appConfigService.subscribe((cfg) => {
      setAppConfig(cfg);
    });
    return unsub;
  }, []);

  // Auto-redirect when active app is disabled by admin
  const maintenanceTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceCountdown, setMaintenanceCountdown] = useState<number>(0);

  useEffect(() => {
    if (!appConfig || activeApp === 'cinema' || showAdminDashboard) {
      setMaintenanceMessage(null);
      setMaintenanceCountdown(0);
      if (maintenanceTimerRef.current) {
        clearInterval(maintenanceTimerRef.current);
        maintenanceTimerRef.current = null;
      }
      return;
    }

    const appState = appConfig[activeApp];
    if (appState && !appState.enabled) {
      const label = activeApp === 'manga' ? 'Gấu Manga' : activeApp === 'livetv' ? 'Gấu LiveTV' : activeApp;
      setMaintenanceMessage(`${label} đang được bảo trì. Bạn sẽ được chuyển về Cinema sau 5 phút.`);
      setMaintenanceCountdown(300);

      const startTime = Date.now();
      maintenanceTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = 300 - elapsed;
        if (remaining <= 0) {
          if (maintenanceTimerRef.current) clearInterval(maintenanceTimerRef.current);
          maintenanceTimerRef.current = null;
          setMaintenanceMessage(null);
          setMaintenanceCountdown(0);
          handleSwitchAppRef.current('cinema');
        } else {
          setMaintenanceCountdown(remaining);
        }
      }, 1000);

      return () => {
        if (maintenanceTimerRef.current) {
          clearInterval(maintenanceTimerRef.current);
          maintenanceTimerRef.current = null;
        }
      };
    } else {
      setMaintenanceMessage(null);
      setMaintenanceCountdown(0);
      if (maintenanceTimerRef.current) {
        clearInterval(maintenanceTimerRef.current);
        maintenanceTimerRef.current = null;
      }
    }
  }, [appConfig, activeApp, showAdminDashboard]);


  // Profiles State per logged-in account
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [showProfileSelector, setShowProfileSelector] = useState<boolean>(true);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(false);

  // App Navigation Tab
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    try {
      const savedTab = localStorage.getItem('gau_active_tab');
      const validTabs: NavTab[] = [
        'home', 'series', 'single', 'cinema', 'anime',
        'tv-shows', 'manga', 'filter', 'my-list', 'history', 'offline', 'tv-live', 'xem-chung'
      ];
      // Nếu web mà saved là offline thì fallback về home (web không hỗ trợ)
      const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
      if (!isNative && savedTab === 'offline') return 'home';
      if (savedTab && validTabs.includes(savedTab as NavTab)) {
        return savedTab as NavTab;
      }
    } catch (e) {
      console.error('Failed to read activeTab from localStorage:', e);
    }
    return 'home';
  });

  useEffect(() => {
    try {
      localStorage.setItem('gau_active_tab', activeTab);
    } catch (e) {
      console.error('Failed to save activeTab to localStorage:', e);
    }
  }, [activeTab]);

  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Movie collections for Home
  const [movieCollections, setMovieCollections] = useState<Record<string, Movie[]>>({
    newUpdated: [],
    topHotAll: [],
    topSeries: [],
    topSingle: [],
    theaterList: [],
    seriesList: [],
    singleList: [],
    animeList: [],
    actionList: [],
    romanceList: [],
    horrorList: [],
    sciFiList: [],
    koreanList: [],
  });
  const [isLoadingHome, setIsLoadingHome] = useState<boolean>(true);

  const setMovieCollection = (key: string, value: Movie[]) => {
    setMovieCollections((prev) => ({ ...prev, [key]: value }));
  };

  // Active Modals & Player State
  const [selectedMovieForDetail, setSelectedMovieForDetail] = useState<Movie | null>(null);

  // Player State
  const [playingMovie, setPlayingMovie] = useState<Movie | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<MovieEpisode | null>(null);
  const [playingServer, setPlayingServer] = useState<EpisodeServer | null>(null);
  const [allServers, setAllServers] = useState<EpisodeServer[]>([]);
  const [initialResumeTime, setInitialResumeTime] = useState<number>(0);
  const videoTimeRef = useRef(0);
  const videoDurationRef = useRef(0);

  // Watch Together State
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomData, setActiveRoomData] = useState<any>(null);
  const [activeRoomsForFilm, setActiveRoomsForFilm] = useState<RoomListItem[]>([]);
  const [allActiveRooms, setAllActiveRooms] = useState<RoomListItem[]>([]);
  const [joinRoomTarget, setJoinRoomTarget] = useState<RoomListItem | null>(null);

  // User Profile Data (My List & History scoped to activeProfile)
  const [myList, setMyList] = useState<MyListItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [followedMovies, setFollowedMovies] = useState<FollowedMovie[]>([]);
  const [isCheckingFollow, setIsCheckingFollow] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type?: 'info' | 'success' | 'error' | 'warning' }>>([]);
  const toastIdRef = useRef(0);

  // Show Toast Helper
  const showToast = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message: msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // Dialog State
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    showCancel?: boolean;
  } | null>(null);

  const showDialog = (options: {
    title?: string;
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    showCancel?: boolean;
  }) => {
    setDialog({
      isOpen: true,
      ...options,
    });
  };

  const closeDialog = () => {
    setDialog(null);
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

  // Offline auto-cleanup: khi đổi profile/account thì xóa hết hạn 7 ngày
  useEffect(() => {
    if (!currentAccount || !activeProfile) return;
    try {
      if (!Capacitor.isNativePlatform()) return;
    } catch { return; }
    const expired = offlineMovieService.cleanupExpired(currentAccount.id, activeProfile.id);
    if (expired > 0) {
      showToast(`Đã tự động xóa ${expired} phim hết hạn 7 ngày trong Đã lưu`, 'info');
    }
  }, [currentAccount?.id, activeProfile?.id]);

  // Follow: load + subscribe + check tập mới
  const refreshFollowed = useCallback(() => {
    if (!currentAccount || !activeProfile) { setFollowedMovies([]); return; }
    setFollowedMovies(followMovieService.getAll(currentAccount.id, activeProfile.id));
  }, [currentAccount?.id, activeProfile?.id]);

  useEffect(() => { refreshFollowed(); }, [refreshFollowed]);
  useEffect(() => {
    if (!currentAccount || !activeProfile) return;
    const unsub = followMovieService.subscribe(currentAccount.id, activeProfile.id, setFollowedMovies);
    return unsub;
  }, [currentAccount?.id, activeProfile?.id]);

  // Auto check tập mới khi vào app và mỗi 5 phút (chỉ khi có theo dõi)
  const handleCheckFollowUpdates = useCallback(async () => {
    if (!currentAccount || !activeProfile || isCheckingFollow) return;
    const list = followMovieService.getAll(currentAccount.id, activeProfile.id);
    if (list.length === 0) return;
    // tránh spam: chỉ check nếu lần cuối >5p
    const newestCheck = Math.max(...list.map(m=> m.lastCheckedAt || 0));
    if (Date.now() - newestCheck < 5*60*1000 && list.some(m=> !m.hasNewEpisode)) return;
    setIsCheckingFollow(true);
    try {
      const count = await followMovieService.checkForUpdates(currentAccount.id, activeProfile.id, (newItems)=>{
        if (newItems.length>0) showToast(`Có ${newItems.length} phim vừa ra tập mới!`, 'success');
      });
      if (count>0) refreshFollowed();
    } finally { setIsCheckingFollow(false); }
  }, [currentAccount?.id, activeProfile?.id, isCheckingFollow]);

  useEffect(() => {
    handleCheckFollowUpdates();
    const id = setInterval(handleCheckFollowUpdates, 5*60*1000);
    return ()=> clearInterval(id);
  }, [handleCheckFollowUpdates]);

  // Khi xem xong 1 phim có theo dõi thì đánh dấu đã xem (clear badge)
  const handleFollowSeen = useCallback((slug: string, episodeName?: string) => {
    if (!currentAccount || !activeProfile) return;
    followMovieService.markSeen(currentAccount.id, activeProfile.id, slug, episodeName);
  }, [currentAccount, activeProfile]);

  // Watch Together - Subscribe to active room data
  useEffect(() => {
    if (!activeRoomId) {
      setActiveRoomData(null);
      return;
    }
    const unsub = watchTogetherService.subscribeRoom(activeRoomId, (room) => {
      if (!room || room.status === 'closed') {
        const wasHost = room?.hostId === currentAccount?.id;
        setActiveRoomId(null);
        if (!wasHost) {
          showToast('Chủ phòng đã kết thúc xem chung.', 'info');
          setActiveTab('xem-chung');
        }
        watchTogetherService.leaveRoom(currentAccount?.id || '').catch(() => {});
      } else {
        setActiveRoomData(room);
      }
    });
    return () => unsub();
  }, [activeRoomId, currentAccount?.id]);

  // Watch Together - Subscribe to rooms for current film in detail
  useEffect(() => {
    if (!selectedMovieForDetail) {
      setActiveRoomsForFilm([]);
      return;
    }
    const unsub = watchTogetherService.subscribeActiveRooms(selectedMovieForDetail.slug, setActiveRoomsForFilm);
    return () => unsub();
  }, [selectedMovieForDetail]);

  // Watch Together - Subscribe to ALL active rooms (for tab)
  useEffect(() => {
    const unsub = watchTogetherService.subscribeAllActiveRooms(setAllActiveRooms);
    return () => unsub();
  }, []);

  // Watch Together - Create room handler
  const handleCreateRoom = useCallback(async (
    filmId: string,
    filmName: string,
    filmThumb: string,
    episode: string,
    episodeSlug: string,
    serverName: string,
    linkM3u8: string,
    password: string,
    visibility: any,
  ) => {
    if (!currentAccount || !activeProfile) return;
    try {
      const roomId = await watchTogetherService.createRoom({
        filmId,
        filmName,
        filmThumb,
        episode,
        episodeSlug,
        serverName,
        linkM3u8,
        hostId: currentAccount.id,
        hostName: activeProfile.name || currentAccount.displayName,
        password,
        visibility,
      });
      setSelectedMovieForDetail(null);
      setActiveRoomId(roomId);
      showToast('Đã tạo phòng xem chung thành công!');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }, [currentAccount, activeProfile]);

  // Watch Together - Join room handler
  const handleJoinRoom = useCallback(async (roomId: string, password: string) => {
    if (!currentAccount || !activeProfile) return;
    try {
      await watchTogetherService.joinRoom({
        roomId,
        userId: currentAccount.id,
        userName: activeProfile.name || currentAccount.displayName,
        userAvatar: activeProfile.avatar,
        password,
      });
      setSelectedMovieForDetail(null);
      setActiveRoomId(roomId);
      showToast('Đã tham gia phòng xem chung!', 'success');
    } catch (err: any) {
      const msg = err.message || 'Mật khẩu sai. Vui lòng thử lại.';
      if (msg.includes('Yêu cầu vào lại đã được gửi')) {
        // Auto-request sent, enter room to show waiting screen
        setSelectedMovieForDetail(null);
        setActiveRoomId(roomId);
        showToast('Yêu cầu đã được gửi, vui lòng chờ host duyệt');
      } else {
        showToast(msg, 'error');
      }
    }
  }, [currentAccount, activeProfile]);

  // Watch Together - Leave room handler
  const handleLeaveRoom = useCallback(async () => {
    if (currentAccount) {
      await watchTogetherService.leaveRoom(currentAccount.id).catch(() => {});
    }
    setActiveRoomId(null);
    setActiveRoomData(null);
  }, [currentAccount]);

  // Watch Together - End room handler
  const handleEndRoom = useCallback(async () => {
    if (currentAccount) {
      await watchTogetherService.endRoom(currentAccount.id).catch(() => {});
    }
    setActiveRoomId(null);
    setActiveRoomData(null);
  }, [currentAccount]);

  // Fetch Home collections
  const fetchHomeData = useCallback(async () => {
    setIsLoadingHome(true);
    try {
      const [newRes, trendingAllRes, topSeriesRes, topSingleRes, theaterRes] = await Promise.all([
        movieApi.getNewUpdated(1, 36).catch(() => null),
        movieApi.getTrending(12).catch(() => null),
        movieApi.getTrending(10, 'series').catch(() => null),
        movieApi.getTrending(10, 'single').catch(() => null),
        movieApi.getTheaterMovies(1, 10).catch(() => null),
      ]);

      const trendingItems = trendingAllRes?.items || [];
      if (trendingItems.length) setMovieCollection('topHotAll', trendingItems);

      if (theaterRes?.items?.length) setMovieCollection('theaterList', theaterRes.items);

      if (newRes?.items?.length) {
        // Lọc bỏ các phim đã có trong Top Hot (All, Series, Single) để tránh trùng lặp
        const hotSlugs = new Set([
          ...trendingItems.map((m: any) => m.slug),
          ...(topSeriesRes?.items || []).map((m: any) => m.slug),
          ...(topSingleRes?.items || []).map((m: any) => m.slug)
        ]);
        const filteredNew = newRes.items.filter((m: any) => !hotSlugs.has(m.slug));
        setMovieCollection('newUpdated', filteredNew);
      }

      if (topSeriesRes?.items?.length) setMovieCollection('topSeries', topSeriesRes.items);
      if (topSingleRes?.items?.length) setMovieCollection('topSingle', topSingleRes.items);
      if (newRes?.items?.length || trendingItems.length || topSeriesRes?.items?.length || topSingleRes?.items?.length) {
        setIsLoadingHome(false);
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

      if (seriesRes.status === 'fulfilled') setMovieCollection('seriesList', seriesRes.value.items?.slice(10) || []);
      if (singleRes.status === 'fulfilled') setMovieCollection('singleList', singleRes.value.items?.slice(10) || []);
      if (animeRes.status === 'fulfilled') setMovieCollection('animeList', animeRes.value.items || []);
      if (actionRes.status === 'fulfilled') setMovieCollection('actionList', actionRes.value.items || []);
      if (romanceRes.status === 'fulfilled') setMovieCollection('romanceList', romanceRes.value.items || []);
      if (horrorRes.status === 'fulfilled') setMovieCollection('horrorList', horrorRes.value.items || []);
      if (sciFiRes.status === 'fulfilled') setMovieCollection('sciFiList', sciFiRes.value.items || []);
      if (koreanRes.status === 'fulfilled') setMovieCollection('koreanList', koreanRes.value.items || []);
    } catch (e) {
      console.error('Failed to load initial movie data', e);
    } finally {
      setIsLoadingHome(false);
    }
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

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
    // Persist each updated profile in Firestore (parallel)
    await Promise.all(updated.map((p) => firestoreStorage.updateProfile(currentAccount.id, p)));
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

  // Prevent background scroll ONLY when modal dialog or player overlay is open
  useEffect(() => {
    const shouldLock = Boolean(playingMovie || selectedMovieForDetail);
    if (shouldLock) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [playingMovie, selectedMovieForDetail]);

  // Online presence & browsing activity tracking
  useEffect(() => {
    if (!currentAccount || playingMovie || showProfileSelector) return;

    presenceService.startSession({
      accountId: currentAccount.id || currentAccount.username,
      accountDisplayName: currentAccount.displayName || currentAccount.username,
      profileId: activeProfile?.id || 'default',
      profileName: activeProfile?.name || currentAccount.displayName || 'Người xem',
      profileAvatar: activeProfile?.avatar || '',
      type: 'browsing',
      itemTitle: showAdminDashboard ? 'Đang quản trị' : 'Đang xem danh mục Phim',
      itemSubtitle: showAdminDashboard ? 'Trang quản trị' : `Mục: ${activeTab.toUpperCase()}`,
    });

    return () => {
      presenceService.stopSession();
    };
  }, [currentAccount, activeProfile, activeTab, playingMovie, showProfileSelector, showAdminDashboard]);

  // Unified History/Back Button Manager
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (playingMovie) {
        const movieToDetail = playingMovie;
        const episodeToSave = playingEpisode;
        const serverToSave = playingServer;
        setPlayingMovie(null);
        setSelectedMovieForDetail(movieToDetail);
        // Save one final progress snapshot before closing
        if (currentAccount && activeProfile && episodeToSave && serverToSave && videoTimeRef.current > 0) {
          firestoreStorage.saveWatchProgress(currentAccount.id, activeProfile.id, {
            id: `${movieToDetail.slug}_${episodeToSave.slug}`,
            movieSlug: movieToDetail.slug,
            movieName: movieToDetail.name,
            movieOriginName: movieToDetail.origin_name,
            movieThumb: movieToDetail.thumb_url,
            moviePoster: movieToDetail.poster_url,
            episodeName: episodeToSave.name,
            episodeSlug: episodeToSave.slug,
            serverName: serverToSave.server_name,
            linkM3u8: episodeToSave.link_m3u8,
            currentTime: videoTimeRef.current,
            duration: videoDurationRef.current || 0,
            progressPercent: videoDurationRef.current > 0 ? Math.round((videoTimeRef.current / videoDurationRef.current) * 100) : 0,
          }).then(() => refreshProfileData());
        } else {
          refreshProfileData();
        }
      } else if (selectedMovieForDetail) {
        setSelectedMovieForDetail(null);
      } else if (showAdminDashboard) {
        if (e.state && (e.state.overlay === 'admin' || e.state.overlay === 'admin_user_detail')) {
          // Keep admin dashboard open when navigating internal admin subviews
          return;
        }
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
        CapApp.addListener('backButton', () => {
          if (playingMovie || selectedMovieForDetail || showAdminDashboard || (showProfileSelector && currentAccount && activeProfile)) {
            window.history.back();
          } else if (activeTab !== 'home') {
            setActiveTab('home');
            window.history.pushState({ tab: 'home' }, '', '');
          } else if (window.history.state) {
            window.history.back();
          } else {
            CapApp.exitApp();
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
    // Chặn tab offline trên Web
    try {
      if (tab === 'offline' && !Capacitor.isNativePlatform()) {
        showToast('Tính năng Đã lưu Offline chỉ có trên App APK', 'warning');
        return;
      }
    } catch {}
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
    videoTimeRef.current = resumeTime;
    videoDurationRef.current = 0;
    setPlayingMovie(movie);
    setPlayingEpisode(episode);
    setPlayingServer(server);
    setAllServers(servers);
    setInitialResumeTime(resumeTime);
    setSelectedMovieForDetail(null);
    window.history.pushState({ playerOpen: true }, '', '');

    // Ghi nhận ngay khi bắt đầu xem để mục "Xem tiếp" / "Lịch sử" xuất hiện lập tức.
    if (currentAccount && activeProfile) {
      firestoreStorage
        .saveWatchProgress(currentAccount.id, activeProfile.id, {
          id: `${movie.slug}_${episode.slug}`,
          movieSlug: movie.slug,
          movieName: movie.name,
          movieOriginName: movie.origin_name,
          movieThumb: movie.thumb_url,
          moviePoster: movie.poster_url,
          episodeName: episode.name,
          episodeSlug: episode.slug,
          serverName: server.server_name,
          linkM3u8: episode.link_m3u8,
          currentTime: resumeTime,
          duration: 0,
          progressPercent: 0,
        })
        .then(() => refreshProfileData());
    }
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

  // Select episode inside the player (memoized so re-renders don't retrigger the player's load effect)
  const handleSelectEpisode = useCallback((ep: MovieEpisode, srv: EpisodeServer, resumeTime?: number) => {
    setPlayingEpisode(ep);
    setPlayingServer(srv);
    setInitialResumeTime(resumeTime ?? 0);
  }, []);

  // Lightweight live-time forwarder so the exit save uses the real final time
  const handlePlayerTimeUpdate = useCallback((t: number, d: number) => {
    videoTimeRef.current = t;
    if (d > 0) videoDurationRef.current = d;
  }, []);

  // Save Progress Callback from Player to Firestore
  const handleSaveProgress = useCallback(
    async (currentTime: number, duration: number) => {
      videoTimeRef.current = currentTime;
      videoDurationRef.current = duration;
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
      // Refresh the "Continue Watching" / History lists live so they appear
      // while the user is still watching, not only after closing the player.
      const history = await firestoreStorage.getHistory(currentAccount.id, activeProfile.id);
      setWatchHistory(history);
    },
    [currentAccount, activeProfile, playingMovie, playingEpisode, playingServer]
  );

  // Search Submit Handler
  const handleSearchSubmit = (keyword: string) => {
    setSearchKeyword(keyword);
    if (activeTab !== 'filter') {
      window.history.pushState({ tab: 'filter' }, '', '');
      setActiveTab('filter');
    }
    if (selectedMovieForDetail) {
      setSelectedMovieForDetail(null);
    }
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

  let appContent = null;

  const {
    newUpdated, topHotAll, topSeries, topSingle, theaterList,
    seriesList, singleList, animeList, actionList, romanceList,
    horrorList, sciFiList, koreanList,
  } = movieCollections;

  if (activeApp === 'manga') {
    appContent = (
      <MangaAppWrapper
        currentAccount={currentAccount}
        activeProfile={activeProfile}
        profiles={profiles}
        onSelectProfile={handleSelectProfile}
        onSwitchApp={handleSwitchApp}
        onSwitchProfileScreen={() => setShowProfileSelector(true)}
      />
    );
  } else if (activeApp === 'livetv') {
    appContent = (
      <LiveTvAppWrapper
        currentAccount={currentAccount}
        activeProfile={activeProfile}
        profiles={profiles}
        onSelectProfile={handleSelectProfile}
        onSwitchApp={handleSwitchApp}
        onSwitchProfileScreen={() => setShowProfileSelector(true)}
      />
    );
  } else {
    appContent = (
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
          onShowToast={showToast}
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
          onSelectEpisode={handleSelectEpisode}
          onSaveProgress={handleSaveProgress}
          onTimeUpdate={handlePlayerTimeUpdate}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
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
          onSwitchApp={handleSwitchApp}
          onRefreshHome={fetchHomeData}
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

              {/* Followed - Báo tập mới */}
              {followedMovies.length > 0 && (
                <FollowedRow
                  items={followedMovies}
                  onOpenDetail={(m)=> openDetailModal(m)}
                  onPlay={(m)=> { handlePlayMovie(m); handleFollowSeen(m.slug); }}
                  onClearNew={(slug)=> handleFollowSeen(slug)}
                  onUnfollow={(slug)=> {
                    followMovieService.unfollow(currentAccount!.id, activeProfile!.id, slug);
                    showToast('Đã bỏ theo dõi', 'info');
                  }}
                />
              )}

              {/* Continue Watching Row - Chính xác hơn */}
              {(() => {
                const filtered = [...watchHistory]
                  .filter(h=> {
                    // ẩn phim đã xem xong >92% hoặc mới bấm nhầm <2%
                    if (h.progressPercent >= 92) return false;
                    if (h.progressPercent < 2 && h.currentTime < 15) return false;
                    return true;
                  })
                  .sort((a,b)=> b.updatedAt - a.updatedAt)
                  .slice(0, 6);
                if (filtered.length === 0) return null;
                const fmt = (s:number)=> {
                  if (!s || s<0) return '00:00';
                  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
                  const sec=Math.floor(s%60);
                  if (h>0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
                  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
                };
                return (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-sky-400" />
                      <span>Tiếp Tục Xem ({activeProfile?.name})</span>
                      <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">{filtered.length}</span>
                    </h2>
                    <div className="flex items-center gap-2">
                      {isCheckingFollow && <span className="text-[11px] text-violet-300 animate-pulse">Đang kiểm tra tập mới...</span>}
                      <button onClick={()=> { handleCheckFollowUpdates(); showToast('Đang kiểm tra tập mới...','info'); }} className="text-[11px] text-violet-300 hover:text-violet-200 border border-violet-800/60 bg-violet-950/40 px-2 py-1 rounded-full cursor-pointer">Kiểm tra tập mới</button>
                      <button onClick={() => handleTabChange('history')} className="text-xs text-slate-400 hover:text-white cursor-pointer">Xem tất cả →</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-none">
                    {filtered.map((item, idx) => {
                      const remaining = Math.max(0, (item.duration||0) - (item.currentTime||0));
                      const pct = Math.round(item.progressPercent||0);
                      return (
                      <div key={`${item.movieSlug}-${idx}`} onClick={() => { handleResumeHistoryItem(item); handleFollowSeen(item.movieSlug, item.episodeName); }} className="group relative w-64 shrink-0 bg-[#0f172a] rounded-2xl overflow-hidden border border-blue-900/50 hover:border-blue-500/80 transition-all cursor-pointer shadow-md hover:scale-105">
                        <div className="relative aspect-video w-full">
                          <img src={item.movieThumb || item.moviePoster} alt={item.movieName} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="bg-blue-600 text-white p-2.5 rounded-full shadow-xl shadow-blue-600/40">▶</span></div>
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/20">{item.episodeName.startsWith('Tập')? item.episodeName : `Tập ${item.episodeName}`} • {pct}%</div>
                          {remaining>0 && <div className="absolute top-2 right-2 bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Còn {fmt(remaining)}</div>}
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800"><div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        </div>
                        <div className="p-3">
                          <h4 className="font-semibold text-xs text-white truncate">{item.movieName}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">{item.serverName} • {fmt(item.currentTime)} / {fmt(item.duration)} <span className="text-sky-400 font-semibold">{pct}%</span></p>
                          <p className="text-[10px] text-slate-500">{new Date(item.updatedAt).toLocaleString('vi-VN')}</p>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
                );
              })()}

              {/* "Dành Riêng Cho Bạn" Personalized Recommendation Row */}
              <ForYouRow
                watchHistory={watchHistory}
                activeProfileName={activeProfile?.name}
                onOpenDetail={(m) => openDetailModal(m)}
                onPlay={handlePlayMovie}
                onToggleMyList={handleToggleMyList}
                isInMyList={isInMyList}
              />

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

          {/* WATCH TOGETHER TAB */}
          {activeTab === 'xem-chung' && (
            <div className="pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-6 h-6 text-emerald-400" />
                <h1 className="text-2xl font-bold text-white">Phòng đang xem chung</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 text-xs font-bold">
                  {allActiveRooms.length}
                </span>
              </div>

              {allActiveRooms.length === 0 ? (
                <div className="text-center py-20">
                  <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">Chưa có phòng xem chung nào đang hoạt động.</p>
                  <p className="text-slate-500 text-xs mt-1">Hãy tạo phòng từ trang chi tiết phim!</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {allActiveRooms.map((room) => (
                    <div
                      key={room.roomId}
                      className="p-4 rounded-2xl bg-[#0f172a] border border-slate-700/40 hover:border-emerald-500/30 transition-all cursor-pointer group"
                      onClick={() => {
                        if (activeRoomId) {
                          showToast('Bạn đang ở trong một phòng khác. Vui lòng rời phòng trước.', 'warning');
                          return;
                        }
                        if (room.visibility === 'public') {
                          handleJoinRoom(room.roomId, '');
                        } else {
                          setJoinRoomTarget(room);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {room.filmName}
                          </h3>
                          <p className="text-xs text-sky-400 mt-0.5">{room.episode}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400 shrink-0 ml-2">
                          {room.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {room.viewersCount} đang xem
                        </span>
                        <span>Host: {room.hostName}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {new Date(room.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          disabled={!!activeRoomId}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            activeRoomId
                              ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          Vào phòng
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  await Promise.all(watchHistory.map((item) => firestoreStorage.removeHistoryItem(currentAccount.id, activeProfile.id, item.movieSlug)));
                  await refreshProfileData();
                  showToast('Đã dọn sạch lịch sử xem của hồ sơ');
                }}
                onExploreClick={() => handleTabChange('home')}
              />
            </div>
          )}

          {/* OFFLINE SAVED TAB - ONLY ON NATIVE APP */}
          {activeTab === 'offline' && (
            <div className="pt-2">
              <OfflineSavedView
                currentAccount={currentAccount}
                activeProfile={activeProfile}
                onPlayMovie={handlePlayMovie}
                onOpenDetail={(m) => openDetailModal(m)}
                onShowToast={showToast}
              />
            </div>
          )}

          {/* LIVE TV & SPORTS TAB (Now handled by Sub-App, but keep fallback) */}
          {activeTab === 'tv-live' && (
            <div className="pt-20 text-center text-slate-400">
              Vui lòng sử dụng tính năng App Switcher để chuyển sang Gấu LiveTV
            </div>
          )}

          {/* MANGA READER TAB (Now handled by Sub-App, but keep fallback) */}
          {activeTab === 'manga' && (
            <div className="pt-20 text-center text-slate-400">
              Vui lòng sử dụng tính năng App Switcher để chuyển sang Gấu Manga
            </div>
          )}
        </main>
      )}

      {/* 5. Movie Detail Modal */}
      {selectedMovieForDetail && !activeRoomId && (
        <MovieDetailModal
          movie={selectedMovieForDetail}
          onClose={closeDetailModal}
          onPlayMovie={handlePlayMovie}
          onPlayEpisode={handlePlayEpisode}
          onToggleMyList={handleToggleMyList}
          isInMyList={isInMyList}
          onSelectRelatedMovie={(m) => openDetailModal(m)}
          onSearchSubmit={handleSearchSubmit}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          activeRooms={activeRoomsForFilm}
          userActiveRoomId={activeRoomId}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onShowToast={showToast}
        />
      )}

      {/* 5b. Watch Together Room */}
      {activeRoomId && !activeRoomData && currentAccount && (
        <div className="fixed inset-0 z-[80] bg-[#060a14] flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-300">Đang vào phòng...</p>
          </div>
        </div>
      )}
      {activeRoomId && activeRoomData && currentAccount && activeProfile && (
        <WatchTogetherRoom
          room={activeRoomData}
          currentUserId={currentAccount.id}
          currentUserName={activeProfile.name || currentAccount.displayName}
          currentUserAvatar={activeProfile.avatar}
          onLeave={handleLeaveRoom}
          onEndRoom={handleEndRoom}
          onRoomClosed={() => { handleLeaveRoom(); setActiveTab('xem-chung'); }}
        />
      )}

      {/* Join Room Modal (from Xem Chung tab) */}
      {joinRoomTarget && (
        <JoinRoomModal
          isOpen={!!joinRoomTarget}
          roomId={joinRoomTarget.roomId}
          hostName={joinRoomTarget.hostName}
          episode={joinRoomTarget.episode}
          viewersCount={joinRoomTarget.viewersCount}
          onClose={() => setJoinRoomTarget(null)}
          onSubmit={async (password) => {
            await handleJoinRoom(joinRoomTarget.roomId, password);
            setJoinRoomTarget(null);
          }}
        />
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

  return (
    <>
      <NotificationTickerBanner currentAccount={currentAccount} />
      {/* Maintenance Warning Banner */}
      {maintenanceMessage && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{maintenanceMessage}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">
              {Math.floor(maintenanceCountdown / 60)}:{String(maintenanceCountdown % 60).padStart(2, '0')}
            </span>
            <button
              onClick={() => handleSwitchApp('cinema')}
              className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Về Cinema ngay
            </button>
          </div>
        </div>
      )}
      {appContent}
      {isSwitchingApp && targetApp && (
        <AppSwitcherLoading
          targetApp={targetApp}
          onLoadingComplete={handleSwitchAppComplete}
        />
      )}
      {dialog && (
        <CustomDialog
          isOpen={dialog.isOpen}
          onClose={closeDialog}
          title={dialog.title}
          message={dialog.message}
          type={dialog.type}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          onConfirm={dialog.onConfirm}
          showCancel={dialog.showCancel}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={() => {}} />
    </>
  );
}
