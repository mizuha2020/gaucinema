import React, { useState, useEffect } from 'react';
import { MangaItem, MangaSource, mangaApi, MangaChapter, MangaHistoryItem, getProxyImageUrl } from '../../services/mangaApi';
import { systemApiService } from '../../services/systemApiService';
import { firestoreStorage } from '../../services/firestoreStorage';
import { MangaDetailView } from './MangaDetailView';
import { MangaReaderModal } from './MangaReaderModal';
import { MangaRow } from './MangaRow';
import { MangaTop10Carousel } from './MangaTop10Carousel';
import { MangaGenreBanner } from './MangaGenreBanner';
import { UserProfile, Account } from '../../types';
import { Search, BookOpen, Bookmark, History, Flame, ChevronLeft, ChevronRight, Clock, Star, Play, TrendingUp, Heart, ArrowRight, AlertTriangle, X } from 'lucide-react';

interface MangaViewProps {
  activeProfile?: UserProfile | null;
  currentAccount?: Account | null;
}

export const MangaView: React.FC<MangaViewProps> = ({ activeProfile, currentAccount }) => {
  const accountId = currentAccount?.id || '';
  const profileId = activeProfile?.id || '';

  const [selectedSource, setSelectedSource] = useState<MangaSource>(() => {
    const endpoints = systemApiService.getActiveEndpointsForCategory('manga');
    return (endpoints[0]?.id as MangaSource) || 'mangadex';
  });
  const [activeSources, setActiveSources] = useState<MangaSource[]>(['mangadex', 'otruyen', 'cuutruyen']);
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Sub-navigation view: 'list' | 'detail' | 'saved' | 'history'
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'saved' | 'history'>(() => {
    try {
      const saved = localStorage.getItem('gau_manga_active_view');
      if (saved && ['list', 'saved', 'history'].includes(saved)) {
        return saved as 'list' | 'saved' | 'history';
      }
    } catch (e) {
      console.error('Failed to read manga active view from localStorage:', e);
    }
    return 'list';
  });

  useEffect(() => {
    if (currentView === 'list' || currentView === 'saved' || currentView === 'history') {
      try {
        localStorage.setItem('gau_manga_active_view', currentView);
      } catch (e) {
        console.error('Failed to save manga active view to localStorage:', e);
      }
    }
  }, [currentView]);
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [activeReadingSession, setActiveReadingSession] = useState<{ manga: MangaItem; chapter: MangaChapter; pageIndex?: number } | null>(null);

  // Saved / Bookmarked Manga per user (Firestore)
  const [savedMangaList, setSavedMangaList] = useState<MangaItem[]>([]);
  // Reading history per user (Firestore)
  const [historyList, setHistoryList] = useState<MangaHistoryItem[]>([]);
  const [disabledSourceAlert, setDisabledSourceAlert] = useState<string | null>(null);

  // Load from Firestore
  useEffect(() => {
    let isMounted = true;
    const fetchCloudData = async () => {
      if (accountId && profileId) {
        const [saved, history] = await Promise.all([
          firestoreStorage.getSavedManga(accountId, profileId),
          firestoreStorage.getMangaHistory(accountId, profileId),
        ]);
        if (isMounted) {
          setSavedMangaList(saved);
          setHistoryList(history);
        }
      }
    };
    fetchCloudData();
    return () => {
      isMounted = false;
    };
  }, [accountId, profileId]);

  // Check if source is active
  const isSourceActive = (source: MangaSource) => {
    return activeSources.includes(source);
  };

  // Sync active sources from systemApiService
  useEffect(() => {
    const updateActiveSources = () => {
      const endpoints = systemApiService.getActiveEndpointsForCategory('manga');
      const sources = endpoints
        .map((e) => e.id)
        .filter((id): id is MangaSource => id === 'otruyen' || id === 'mangadex' || id === 'cuutruyen');

      if (sources.length > 0) {
        setActiveSources(sources);
        setSelectedSource((prev) => (sources.includes(prev) ? prev : sources[0]));
      }
    };

    updateActiveSources();
    const unsubscribe = systemApiService.subscribe(() => {
      updateActiveSources();
    });
    return () => unsubscribe();
  }, []);

  // Handle Browser Back button / Swipe Back via popstate
  useEffect(() => {
    const handlePopState = () => {
      if (activeReadingSession) {
        setActiveReadingSession(null);
        return;
      }
      if (currentView === 'detail' || currentView === 'saved' || currentView === 'history') {
        setCurrentView('list');
        setSelectedManga(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeReadingSession, currentView]);

  const fetchList = async (source: MangaSource, pageNum: number, searchKey: string) => {
    setIsLoading(true);
    const result = await mangaApi.getMangaList(source, pageNum, searchKey);
    setMangaList(result.items);
    setTotalPages(result.totalPages);
    setIsLoading(false);
    
    // Notify AppSwitcherLoading that the data is ready
    window.dispatchEvent(new Event('app-data-loaded'));
  };

  useEffect(() => {
    if (currentView === 'list') {
      fetchList(selectedSource, page, keyword);
    }
  }, [selectedSource, page, currentView]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchList(selectedSource, 1, keyword);
  };

  const handleOpenDetail = async (item: MangaItem) => {
    setIsLoading(true);
    const sourceToUse = item.source || selectedSource;
    const detail = await mangaApi.getMangaDetail(sourceToUse, item.id || item.slug);
    setIsLoading(false);
    const fullManga = detail || item;
    setSelectedManga(fullManga);
    setCurrentView('detail');
    window.history.pushState({ tab: 'manga', mangaView: 'detail', mangaId: item.id }, '');
  };

  const handleCloseDetail = () => {
    if (window.history.state && window.history.state.mangaView === 'detail') {
      window.history.back();
    } else {
      setCurrentView('list');
      setSelectedManga(null);
    }
  };

  const handleOpenSaved = () => {
    window.history.pushState({ tab: 'manga', mangaView: 'saved' }, '');
    setCurrentView('saved');
  };

  const handleOpenHistory = () => {
    window.history.pushState({ tab: 'manga', mangaView: 'history' }, '');
    setCurrentView('history');
  };

  const handleCloseSubView = () => {
    if (window.history.state && (window.history.state.mangaView === 'saved' || window.history.state.mangaView === 'history')) {
      window.history.back();
    } else {
      setCurrentView('list');
    }
  };

  const handleStartReading = (chapter: MangaChapter, pageIdx: number = 0) => {
    if (!selectedManga) return;
    handleChapterRead(chapter, pageIdx);
    window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: chapter.id }, '');
    setActiveReadingSession({ manga: selectedManga, chapter, pageIndex: pageIdx });
  };

  const handleCloseReader = () => {
    if (window.history.state && window.history.state.mangaView === 'reader') {
      window.history.back();
    } else {
      setActiveReadingSession(null);
    }
  };

  const isCurrentMangaSaved = selectedManga ? savedMangaList.some((m) => m.id === selectedManga.id) : false;

  const handleToggleSave = async () => {
    if (!selectedManga) return;
    if (accountId && profileId) {
      await firestoreStorage.toggleSavedManga(accountId, profileId, selectedManga);
      const updated = await firestoreStorage.getSavedManga(accountId, profileId);
      setSavedMangaList(updated);
    } else {
      const isSaved = savedMangaList.some((m) => m.id === selectedManga.id);
      if (isSaved) {
        setSavedMangaList((prev) => prev.filter((m) => m.id !== selectedManga.id));
      } else {
        setSavedMangaList((prev) => [selectedManga, ...prev]);
      }
    }
  };

  const handleChapterRead = async (chapter: MangaChapter, pageIndex: number = 0) => {
    if (!selectedManga) return;
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
      const updatedHistory = await firestoreStorage.getMangaHistory(accountId, profileId);
      setHistoryList(updatedHistory);
    } else {
      setHistoryList((prev) => [newItem, ...prev.filter((h) => h.mangaId !== selectedManga.id)].slice(0, 50));
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] text-white pt-28 sm:pt-32 pb-36 px-4 sm:px-8 max-w-7xl mx-auto space-y-8">
      {/* If reading session active */}
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

      {/* If Detail View */}
      {currentView === 'detail' && selectedManga ? (
        <MangaDetailView
          manga={selectedManga}
          onBack={handleCloseDetail}
          onReadChapter={handleStartReading}
          recentHistory={historyList.find((h) => h.mangaId === selectedManga.id)}
          isSaved={isCurrentMangaSaved}
          onToggleSave={handleToggleSave}
        />
      ) : currentView === 'saved' ? (
        /* Saved Manga View */
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center space-x-2">
                <Bookmark className="w-7 h-7 text-purple-500 fill-purple-500" />
                <span>Truyện Đã Lưu ({savedMangaList.length})</span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">Danh sách manga bạn đã lưu vào tủ truyện cá nhân.</p>
            </div>
            <button
              onClick={handleCloseSubView}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition"
            >
              Quay lại thư viện
            </button>
          </div>

          {savedMangaList.length === 0 ? (
            <div className="text-center py-28 bg-[#18181b] rounded-3xl border border-white/5 space-y-3">
              <Bookmark className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-sm">Chưa có truyện nào trong tủ lưu trữ của bạn.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {savedMangaList.map((manga, idx) => {
                const active = isSourceActive(manga.source);
                return (
                  <div
                    key={`${manga.id || manga.slug || 'saved'}-${idx}`}
                    onClick={() => {
                      if (!active) {
                        setDisabledSourceAlert(`Nguồn "${manga.source.toUpperCase()}" hiện đang tạm vô hiệu hóa bởi Quản trị viên.`);
                        return;
                      }
                      handleOpenDetail(manga);
                    }}
                    className={`group bg-[#18181b] rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition duration-300 flex flex-col cursor-pointer shadow-lg hover:-translate-y-1 relative ${
                      !active ? 'opacity-50 grayscale-[50%] bg-[#121214] hover:border-red-500/40' : ''
                    }`}
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-gray-900">
                      <img
                        src={manga.coverUrl}
                        alt={manga.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (!target.src.includes('/api/proxy/image') && manga.coverUrl && manga.coverUrl.startsWith('http')) {
                            target.src = `/api/proxy/image?url=${encodeURIComponent(manga.coverUrl)}`;
                          } else {
                            target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                          }
                        }}
                      />
                      {!active && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-2 text-center">
                          <span className="bg-red-600/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md border border-red-400">
                            Tạm vô hiệu hóa
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col justify-between flex-1 space-y-1">
                      <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-2 group-hover:text-purple-400 transition">
                        {manga.title}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-purple-400 font-medium uppercase">{manga.source}</span>
                        {!active && <span className="text-[9px] text-red-400 font-bold">Đã tắt</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : currentView === 'history' ? (
        /* Reading History View */
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center space-x-2">
                <History className="w-7 h-7 text-purple-500" />
                <span>Lịch Sử Đọc Truyện ({historyList.length})</span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">Các chương truyện bạn đã đọc gần đây.</p>
            </div>
            <div className="flex items-center space-x-3">
              {historyList.length > 0 && (
                <button
                  onClick={() => setHistoryList([])}
                  className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-sm font-medium transition"
                >
                  Xóa lịch sử
                </button>
              )}
              <button
                onClick={handleCloseSubView}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition"
              >
                Quay lại thư viện
              </button>
            </div>
          </div>

          {historyList.length === 0 ? (
            <div className="text-center py-28 bg-[#18181b] rounded-3xl border border-white/5 space-y-3">
              <History className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-sm">Chưa có lịch sử đọc truyện nào.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyList.map((item, idx) => {
                const active = isSourceActive(item.source);
                return (
                  <div
                    key={idx}
                    onClick={async () => {
                      if (!active) {
                        setDisabledSourceAlert(`Nguồn "${item.source.toUpperCase()}" hiện đang tạm vô hiệu hóa bởi Quản trị viên.`);
                        return;
                      }
                      setIsLoading(true);
                      const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);
                      setIsLoading(false);
                      const fullManga = detail || {
                        id: item.mangaId,
                        title: item.title,
                        slug: item.mangaId,
                        coverUrl: item.coverUrl,
                        source: item.source,
                        chapters: [{ id: item.chapterId, chapterNumber: '1', title: item.chapterTitle, source: item.source }]
                      };
                      setSelectedManga(fullManga);
                      const foundCh = fullManga.chapters.find((c: MangaChapter) => c.id === item.chapterId) || fullManga.chapters[0];
                      window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: foundCh.id }, '');
                      setActiveReadingSession({ manga: fullManga, chapter: foundCh, pageIndex: item.pageIndex || 0 });
                    }}
                    className={`bg-[#18181b] hover:bg-[#202024] border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition shadow-lg group ${
                      !active ? 'opacity-50 grayscale-[50%] bg-[#121214]' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-xl border border-white/10 flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (!target.src.includes('/api/proxy/image') && item.coverUrl && item.coverUrl.startsWith('http')) {
                            target.src = getProxyImageUrl(item.coverUrl);
                          } else {
                            target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                          }
                        }}
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-purple-400 transition">{item.title}</h3>
                          {!active && (
                            <span className="text-[10px] bg-red-600/30 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-md font-bold">
                              Tạm vô hiệu hóa
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-purple-400 font-medium mt-0.5">{item.chapterTitle} • <span className="uppercase text-[10px] text-gray-400">{item.source}</span></p>
                        <p className="text-[11px] text-gray-500 mt-1 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(item.timestamp).toLocaleString('vi-VN')}</span>
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${
                      active ? 'bg-purple-600/25 text-purple-300 border border-purple-500/30' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}>
                      {active ? 'Đọc tiếp' : 'Đã khóa'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Main Manga Library List View */
        <div className="space-y-8 animate-fade-in">
          {/* Modern Desktop Navigation Tabs (Hidden on Mobile) */}
          <div className="hidden md:flex items-center space-x-8 border-b border-white/5 pb-4">
            <button
              onClick={() => {
                setCurrentView('list');
                setSelectedManga(null);
              }}
              className={`flex items-center space-x-2 pb-4 -mb-[17px] transition-all border-b-2 ${
                currentView === 'list'
                  ? 'border-purple-500 text-purple-400 font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-300 font-medium'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span>Khám Phá</span>
            </button>
            <button
              onClick={handleOpenSaved}
              className="flex items-center space-x-2 pb-4 -mb-[17px] transition-all border-b-2 border-transparent text-gray-500 hover:text-gray-300 font-medium"
            >
              <Bookmark className="w-5 h-5" />
              <span>Tủ Sách ({savedMangaList.length})</span>
            </button>
            <button
              onClick={handleOpenHistory}
              className="flex items-center space-x-2 pb-4 -mb-[17px] transition-all border-b-2 border-transparent text-gray-500 hover:text-gray-300 font-medium"
            >
              <History className="w-5 h-5" />
              <span>Lịch Sử Đọc</span>
            </button>
          </div>

          {/* Top Banner & Header */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              Thế Giới Truyện Tranh
            </h1>
            <p className="text-sm sm:text-base text-gray-400 font-medium">
              Khám phá hàng ngàn tựa manga chất lượng cao, cập nhật liên tục từ các nguồn truyện lớn nhất.
            </p>
          </div>

          {/* Search & Source Filter - Modern Glassmorphism */}
          <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-2 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 backdrop-blur-xl">
            {/* Source Tabs */}
            <div className="flex items-center space-x-1 sm:space-x-2 bg-black/40 p-1.5 rounded-2xl w-full lg:w-auto overflow-x-auto hide-scrollbar">
              {activeSources.map((src) => {
                const isActive = selectedSource === src;
                const labels: Record<MangaSource, string> = {
                  otruyen: 'OTruyen',
                  mangadex: 'MangaDex',
                  cuutruyen: 'Cứu Truyện',
                };
                return (
                  <button
                    key={src}
                    onClick={() => {
                      setSelectedSource(src);
                      setPage(1);
                      setKeyword('');
                    }}
                    className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                      isActive 
                        ? 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/25' 
                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {labels[src] || src}
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 w-full lg:w-[400px]">
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder={`Tìm kiếm truyện...`}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-sm font-bold rounded-2xl transition-all"
              >
                Tìm
              </button>
            </form>
          </div>

          {/* Featured Hero (Only on page 1 without search) */}
          {!isLoading && page === 1 && keyword === '' && mangaList.length > 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Featured */}
              <div 
                onClick={() => handleOpenDetail(mangaList[0])}
                className="lg:col-span-8 group relative rounded-[2rem] overflow-hidden aspect-[21/9] sm:aspect-[2.5/1] cursor-pointer"
              >
                <div className="absolute inset-0 bg-gray-900">
                  <img 
                    src={mangaList[0].coverUrl} 
                    alt={mangaList[0].title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-50 group-hover:opacity-60 group-hover:scale-105 transition duration-700 blur-sm sm:blur-none"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('/api/proxy/image') && mangaList[0]?.coverUrl && mangaList[0].coverUrl.startsWith('http')) {
                        target.src = getProxyImageUrl(mangaList[0].coverUrl);
                      } else {
                        target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop';
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11]/60 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f11] via-[#0f0f11]/40 to-transparent" />
                </div>
                <div className="absolute inset-0 p-6 sm:p-10 flex flex-col justify-end">
                  <div className="inline-flex items-center space-x-2 bg-purple-600/20 border border-purple-500/30 backdrop-blur-md px-3 py-1.5 rounded-lg w-fit mb-4">
                    <Flame className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-purple-300">Nổi Bật Hôm Nay</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-2 max-w-2xl group-hover:text-purple-300 transition-colors">
                    {mangaList[0].title}
                  </h2>
                  <p className="text-sm text-gray-400 mb-6 max-w-xl line-clamp-2">
                    Cập nhật mới nhất. Khám phá những tình tiết hấp dẫn trong chương mới.
                  </p>
                  <button className="bg-white text-black px-6 py-3 rounded-2xl font-bold text-sm w-fit hover:bg-gray-200 transition-colors flex items-center space-x-2">
                    <BookOpen className="w-4 h-4" />
                    <span>Đọc Ngay</span>
                  </button>
                </div>
              </div>
              
              {/* Secondary Featured */}
              <div className="hidden lg:flex lg:col-span-4 flex-col gap-6">
                {[mangaList[1], mangaList[2]].map((manga, idx) => (
                  <div 
                    key={`${manga?.id || manga?.slug || 'feat'}-${idx}`}
                    onClick={() => handleOpenDetail(manga)}
                    className="group relative rounded-3xl overflow-hidden flex-1 cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-gray-900">
                      <img 
                        src={manga.coverUrl} 
                        alt={manga.title} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-70 group-hover:scale-105 transition duration-700"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f11] to-transparent" />
                    </div>
                    <div className="absolute inset-0 p-5 flex flex-col justify-end">
                      <h3 className="text-lg font-bold text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                        {manga.title}
                      </h3>
                      <p className="text-xs text-purple-400 mt-1 font-medium flex items-center space-x-1">
                        <span>Chương mới cập nhật</span>
                        <ArrowRight className="w-3 h-3" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manga Multi-Row Content (Carousels) */}
          <div className="pt-4 space-y-12">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-500">Đang tải dữ liệu...</p>
              </div>
            ) : mangaList.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-[2rem] space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Search className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400 font-medium">Không tìm thấy truyện phù hợp.</p>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-8 -mx-4 sm:-mx-8">
                {keyword === '' && page === 1 && mangaList.length >= 3 && (
                  <div className="px-4 sm:px-8 mb-8">
                    <MangaGenreBanner mangas={mangaList} onOpenDetail={handleOpenDetail} />
                  </div>
                )}

                {/* Search result view -> Use grid if searching */}
                {keyword !== '' || page > 1 ? (
                  <div className="px-4 sm:px-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                        <Star className="w-5 h-5 text-purple-500 fill-purple-500" />
                        <span>Kết Quả Tìm Kiếm</span>
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
                      {mangaList.map((manga, idx) => (
                        <div key={`${manga.id || manga.slug || 'search'}-${idx}`} onClick={() => handleOpenDetail(manga)} className="group relative flex flex-col cursor-pointer">
                          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#18181b] mb-3">
                            <img
                              src={manga.coverUrl}
                              alt={manga.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                              <div className="bg-purple-600 text-white rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 shadow-xl shadow-purple-600/40">
                                <BookOpen className="w-5 h-5" />
                              </div>
                            </div>
                            {manga.status && (
                              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg">
                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{manga.status}</span>
                              </div>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-white line-clamp-2 group-hover:text-purple-400 transition-colors leading-snug">{manga.title}</h3>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Standard Home View with Carousels */
                  <>
                    <MangaTop10Carousel
                      title="Thịnh Hành Trong Tuần"
                      mangas={mangaList.slice(0, 10)}
                      onOpenDetail={handleOpenDetail}
                    />

                    <MangaRow
                      title="Mới Cập Nhật Hôm Nay"
                      mangas={mangaList.slice(3)}
                      onOpenDetail={handleOpenDetail}
                      icon={<Star className="w-6 h-6 fill-purple-500" />}
                    />

                    {mangaList.length > 10 && (
                      <MangaRow
                        title="Hành Động & Phiêu Lưu"
                        mangas={[...mangaList].reverse().slice(0, 15)}
                        onOpenDetail={handleOpenDetail}
                        icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
                      />
                    )}

                    {mangaList.length > 15 && (
                      <MangaRow
                        title="Dành Cho Bạn (Lãng Mạn / Slice of Life)"
                        mangas={mangaList.slice(7, 24)}
                        onOpenDetail={handleOpenDetail}
                        icon={<Heart className="w-6 h-6 fill-purple-400 text-purple-400" />}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Pagination (Only show if Searching or Paginated List) */}
          {!isLoading && (keyword !== '' || page > 1) && totalPages > 1 && (
            <div className="flex items-center justify-center space-x-3 pt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className={`p-2.5 rounded-xl border transition ${
                  page === 1 ? 'border-white/5 text-gray-600 cursor-not-allowed' : 'border-white/10 text-white hover:bg-white/10'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold text-gray-300">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className={`p-2.5 rounded-xl border transition ${
                  page === totalPages ? 'border-white/5 text-gray-600 cursor-not-allowed' : 'border-white/10 text-white hover:bg-white/10'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Bottom Dock Navigation for Manga */}
      {!activeReadingSession && currentView !== 'detail' && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b0c16]/95 backdrop-blur-md border-t border-purple-900/40 pb-safe">
          <div className="flex items-center justify-around p-2">
            <button
              onClick={() => {
                if (currentView !== 'list') {
                  setCurrentView('list');
                  setSelectedManga(null);
                }
              }}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${
                currentView === 'list' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <BookOpen className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Khám Phá</span>
            </button>
            <button
              onClick={handleOpenSaved}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${
                currentView === 'saved' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Bookmark className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Tủ Sách</span>
            </button>
            <button
              onClick={handleOpenHistory}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${
                currentView === 'history' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <History className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Lịch Sử</span>
            </button>
          </div>
        </div>
      )}

      {/* Animated Disabled Source Alert Modal */}
      {disabledSourceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#18181b] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-scale-in relative text-center">
            <button
              onClick={() => setDisabledSourceAlert(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Nguồn Tạm Khóa</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{disabledSourceAlert}</p>
            </div>
            <p className="text-xs text-gray-500">Bạn vui lòng chờ Quản trị viên kích hoạt lại nguồn này trong Cài đặt API.</p>
            <button
              onClick={() => setDisabledSourceAlert(null)}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition shadow-lg shadow-amber-600/30"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
