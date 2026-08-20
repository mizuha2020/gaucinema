import React, { useState, useEffect } from 'react';
import { MangaItem, MangaSource, mangaApi, MangaChapter, MangaHistoryItem } from '../../services/mangaApi';
import { firestoreStorage } from '../../services/firestoreStorage';
import { MangaDetailView } from './MangaDetailView';
import { MangaReaderModal } from './MangaReaderModal';
import { UserProfile, Account } from '../../types';
import { Search, BookOpen, Bookmark, History, Flame, ArrowRight, ChevronLeft, ChevronRight, Clock, Star, Play } from 'lucide-react';

interface MangaViewProps {
  activeProfile?: UserProfile | null;
  currentAccount?: Account | null;
}

export const MangaView: React.FC<MangaViewProps> = ({ activeProfile, currentAccount }) => {
  const accountId = currentAccount?.id || '';
  const profileId = activeProfile?.id || '';

  const [selectedSource, setSelectedSource] = useState<MangaSource>('otruyen');
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Sub-navigation view: 'list' | 'detail' | 'saved' | 'history'
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'saved' | 'history'>('list');
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [activeReadingSession, setActiveReadingSession] = useState<{ manga: MangaItem; chapter: MangaChapter; pageIndex?: number } | null>(null);

  // Saved / Bookmarked Manga per user (Firestore)
  const [savedMangaList, setSavedMangaList] = useState<MangaItem[]>([]);
  // Reading history per user (Firestore)
  const [historyList, setHistoryList] = useState<MangaHistoryItem[]>([]);

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
    const detail = await mangaApi.getMangaDetail(selectedSource, item.id);
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
                <Bookmark className="w-7 h-7 text-blue-500 fill-blue-500" />
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
              {savedMangaList.map((manga) => (
                <div
                  key={manga.id}
                  onClick={() => handleOpenDetail(manga)}
                  className="group bg-[#18181b] rounded-2xl overflow-hidden border border-white/10 hover:border-blue-500/50 transition duration-300 flex flex-col cursor-pointer shadow-lg hover:-translate-y-1"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-gray-900">
                    <img
                      src={manga.coverUrl}
                      alt={manga.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                      }}
                    />
                  </div>
                  <div className="p-3 flex flex-col justify-between flex-1 space-y-1">
                    <h3 className="font-semibold text-xs sm:text-sm text-white line-clamp-2 group-hover:text-blue-400 transition">
                      {manga.title}
                    </h3>
                    <span className="text-[10px] text-blue-400 font-medium uppercase">{manga.source}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : currentView === 'history' ? (
        /* Reading History View */
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center space-x-2">
                <History className="w-7 h-7 text-blue-500" />
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
              {historyList.map((item, idx) => (
                <div
                  key={idx}
                  onClick={async () => {
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
                  className="bg-[#18181b] hover:bg-[#202024] border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition shadow-lg group"
                >
                  <div className="flex items-center space-x-4">
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-12 h-16 object-cover rounded-xl border border-white/10 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                      }}
                    />
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-blue-400 transition">{item.title}</h3>
                      <p className="text-xs text-blue-400 font-medium mt-0.5">{item.chapterTitle}</p>
                      <p className="text-[11px] text-gray-500 mt-1 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(item.timestamp).toLocaleString('vi-VN')}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    Đọc tiếp
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Main Manga Library List View */
        <div className="space-y-8 animate-fade-in">
          {/* Top Banner & Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center space-x-2">
                <BookOpen className="w-8 h-8 text-blue-500" />
                <span>Thư Viện Manga Đa Nguồn</span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">Đọc truyện tranh chất lượng cao từ OTruyen, MangaDex và CuuTruyen.</p>
            </div>

            {/* Quick Navigation Tabs: Saved & History */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleOpenSaved}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#18181b] hover:bg-[#222226] border border-white/10 text-xs sm:text-sm font-semibold transition shadow"
              >
                <Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />
                <span>Truyện đã lưu ({savedMangaList.length})</span>
              </button>
              <button
                onClick={handleOpenHistory}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#18181b] hover:bg-[#222226] border border-white/10 text-xs sm:text-sm font-semibold transition shadow"
              >
                <History className="w-4 h-4 text-blue-500" />
                <span>Lịch sử đọc ({historyList.length})</span>
              </button>
            </div>
          </div>

          {/* Continue Reading Section on Main Page */}
          {historyList.length > 0 && (
            <div className="bg-[#18181b] border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <h2 className="text-base sm:text-lg font-bold text-white">Đang đọc gần đây (Tiếp tục đọc)</h2>
                </div>
                <button
                  onClick={handleOpenHistory}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center space-x-1"
                >
                  <span>Xem tất cả ({historyList.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {historyList.slice(0, 3).map((item, idx) => (
                  <div
                    key={idx}
                    onClick={async () => {
                      setIsLoading(true);
                      const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);
                      setIsLoading(false);
                      const fullManga = detail || {
                        id: item.mangaId,
                        title: item.title,
                        slug: item.mangaId,
                        coverUrl: item.coverUrl,
                        source: item.source,
                        chapters: [{ id: item.chapterId, chapterNumber: item.chapterNumber || '1', title: item.chapterTitle, source: item.source }]
                      };
                      setSelectedManga(fullManga);
                      const foundCh = fullManga.chapters.find((c: MangaChapter) => c.id === item.chapterId) || fullManga.chapters[0];
                      setActiveReadingSession({ manga: fullManga, chapter: foundCh, pageIndex: item.pageIndex || 0 });
                    }}
                    className="bg-black/30 hover:bg-black/50 border border-white/10 rounded-2xl p-3 flex items-center space-x-4 cursor-pointer transition group"
                  >
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-14 h-20 object-cover rounded-xl border border-white/10 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                      }}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="font-bold text-sm text-white truncate group-hover:text-blue-400 transition">{item.title}</h3>
                      <p className="text-xs text-blue-400 font-medium truncate">{item.chapterTitle || 'Chương mới nhất'}</p>
                      <div className="pt-1">
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-semibold">
                          <Play className="w-3 h-3 fill-blue-400" />
                          <span>Đọc tiếp</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source Tabs & Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Source Tabs */}
            <div className="flex items-center space-x-2 bg-[#18181b] p-1.5 rounded-2xl border border-white/10 self-start">
              {(['otruyen', 'mangadex', 'cuutruyen'] as MangaSource[]).map((src) => {
                const isActive = selectedSource === src;
                const labels: Record<MangaSource, string> = {
                  otruyen: 'OTruyen',
                  mangadex: 'MangaDex',
                  cuutruyen: 'CuuTruyen',
                };
                return (
                  <button
                    key={src}
                    onClick={() => {
                      setSelectedSource(src);
                      setPage(1);
                      setKeyword('');
                    }}
                    className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
                      isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {labels[src]}
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex items-center space-x-3 w-full lg:w-96">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Tìm kiếm trên ${selectedSource.toUpperCase()}...`}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition shadow-inner"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-2xl transition shadow-lg shadow-blue-600/30 flex-shrink-0"
              >
                Tìm
              </button>
            </form>
          </div>

          {/* Manga Grid Content */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Đang tải danh sách truyện từ {selectedSource.toUpperCase()}...</p>
            </div>
          ) : mangaList.length === 0 ? (
            <div className="text-center py-32 bg-[#18181b] rounded-3xl border border-white/5 space-y-3">
              <BookOpen className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-sm">Không tìm thấy truyện phù hợp.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {mangaList.map((manga) => (
                <div
                  key={manga.id}
                  onClick={() => handleOpenDetail(manga)}
                  className="group bg-[#18181b] rounded-2xl overflow-hidden border border-white/10 hover:border-blue-500/50 transition duration-300 flex flex-col cursor-pointer shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-gray-900">
                    <img
                      src={manga.coverUrl}
                      alt={manga.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 flex items-end p-3">
                      <span className="text-xs font-semibold text-white bg-blue-600 px-3 py-2 rounded-xl w-full text-center shadow">
                        Xem chi tiết
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 flex flex-col justify-between flex-1 space-y-1">
                    <h3 className="font-bold text-xs sm:text-sm text-white line-clamp-2 group-hover:text-blue-400 transition">
                      {manga.title}
                    </h3>
                    {manga.status && (
                      <p className="text-[10px] text-gray-400 line-clamp-1">{manga.status}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
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
    </div>
  );
};
