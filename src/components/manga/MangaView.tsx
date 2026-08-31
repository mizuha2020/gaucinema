import React, { useState, useEffect, useMemo } from 'react';
import { MangaItem, MangaSource, mangaApi, MangaChapter, MangaHistoryItem, getProxyImageUrl } from '../../services/mangaApi';
import { getFullApiUrl } from '../../services/apiConfig';
import { systemApiService } from '../../services/systemApiService';
import { firestoreStorage } from '../../services/firestoreStorage';
import { MangaDetailView } from './MangaDetailView';
import { MangaReaderModal } from './MangaReaderModal';
import { MangaRow } from './MangaRow';
import { MangaTop10Carousel } from './MangaTop10Carousel';
import { MangaGenreBanner } from './MangaGenreBanner';
import { MangaHeroBanner } from './MangaHeroBanner';
import { MangaSearchView } from './MangaSearchView';
import { MangaNavbar, MangaNavTab } from './MangaNavbar';
import { MangaSourceBadge } from './MangaSourceBadge';
import { UserProfile, Account } from '../../types';
import { Search, BookOpen, Bookmark, History, Flame, ChevronLeft, ChevronRight, Clock, Star, TrendingUp, Heart, AlertTriangle, X, Sparkles, Library, BookMarked, Trophy } from 'lucide-react';

interface MangaViewProps {
  activeProfile?: UserProfile | null;
  currentAccount?: Account | null;
  profiles?: UserProfile[];
  onSelectProfile?: (profile: UserProfile) => void;
  onSwitchApp?: (app: 'cinema' | 'manga' | 'livetv' | 'youtube' | 'anime') => void;
  onSwitchProfileScreen?: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
  onLogoClick?: () => void;
}

export const MangaView: React.FC<MangaViewProps> = ({ activeProfile, currentAccount, profiles = [], onSelectProfile, onSwitchApp, onSwitchProfileScreen, onOpenAdminDashboard, onLogout, onLogoClick }) => {
  const accountId = currentAccount?.id || '';
  const profileId = activeProfile?.id || '';

  const [selectedSource] = useState<MangaSource>(() => {
    const endpoints = systemApiService.getActiveEndpointsForCategory('manga');
    return (endpoints[0]?.id as MangaSource) || 'mangadex';
  });
  const [activeSources, setActiveSources] = useState<MangaSource[]>(['truyenqq', 'mangadex', 'otruyen', 'cuutruyen']);
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [homeInput, setHomeInput] = useState<string>('');
  const [exploreKeyword, setExploreKeyword] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const skipNextFetchRef = React.useRef(false);

  // Main navigation tab: home | explore | ranking | saved | history ; plus detail overlay
  const [activeTab, setActiveTab] = useState<MangaNavTab>(() => {
    try {
      const saved = localStorage.getItem('gau_manga_active_view');
      if (saved === 'explore' || saved === 'ranking' || saved === 'saved' || saved === 'history') return saved as MangaNavTab;
      if (saved === 'list') return 'home';
    } catch {}
    return 'home';
  });
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [activeReadingSession, setActiveReadingSession] = useState<{ manga: MangaItem; chapter: MangaChapter; pageIndex?: number } | null>(null);
  const isDetail = !!selectedManga;

  const [savedMangaList, setSavedMangaList] = useState<MangaItem[]>([]);
  const [historyList, setHistoryList] = useState<MangaHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 20;
  const [disabledSourceAlert, setDisabledSourceAlert] = useState<string | null>(null);

  // Persist active tab (excluding detail)
  useEffect(() => {
    if (!isDetail) {
      try { localStorage.setItem('gau_manga_active_view', activeTab); } catch {}
    }
  }, [activeTab, isDetail]);

  // Load Firestore saved/history
  useEffect(() => {
    let mounted = true;
    const fetchCloud = async () => {
      if (accountId && profileId) {
        const [saved, history] = await Promise.all([
          firestoreStorage.getSavedManga(accountId, profileId),
          firestoreStorage.getMangaHistory(accountId, profileId),
        ]);
        if (mounted) { setSavedMangaList(saved); setHistoryList(history); setHistoryPage(1); }
      } else {
        setSavedMangaList([]); setHistoryList([]); setHistoryPage(1);
      }
    };
    fetchCloud();
    return () => { mounted = false; };
  }, [accountId, profileId]);

  // Clamp historyPage when historyList shrinks
  useEffect(() => {
    const total = Math.max(1, Math.ceil(historyList.length / HISTORY_PAGE_SIZE));
    if (historyPage > total) setHistoryPage(total);
  }, [historyList.length]);

  const isSourceActive = (source: MangaSource) => activeSources.includes(source);

  useEffect(() => {
    const update = () => {
      const eps = systemApiService.getActiveEndpointsForCategory('manga');
      const srcs = eps.map(e=>e.id).filter((id):id is MangaSource => ['truyenqq','otruyen','mangadex','cuutruyen'].includes(id));
      if (srcs.length) {
        setActiveSources(srcs);
      }
    };
    update();
    const unsub = systemApiService.subscribe(update);
    return () => unsub();
  }, []);

  // Back handling
  useEffect(() => {
    const handler = () => {
      if (activeReadingSession) { setActiveReadingSession(null); return; }
      if (isDetail) { setSelectedManga(null); }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [activeReadingSession, isDetail]);

  const fetchMixed = async (pageNum: number, searchKey: string, append = false) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    const guard = setTimeout(() => { setIsLoading(false); setIsLoadingMore(false); }, 15000);
    try {
      // Trang đầu: nạp sẵn 8 page (~190 truyện) để 20 kệ đều đủ 20 truyện, không phải kéo xuống cuối mới thấy nhiều
      if (!append && pageNum === 1 && !searchKey) {
        const results = await Promise.all([
          mangaApi.getMixedMangaList(1, ''),
          mangaApi.getMixedMangaList(2, ''),
          mangaApi.getMixedMangaList(3, ''),
          mangaApi.getMixedMangaList(4, ''),
          mangaApi.getMixedMangaList(5, ''),
          mangaApi.getMixedMangaList(6, ''),
          mangaApi.getMixedMangaList(7, ''),
          mangaApi.getMixedMangaList(8, ''),
        ]);
        const merged: typeof results[0]['items'] = [];
        const seen = new Set<string>();
        let maxPages = 1;
        for (const r of results) {
          maxPages = Math.max(maxPages, r.totalPages || 1);
          for (const it of r.items || []) {
            if (!seen.has(it.id)) { seen.add(it.id); merged.push(it); }
          }
        }
        setMangaList(merged);
        setTotalPages(maxPages);
        if (merged.length > 0) { skipNextFetchRef.current = true; setPage(8); }
      } else {
        const result = await mangaApi.getMixedMangaList(pageNum, searchKey);
        if (append) {
          setMangaList(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newItems = (result.items || []).filter(it => !existingIds.has(it.id));
            return [...prev, ...newItems];
          });
        } else {
          setMangaList(result.items || []);
        }
        setTotalPages(result.totalPages || 1);
        if ((result.items || []).length === 0 && !append) setTotalPages(1);
      }
    } catch {
      if (!append) { setMangaList([]); setTotalPages(1); }
    } finally {
      clearTimeout(guard);
      setIsLoading(false);
      setIsLoadingMore(false);
      window.dispatchEvent(new Event('app-data-loaded'));
    }
  };

  // Home fetch - infinite scroll: page 1 replace (preload 1-3), page>1 append
  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return; }
    if (!isDetail && activeTab === 'home') {
      fetchMixed(page, searchKeyword, page > 1);
    } else if (!isDetail && activeTab === 'ranking') {
      fetchMixed(page, '', page > 1);
    }
  }, [page, activeTab, isDetail, searchKeyword, activeSources]);

  // Reset về trang 1 khi searchKeyword đổi (chỉ khi đang ở home)
  useEffect(() => {
    if (activeTab === 'home' && !isDetail) {
      setPage(1);
    }
  }, [searchKeyword]);

  // When exploreKeyword changes from search view, keep page 1
  useEffect(() => {
    if (activeTab === 'explore' && exploreKeyword !== searchKeyword) {
      setSearchKeyword(exploreKeyword);
      setPage(1);
    }
  }, [exploreKeyword, activeTab]);

  const handleOpenDetail = async (item: MangaItem) => {
    setIsLoading(true);
    const sourceToUse = item.source || selectedSource;
    let detail = await mangaApi.getMangaDetail(sourceToUse, item.id || item.slug);
    if (!detail || !detail.chapters || detail.chapters.length === 0) {
      const clean = (item.title || item.slug || '').replace(/-\d+$/, '').replace(/-/g, ' ').trim();
      if (clean) {
        try {
          const otRes = await mangaApi.getMangaList('otruyen', 1, clean);
          if (otRes.items.length) {
            const matched = otRes.items[0];
            const otDetail = await mangaApi.getMangaDetail('otruyen', matched.id || matched.slug);
            if (otDetail && otDetail.chapters.length) {
              detail = { ...otDetail, id: item.id || item.slug, title: item.title || otDetail.title, coverUrl: item.coverUrl || otDetail.coverUrl, source: item.source || 'truyenqq' };
            }
          }
        } catch {}
      }
    }
    setIsLoading(false);
    const full: MangaItem = {
      ...item,
      ...(detail || {}),
      title: item.title || detail?.title || 'Truyện Tranh',
      coverUrl: item.coverUrl || detail?.coverUrl || '',
      chapters: (detail?.chapters && detail.chapters.length) ? detail.chapters : (item.chapters || []),
    };
    setSelectedManga(full);
    window.history.pushState({ tab: 'manga', mangaView: 'detail', mangaId: item.id }, '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseDetail = () => {
    if (window.history.state && window.history.state.mangaView === 'detail') window.history.back();
    else setSelectedManga(null);
  };

  const handleStartReading = (chapter: MangaChapter, pageIdx = 0) => {
    if (!selectedManga || !chapter?.id) return;
    handleChapterRead(chapter, pageIdx);
    window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: chapter.id }, '');
    setActiveReadingSession({ manga: selectedManga, chapter, pageIndex: pageIdx });
  };

  const handleCloseReader = () => {
    if (window.history.state && window.history.state.mangaView === 'reader') window.history.back();
    else setActiveReadingSession(null);
  };

  const isCurrentMangaSaved = selectedManga ? savedMangaList.some(m => m.id === selectedManga.id) : false;

  const handleToggleSave = async (manga?: MangaItem) => {
    const target = manga || selectedManga;
    if (!target) return;
    if (accountId && profileId) {
      await firestoreStorage.toggleSavedManga(accountId, profileId, target);
      const updated = await firestoreStorage.getSavedManga(accountId, profileId);
      setSavedMangaList(updated);
    } else {
      const exists = savedMangaList.some(m => m.id === target.id);
      setSavedMangaList(prev => exists ? prev.filter(m => m.id !== target.id) : [target, ...prev]);
    }
  };

  const handleChapterRead = async (chapter: MangaChapter, pageIndex = 0) => {
    if (!selectedManga || !chapter?.id) return;
    const newItem: MangaHistoryItem = {
      mangaId: selectedManga.id,
      source: selectedManga.source,
      title: selectedManga.title,
      coverUrl: selectedManga.coverUrl,
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber || '',
      chapterTitle: chapter.title,
      pageIndex,
      totalPages: 0,
      timestamp: Date.now(),
    };
    if (accountId && profileId) {
      await firestoreStorage.saveMangaProgress(accountId, profileId, newItem);
      const updated = await firestoreStorage.getMangaHistory(accountId, profileId);
      setHistoryList(updated);
    } else {
      setHistoryList(prev => [newItem, ...prev.filter(h => h.mangaId !== selectedManga.id)].slice(0, 50));
    }
  };

  const handleTabChange = (tab: MangaNavTab) => {
    setSelectedManga(null);
    setActiveTab(tab);
    if (tab === 'history') setHistoryPage(1);
    if (tab === 'home' || tab === 'ranking') {
      // Về trang chủ/ranking thì không áp dụng search - clear Conan còn sót, reset về 1 để infinite scroll hoạt động
      setSearchKeyword('');
      setHomeInput('');
      if (tab === 'home') setExploreKeyword('');
      setPage(1);
      setMangaList([]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'explore') {
      // keep exploreKeyword synced
    }
  };

  const handleSearchSubmit = (keyword: string) => {
    setExploreKeyword(keyword);
    setSearchKeyword(keyword);
    setHomeInput(keyword);
    setPage(1);
    setActiveTab('explore');
    setSelectedManga(null);
  };
  const handleHomeSearchSubmit = () => {
    const kw = homeInput.trim();
    if (!kw) return;
    setExploreKeyword(kw);
    setSearchKeyword(kw);
    setPage(1);
    setActiveTab('explore');
    setSelectedManga(null);
  };

  // Derived: continue reading (latest unique per manga, max 6)
  const continueReading = useMemo(() => {
    const map = new Map<string, MangaHistoryItem>();
    [...historyList].sort((a,b)=> b.timestamp - a.timestamp).forEach(h => {
      if (!map.has(h.mangaId)) map.set(h.mangaId, h);
    });
    return Array.from(map.values()).slice(0, 6);
  }, [historyList]);

  // Detail related mangas
  const relatedForDetail = useMemo(() => mangaList.filter(m => m.id !== selectedManga?.id).slice(0, 6), [mangaList, selectedManga]);

  // Hero: ưu tiên MangaDex 70% logic - chỉ lấy MangaDex, fallback mới lấy mix
  const heroMangas = useMemo(() => {
    const dex = mangaList.filter(m => m.source === 'mangadex');
    if (dex.length >= 3) return dex.slice(0, 5);
    if (dex.length > 0) {
      const fallback = mangaList.filter(m => m.source !== 'mangadex').slice(0, 5 - dex.length);
      return [...dex, ...fallback];
    }
    return mangaList.slice(0, 5);
  }, [mangaList]);

  // Helper lọc theo thể loại (hỗ trợ cả tiếng Việt lẫn English tags từ MangaDex)
  const filterByGenre = (keywords: string[]) =>
    mangaList.filter(m => {
      const gs = (m.genres || []).map(g => g.toLowerCase());
      if (gs.length === 0) return false;
      return keywords.some(kw => gs.some(g => g.includes(kw.toLowerCase()) || kw.toLowerCase().includes(g)));
    });
  const filterByStatus = (statusKw: string) =>
    mangaList.filter(m => (m.status || '').toLowerCase().includes(statusKw.toLowerCase()));

  // "Vì bạn đã xem ABC" - suggest dựa trên bộ gần nhất trong lịch sử
  const lastViewedManga = useMemo(() => {
    if (historyList.length === 0) return null;
    const sorted = [...historyList].sort((a,b)=> b.timestamp - a.timestamp);
    const last = sorted[0];
    // Tìm manga tương ứng trong list hiện tại để lấy genres
    const found = mangaList.find(m => m.id === last.mangaId || m.title === last.title) || mangaList.find(m => m.title.toLowerCase().includes(last.title.toLowerCase().slice(0,10)));
    if (found) return found;
    // Fallback: dùng chính history title nếu không tìm thấy genres
    return { id: last.mangaId, title: last.title, genres: [] } as MangaItem;
  }, [historyList, mangaList]);

  const suggestedForLastViewed = useMemo(() => {
    if (!lastViewedManga || !lastViewedManga.genres || lastViewedManga.genres.length === 0) return [];
    const target = lastViewedManga.genres.map(g=>g.toLowerCase());
    const filtered = mangaList.filter(m => m.id !== lastViewedManga.id && (m.genres || []).some(g => target.some(t => g.toLowerCase().includes(t) || t.includes(g.toLowerCase()))));
    return filtered.slice(0, 20);
  }, [lastViewedManga, mangaList]);

  // 20 list khác nhau - deduplicate để 1 truyện chỉ xuất hiện 1 list, load thêm truyện để lấp chỗ trống
  const allHomeLists = useMemo(() => {
    const usedIds = new Set<string>();
    // Top10 và "Vì bạn đã xem" đã render riêng, nên cho vào used để không lặp lại trong các kệ dưới
    const top10Ids = mangaList.slice(0, 10).map(m=>m.id);
    top10Ids.forEach(id=> usedIds.add(id));
    if (suggestedForLastViewed.length > 0) suggestedForLastViewed.forEach(m=> usedIds.add(m.id));

    const rawLists: Array<{ title: string; getMangas: () => MangaItem[]; icon: React.ReactNode }> = [
      { title: "Mới Cập Nhật Hôm Nay", getMangas: () => mangaList.slice(0, 20), icon: <Star className="w-5 h-5 fill-fuchsia-500 text-fuchsia-400" /> },
      { title: "Hành Động & Phiêu Lưu", getMangas: () => filterByGenre(['hành động','action','adventure','phiêu lưu']), icon: <TrendingUp className="w-5 h-5 text-fuchsia-400" /> },
      { title: "Tình Cảm & Lãng Mạn", getMangas: () => filterByGenre(['tình cảm','romance','lãng mạn','ngôn tình']), icon: <Heart className="w-5 h-5 fill-fuchsia-400 text-fuchsia-400" /> },
      { title: "Hài Hước & Đời Thường", getMangas: () => filterByGenre(['hài','comedy','funny','đời thường','slice of life']), icon: <Sparkles className="w-5 h-5 text-emerald-400" /> },
      { title: "Fantasy & Xuyên Không", getMangas: () => filterByGenre(['fantasy','xuyên không','chuyển sinh','isekai','tiên hiệp','magic']), icon: <Flame className="w-5 h-5 text-orange-400" /> },
      { title: "Kinh Dị & Siêu Nhiên", getMangas: () => filterByGenre(['kinh dị','horror','siêu nhiên','supernatural','psychological']), icon: <BookOpen className="w-5 h-5 text-rose-400" /> },
      { title: "Trinh Thám & Bí Ẩn", getMangas: () => filterByGenre(['trinh thám','mystery','detective','bí ẩn']), icon: <Search className="w-5 h-5 text-sky-400" /> },
      { title: "Học Đường & Tuổi Trẻ", getMangas: () => filterByGenre(['học đường','school','tuổi trẻ','youth']), icon: <Library className="w-5 h-5 text-indigo-400" /> },
      { title: "Võ Hiệp & Kiếm Hiệp", getMangas: () => filterByGenre(['võ hiệp','kiếm hiệp','martial','wuxia']), icon: <Trophy className="w-5 h-5 text-amber-500" /> },
      { title: "Tiên Hiệp & Tu Tiên", getMangas: () => filterByGenre(['tiên hiệp','tu tiên','cultivation']), icon: <Flame className="w-5 h-5 text-cyan-400" /> },
      { title: "Khoa Học Viễn Tưởng", getMangas: () => filterByGenre(['khoa học','sci-fi','viễn tưởng','mecha']), icon: <Star className="w-5 h-5 text-sky-400" /> },
      { title: "Lịch Sử & Cổ Đại", getMangas: () => filterByGenre(['lịch sử','historical','cổ đại']), icon: <Clock className="w-5 h-5 text-amber-400" /> },
      { title: "Thể Thao & Đua Tranh", getMangas: () => filterByGenre(['thể thao','sports','đua']), icon: <TrendingUp className="w-5 h-5 text-green-400" /> },
      { title: "Âm Nhạc & Nghệ Thuật", getMangas: () => filterByGenre(['âm nhạc','music','nghệ thuật']), icon: <Sparkles className="w-5 h-5 text-pink-400" /> },
      { title: "Quân Đội & Chiến Tranh", getMangas: () => filterByGenre(['quân đội','military','chiến tranh','war']), icon: <Trophy className="w-5 h-5 text-red-500" /> },
      { title: "Siêu Năng Lực", getMangas: () => filterByGenre(['siêu năng','super power','siêu anh hùng','superhero']), icon: <Flame className="w-5 h-5 text-yellow-400" /> },
      { title: "Hoàn Thành - Đã Kết Thúc", getMangas: () => filterByStatus('completed'), icon: <BookMarked className="w-5 h-5 text-emerald-500" /> },
      { title: "Đang Tiến Hành", getMangas: () => filterByStatus('ongoing'), icon: <Clock className="w-5 h-5 text-blue-400" /> },
      { title: "Đề Xuất Ngẫu Nhiên", getMangas: () => [...mangaList].sort(()=>Math.random()-0.5), icon: <Heart className="w-5 h-5 text-pink-400" /> },
    ];

    const deduped: Array<{ title: string; mangas: MangaItem[]; icon: React.ReactNode }> = [];
    for (const item of rawLists) {
      const candidates = item.getMangas().filter(m => !usedIds.has(m.id));
      // Yêu cầu 20 truyện/kệ: nếu thiếu thì lấp đầy từ pool chưa dùng để đủ 20
      if (candidates.length >= 4) {
        let sliced = candidates.slice(0, 20);
        if (sliced.length < 20) {
          // Lấp thêm cho đủ 20
          for (const m of mangaList) {
            if (sliced.length >= 20) break;
            if (!usedIds.has(m.id) && !sliced.some(f=>f.id===m.id)) sliced.push(m);
          }
        }
        sliced.forEach(m => usedIds.add(m.id));
        deduped.push({ title: item.title, mangas: sliced, icon: item.icon });
      } else if (candidates.length > 0) {
        const filled = [...candidates];
        for (const m of mangaList) {
          if (filled.length >= 20) break;
          if (!usedIds.has(m.id) && !filled.some(f=>f.id===m.id)) filled.push(m);
        }
        if (filled.length >= 4) {
          filled.slice(0,20).forEach(m=> usedIds.add(m.id));
          deduped.push({ title: item.title, mangas: filled.slice(0,20), icon: item.icon });
        }
      } else {
        // Hoàn toàn không có truyện khớp genre (hiếm): vẫn lấp 20 từ pool để kệ không bị ít
        const filled: MangaItem[] = [];
        for (const m of mangaList) {
          if (filled.length >= 20) break;
          if (!usedIds.has(m.id)) filled.push(m);
        }
        if (filled.length >= 4) {
          filled.forEach(m=> usedIds.add(m.id));
          deduped.push({ title: item.title, mangas: filled, icon: item.icon });
        }
      }
    }
    return deduped;
  }, [mangaList, suggestedForLastViewed]);

  const [visibleListCount, setVisibleListCount] = useState(4);
  // Reset khi về home hoặc khi mangaList thay đổi lần đầu
  useEffect(() => { if (activeTab === 'home') setVisibleListCount(4); }, [activeTab]);

  // Scroll chỉ để hiện thêm kệ (4 kệ/lần), không nạp thêm truyện vào kệ cũ để tránh giật
  useEffect(() => {
    if (isDetail || activeTab !== 'home' || searchKeyword) return;
    if (visibleListCount >= allHomeLists.length) return;
    const onScroll = () => {
      const scrollY = window.scrollY;
      const viewportH = window.innerHeight;
      const fullH = document.documentElement.scrollHeight;
      if (fullH - (scrollY + viewportH) > 1000) return;
      setVisibleListCount(c => Math.min(allHomeLists.length, c + 4));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeTab, isDetail, searchKeyword, visibleListCount, allHomeLists.length]);

  return (
    <div className="min-h-screen bg-[#0b0c16] text-white selection:bg-fuchsia-600 selection:text-white">
      {/* Navbar - luôn hiện để logo luôn bấm được, chỉ ẩn khi đang đọc truyện */}
      {!activeReadingSession && (
        <div className="block">
          <MangaNavbar
            currentAccount={currentAccount}
            activeProfile={activeProfile}
            profiles={profiles}
            onSelectProfile={onSelectProfile || (()=>{})}
            onSwitchApp={onSwitchApp || (()=>{})}
            onSwitchProfileScreen={onSwitchProfileScreen}
            onOpenAdminDashboard={onOpenAdminDashboard}
            onLogout={onLogout}
            onLogoClick={() => {
              onLogoClick?.();
              setSelectedManga(null);
              setActiveTab('home');
              setSearchKeyword('');
              setHomeInput('');
              setExploreKeyword('');
              setPage(1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSelectManga={handleOpenDetail}
            onSearchSubmit={handleSearchSubmit}
            selectedSource={selectedSource}
          />
        </div>
      )}

      {/* Reader Modal */}
      {activeReadingSession && selectedManga && (
        <MangaReaderModal
          manga={selectedManga}
          initialChapter={activeReadingSession.chapter}
          initialPageIndex={activeReadingSession.pageIndex || 0}
          onClose={handleCloseReader}
          onSelectChapter={(ch) => setActiveReadingSession({ manga: selectedManga, chapter: ch, pageIndex: 0 })}
          onChapterRead={handleChapterRead}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
        />
      )}

      {/* Detail View */}
      {isDetail && selectedManga ? (
        <MangaDetailView
          manga={selectedManga}
          onBack={handleCloseDetail}
          onReadChapter={handleStartReading}
          recentHistory={historyList.find(h => h.mangaId === selectedManga.id)}
          isSaved={isCurrentMangaSaved}
          onToggleSave={() => handleToggleSave()}
          relatedMangas={relatedForDetail}
          onOpenRelated={handleOpenDetail}
        />
      ) : (
        <div className="pt-20 sm:pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
          {/* Tab-specific content */}
          {activeTab === 'explore' ? (
            <MangaSearchView
              initialKeyword={exploreKeyword || searchKeyword}
              initialSource={selectedSource}
              onOpenDetail={handleOpenDetail}
              onSearchChange={(kw) => { setExploreKeyword(kw); setSearchKeyword(kw); setHomeInput(kw); }}
            />
          ) : activeTab === 'ranking' ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"><Trophy className="w-5 h-5 text-white" /></span>
                  Bảng Xếp Hạng
                </h1>
                <p className="text-sm text-white/50">Top truyện nổi bật được cập nhật mới nhất.</p>
              </div>
              {isLoading ? (
                <div className="py-16 flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-white/10 border-t-fuchsia-500 rounded-full animate-spin" /><p className="text-sm text-white/40">Đang tải bảng xếp hạng...</p></div>
              ) : (
                <div className="space-y-3">
                  {mangaList.slice(0, 20).map((manga, idx) => (
                    <div key={`${manga.id}-${idx}`} onClick={() => handleOpenDetail(manga)} className="group flex items-center gap-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-fuchsia-500/30 hover:bg-white/[0.05] cursor-pointer transition-colors">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${idx < 3 ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg' : 'bg-white/5 text-white/60 border border-white/10'}`}>{idx + 1}</span>
                      <img src={getFullApiUrl(manga.coverUrl)} alt={manga.title} className="w-12 h-16 object-cover rounded-xl border border-white/10 shrink-0" referrerPolicy="no-referrer" onError={(e)=>{ const t=e.target as HTMLImageElement; if(!t.src.includes('/api/proxy/image') && manga.coverUrl.startsWith('http')) t.src=getProxyImageUrl(manga.coverUrl); else (t.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'); }} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-white truncate group-hover:text-fuchsia-300">{manga.title}</h3>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <MangaSourceBadge source={manga.source} size="xs" />
                          {manga.status && <span className="text-[11px] text-white/40 truncate">• {manga.status}</span>}
                          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">#{idx+1} HOT</span>
                          <span className="text-xs text-white/30 hidden sm:inline">{manga.genres?.slice(0,2).join(' • ')}</span>
                        </div>
                      </div>
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30 px-3 py-1.5 rounded-full group-hover:bg-fuchsia-600 group-hover:text-white transition-colors"><BookOpen className="w-3.5 h-3.5" /> Đọc</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'saved' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center"><Library className="w-5 h-5 text-white" /></span>
                    Tủ Sách ({savedMangaList.length})
                  </h1>
                  <p className="text-sm text-white/40 mt-1">Truyện bạn đã lưu — đồng bộ theo hồ sơ.</p>
                </div>
                <button onClick={() => handleTabChange('home')} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition cursor-pointer">Về trang chủ</button>
              </div>
              {savedMangaList.length === 0 ? (
                <div className="text-center py-20 bg-white/[0.02] rounded-3xl border border-white/5 space-y-3">
                  <BookMarked className="w-12 h-12 text-white/20 mx-auto" />
                  <p className="text-white/40 text-sm">Chưa có truyện nào trong tủ sách.</p>
                  <button onClick={() => handleTabChange('explore')} className="mt-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-bold rounded-xl cursor-pointer">Khám phá ngay</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
                  {savedMangaList.map((manga, idx) => {
                    const active = isSourceActive(manga.source);
                    return (
                      <div key={`${manga.id}-${idx}`} onClick={() => { if(!active){ setDisabledSourceAlert(`Nguồn "${manga.source.toUpperCase()}" đang tạm khóa.`); return; } handleOpenDetail(manga); }} className={`group bg-white/[0.03] rounded-2xl overflow-hidden border border-white/10 hover:border-fuchsia-500/40 transition flex flex-col cursor-pointer hover:-translate-y-1 ${!active ? 'opacity-50 grayscale' : ''}`}>
                        <div className="relative aspect-[3/4] overflow-hidden bg-black">
                          <img src={getFullApiUrl(manga.coverUrl)} alt={manga.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" onError={(e)=>{ const t=e.target as HTMLImageElement; if(!t.src.includes('/api/proxy/image') && manga.coverUrl.startsWith('http')) t.src=getProxyImageUrl(manga.coverUrl); else t.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'; }} />
                          {!active && <div className="absolute inset-0 bg-black/70 flex items-center justify-center"><span className="bg-red-600/90 text-white text-[10px] font-bold px-2 py-1 rounded">Tạm khóa</span></div>}
                        </div>
                        <div className="p-3 flex-1 flex flex-col gap-1">
                          <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-2 group-hover:text-fuchsia-300">{manga.title}</h3>
                          <span className="text-[10px] text-fuchsia-400 font-bold uppercase">{manga.source}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'history' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center"><History className="w-5 h-5 text-white" /></span>
                    Lịch Sử Đọc ({historyList.length})
                  </h1>
                  <p className="text-sm text-white/40 mt-1">Các chương bạn đã đọc gần đây.</p>
                </div>
                <div className="flex items-center gap-2">
                  {historyList.length > 0 && <button onClick={() => { if(confirm('Xóa toàn bộ lịch sử?')) setHistoryList([]); }} className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-sm cursor-pointer">Xóa lịch sử</button>}
                  <button onClick={() => handleTabChange('home')} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm cursor-pointer">Về trang chủ</button>
                </div>
              </div>
              {historyList.length === 0 ? (
                <div className="text-center py-20 bg-white/[0.02] rounded-3xl border border-white/5 space-y-3">
                  <History className="w-12 h-12 text-white/20 mx-auto" />
                  <p className="text-white/40 text-sm">Chưa có lịch sử đọc truyện nào.</p>
                </div>
              ) : (
                <>
                <div className="flex items-center justify-between text-xs text-white/40 px-1">
                  <span>Hiển thị {Math.min(historyList.length, historyPage * HISTORY_PAGE_SIZE)} / {historyList.length} • Trang {historyPage} / {Math.max(1, Math.ceil(historyList.length / HISTORY_PAGE_SIZE))}</span>
                  <span className="hidden sm:inline">20 truyện / trang</span>
                </div>
                <div className="space-y-3">
                  {historyList.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((item, idx) => {
                    const active = isSourceActive(item.source);
                    return (
                      <div key={idx} onClick={async () => {
                        if(!active){ setDisabledSourceAlert(`Nguồn "${item.source.toUpperCase()}" đang tạm khóa.`); return; }
                        setIsLoading(true);
                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);
                        setIsLoading(false);
                        const full = detail || { id: item.mangaId, title: item.title, slug: item.mangaId, coverUrl: item.coverUrl, source: item.source, chapters: [{ id: item.chapterId, chapterNumber: '1', title: item.chapterTitle, source: item.source }] };
                        setSelectedManga(full as MangaItem);
                        const found = (full as MangaItem).chapters.find(c=>c.id===item.chapterId) || (full as MangaItem).chapters[0];
                        if(found){ window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: found.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: found, pageIndex: item.pageIndex || 0 }); }
                      }} className={`bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition ${!active ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center gap-4 min-w-0">
                          <img src={getFullApiUrl(item.coverUrl)} alt={item.title} referrerPolicy="no-referrer" className="w-12 h-16 object-cover rounded-xl border border-white/10 shrink-0" onError={(e)=>{ const t=e.target as HTMLImageElement; if(!t.src.includes('/api/proxy/image') && item.coverUrl.startsWith('http')) t.src=getProxyImageUrl(item.coverUrl); else t.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'; }} />
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm sm:text-base text-white truncate">{item.title}</h3>
                            <p className="text-xs text-fuchsia-400 font-medium truncate">{item.chapterTitle} • <span className="uppercase text-white/30">{item.source}</span></p>
                            <p className="text-[11px] text-white/30 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(item.timestamp).toLocaleString('vi-VN')}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ml-3 ${active ? 'bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30' : 'bg-white/5 text-white/30'}`}>{active ? 'Đọc tiếp' : 'Khóa'}</span>
                      </div>
                    );
                  })}
                </div>
                {historyList.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button onClick={()=> setHistoryPage(p=> Math.max(1, p-1))} disabled={historyPage===1} className={`p-2.5 rounded-xl border transition cursor-pointer ${historyPage===1 ? 'border-white/5 text-white/20 cursor-not-allowed' : 'border-white/10 text-white hover:bg-white/10'}`}><ChevronLeft className="w-5 h-5" /></button>
                    <span className="text-sm font-semibold text-white/60">Trang {historyPage} / {Math.max(1, Math.ceil(historyList.length / HISTORY_PAGE_SIZE))}</span>
                    <button onClick={()=> setHistoryPage(p=> Math.min(Math.ceil(historyList.length / HISTORY_PAGE_SIZE), p+1))} disabled={historyPage >= Math.ceil(historyList.length / HISTORY_PAGE_SIZE)} className={`p-2.5 rounded-xl border transition cursor-pointer ${historyPage >= Math.ceil(historyList.length / HISTORY_PAGE_SIZE) ? 'border-white/5 text-white/20 cursor-not-allowed' : 'border-white/10 text-white hover:bg-white/10'}`}><ChevronRight className="w-5 h-5" /></button>
                  </div>
                )}
                </>
              )}
            </div>
          ) : (
            /* HOME TAB - Rich Cinema-style layout */
            <div className="space-y-8">
              {/* Home Header */}
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-fuchsia-200 to-purple-300">
                  Thế Giới Truyện Tranh
                </h1>
                <p className="text-sm text-white/40">Khám phá hàng ngàn tựa manga chất lượng cao — cập nhật liên tục từ 4 nguồn lớn.</p>
              </div>

              {/* Home - bỏ tìm kiếm nhanh theo yêu cầu, giữ header gọn */}

              {/* Hero Banner - chỉ MangaDex để nét, fallback nếu trống */}
              {!isLoading && page===1 && !searchKeyword && heroMangas.length > 0 && (
                <MangaHeroBanner
                  mangas={heroMangas}
                  onOpenDetail={handleOpenDetail}
                  onRead={(m)=> handleOpenDetail(m)}
                  onToggleSave={(m)=> handleToggleSave(m)}
                  isSaved={(id)=> savedMangaList.some(s=>s.id===id)}
                />
              )}

              {/* Continue Reading */}
              {continueReading.length > 0 && !isDetail && (
                <div className="bg-white/[0.02] border border-fuchsia-900/30 rounded-3xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-600 flex items-center justify-center"><BookOpen className="w-4 h-4 text-white" /></span>
                      Tiếp Tục Đọc <span className="text-xs bg-fuchsia-600 text-white px-2 py-0.5 rounded-full">{continueReading.length}</span>
                    </h2>
                    <button onClick={()=> handleTabChange('history')} className="text-xs text-white/50 hover:text-white cursor-pointer">Xem tất cả →</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {continueReading.map((item, idx) => (
                      <div key={`${item.mangaId}-${idx}`} onClick={async()=>{
                        setIsLoading(true);
                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);
                        setIsLoading(false);
                        const full = detail || { id: item.mangaId, title: item.title, slug: item.mangaId, coverUrl: item.coverUrl, source: item.source, chapters: [{ id: item.chapterId, chapterNumber: item.chapterNumber, title: item.chapterTitle, source: item.source }] };
                        setSelectedManga(full as MangaItem);
                        const ch = (full as MangaItem).chapters.find(c=>c.id===item.chapterId) || (full as MangaItem).chapters[0];
                        if(ch) { window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: ch.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: ch, pageIndex: item.pageIndex || 0 }); }
                      }} className="group relative w-36 sm:w-40 shrink-0 bg-[#0f0f14] rounded-2xl overflow-hidden border border-white/10 hover:border-fuchsia-500/40 cursor-pointer hover:scale-[1.02] transition-all flex flex-col">
                        <div className="relative aspect-[3/4] overflow-hidden bg-black">
                          <img src={getFullApiUrl(item.coverUrl)} alt={item.title} className="w-full h-full object-cover object-top group-hover:scale-105 transition" referrerPolicy="no-referrer" loading="lazy" onError={(e)=>{ const t=e.target as HTMLImageElement; if(!t.src.includes('/api/proxy/image') && item.coverUrl.startsWith('http')) t.src=getProxyImageUrl(item.coverUrl); else t.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'; }} />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition flex items-center justify-center"><span className="bg-fuchsia-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">Đọc tiếp</span></div>
                          <div className="absolute top-2 left-2 bg-black/70 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-full border border-white/10 line-clamp-1 max-w-[90%]">{item.chapterTitle}</div>
                        </div>
                        <div className="p-2.5">
                          <h4 className="font-bold text-xs text-white line-clamp-2 leading-snug group-hover:text-fuchsia-300 min-h-[32px]">{item.title}</h4>
                          <p className="text-[11px] text-white/40 mt-1 truncate">{new Date(item.timestamp).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {/* Carousels / Grid */}
              {isLoading ? (
                <div className="py-20 flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-white/10 border-t-fuchsia-500 rounded-full animate-spin" /><p className="text-sm text-white/40">Đang tải dữ liệu...</p></div>
              ) : mangaList.length === 0 ? (
                <div className="text-center py-16 bg-white/[0.02] border border-white/5 rounded-3xl space-y-3">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto"><Search className="w-7 h-7 text-white/20" /></div>
                  <p className="text-white/40 text-sm">Không tìm thấy truyện phù hợp.</p>
                  <button onClick={()=> { setSearchKeyword(''); setPage(1); }} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-bold rounded-xl cursor-pointer">Thử lại</button>
                </div>
              ) : (
                <div className="space-y-8 -mx-4 sm:-mx-6 lg:-mx-8">
                  {/* Genre banner */}
                  {page===1 && !searchKeyword && mangaList.length >= 6 && (
                    <div className="px-4 sm:px-6 lg:px-8">
                      <MangaGenreBanner mangas={mangaList} onOpenDetail={handleOpenDetail} />
                    </div>
                  )}

                  {/* Search filtered view */}
                  {searchKeyword ? (
                    <div className="px-4 sm:px-6 lg:px-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-fuchsia-400" /> Kết quả cho "{searchKeyword}"</h3>
                        <span className="text-xs text-white/30">{mangaList.length} truyện</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                        {mangaList.map((manga, idx)=>(
                          <div key={`${manga.id}-${idx}`} onClick={()=> handleOpenDetail(manga)} className="group cursor-pointer">
                            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/5 border border-white/10 group-hover:border-fuchsia-500/40">
                              <img src={manga.coverUrl} alt={manga.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" onError={(e)=>{ const t=e.target as HTMLImageElement; if(!t.src.includes('/api/proxy/image') && manga.coverUrl.startsWith('http')) t.src=getProxyImageUrl(manga.coverUrl); else t.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'; }} />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"><div className="bg-fuchsia-600 text-white p-2.5 rounded-full shadow-xl"><BookOpen className="w-5 h-5" /></div></div>
                              <div className="absolute top-2 left-2 right-2 flex justify-end"><MangaSourceBadge source={manga.source} size="xs" /></div>
                            </div>
                            <h3 className="font-bold text-sm text-white line-clamp-2 group-hover:text-fuchsia-300 mt-2 leading-snug">{manga.title}</h3>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <MangaTop10Carousel title="Thịnh Hành Trong Tuần" mangas={mangaList.slice(0,10)} onOpenDetail={handleOpenDetail} />
                      {suggestedForLastViewed.length > 0 && lastViewedManga && (
                        <MangaRow
                          title={`Vì bạn đã xem "${lastViewedManga.title.slice(0,28)}${lastViewedManga.title.length>28?'…':''}"`}
                          mangas={suggestedForLastViewed}
                          onOpenDetail={handleOpenDetail}
                          icon={<Sparkles className="w-5 h-5 text-amber-400" />}
                        />
                      )}
                      {allHomeLists.slice(0, visibleListCount).map(list => (
                        <MangaRow key={list.title} title={list.title} mangas={list.mangas} onOpenDetail={handleOpenDetail} icon={list.icon} />
                      ))}
                      {visibleListCount < allHomeLists.length && (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <div className="w-6 h-6 border-2 border-white/10 border-t-fuchsia-500 rounded-full animate-spin" />
                          <p className="text-xs text-white/40">Đang tải thêm 3-4 kệ...</p>
                        </div>
                      )}
                      {visibleListCount >= allHomeLists.length && allHomeLists.length > 0 && (
                        <div className="text-center py-8">
                          <p className="text-sm font-bold text-white/60">Bạn đã duyệt qua hết • {allHomeLists.length} kệ truyện</p>
                          <p className="text-xs text-white/30 mt-1">Đã hiển thị tất cả {mangaList.length} truyện</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}


            </div>
          )}
        </div>
      )}

      {/* Disabled source alert */}
      {disabledSourceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f0f14] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <button onClick={()=> setDisabledSourceAlert(null)} className="absolute top-4 right-4 text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400"><AlertTriangle className="w-6 h-6" /></div>
            <div><h3 className="text-lg font-bold text-white">Nguồn Tạm Khóa</h3><p className="text-sm text-white/60 mt-1">{disabledSourceAlert}</p></div>
            <button onClick={()=> setDisabledSourceAlert(null)} className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm cursor-pointer">Đã hiểu</button>
          </div>
        </div>
      )}

      {/* Bottom nav for mobile - when not in detail/reader */}
      {!activeReadingSession && !isDetail && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b0c16]/95 backdrop-blur border-t border-purple-900/30 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around p-1.5">
            {([
              { tab: 'home' as MangaNavTab, label: 'Trang Chủ', icon: BookOpen },
              { tab: 'explore' as MangaNavTab, label: 'Khám Phá', icon: Search },
              { tab: 'ranking' as MangaNavTab, label: 'Xếp Hạng', icon: Flame },
              { tab: 'saved' as MangaNavTab, label: 'Tủ Sách', icon: Bookmark },
              { tab: 'history' as MangaNavTab, label: 'Lịch Sử', icon: History },
            ] as const).map(item => (
              <button key={item.tab} onClick={()=> handleTabChange(item.tab)} className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[56px] ${activeTab===item.tab ? 'text-fuchsia-400 bg-purple-900/30' : 'text-white/40'}`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-bold">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
