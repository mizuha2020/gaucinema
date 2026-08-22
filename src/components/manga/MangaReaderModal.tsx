import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MangaChapter, MangaItem, getProxyImageUrl } from '../../services/mangaApi';
import { mangaApi } from '../../services/mangaApi';
import { systemApiService } from '../../services/systemApiService';
import { presenceService } from '../../services/presenceService';
import {
  X,
  ChevronLeft,
  ChevronRight,
  List,
  ArrowLeft,
  BookOpen,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Keyboard,
  Eye,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  MangaReaderSettings,
  DEFAULT_READER_SETTINGS,
  MangaReaderSettingsModal,
  KeyboardShortcutsModal,
} from './MangaReaderSettingsModal';

interface MangaReaderModalProps {
  manga: MangaItem;
  initialChapter: MangaChapter;
  initialPageIndex?: number;
  onClose: () => void;
  onSelectChapter: (chapter: MangaChapter) => void;
  onChapterRead?: (chapter: MangaChapter, pageIndex: number) => void;
}

export const MangaReaderModal: React.FC<MangaReaderModalProps> = ({
  manga,
  initialChapter,
  initialPageIndex = 0,
  onClose,
  onSelectChapter,
  onChapterRead,
}) => {
  const [currentChapter, setCurrentChapter] = useState<MangaChapter>(initialChapter);
  const [pages, setPages] = useState<string[]>([]);
  const [loadedPages, setLoadedPages] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [readingMode, setReadingMode] = useState<'webtoon' | 'single'>('webtoon');
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(initialPageIndex);
  const [showChapterDrawer, setShowChapterDrawer] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [restoredToastMsg, setRestoredToastMsg] = useState<string | null>(null);
  const [sourceWarning, setSourceWarning] = useState<string | null>(null);

  // Monitor if active source gets disabled by admin while reading
  useEffect(() => {
    const checkSourceHealth = () => {
      const endpoints = systemApiService.getActiveEndpointsForCategory('manga');
      const currentSrcId = currentChapter.source || 'otruyen';
      const found = endpoints.find((e) => e.id === currentSrcId);
      if (!found || !found.enabled) {
        setSourceWarning(`⚠️ Nguồn "${currentSrcId.toUpperCase()}" đang dùng vừa bị Quản trị viên vô hiệu hóa.`);
      } else {
        setSourceWarning(null);
      }
    };

    checkSourceHealth();
    const unsubscribe = systemApiService.subscribe(() => {
      checkSourceHealth();
    });
    return () => unsubscribe();
  }, [currentChapter.source]);

  // Settings with persistent localStorage
  const [readerSettings, setReaderSettings] = useState<MangaReaderSettings>(() => {
    try {
      const saved = localStorage.getItem('manga_reader_preferences');
      if (saved) return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_READER_SETTINGS;
  });

  const handleUpdateSettings = (newSettings: MangaReaderSettings) => {
    setReaderSettings(newSettings);
    try {
      localStorage.setItem('manga_reader_preferences', JSON.stringify(newSettings));
    } catch (e) {}
  };

  // Zoom & Pan state
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const controlsTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const preloadedChapterRef = useRef<Record<string, boolean>>({});

  // Touch gesture tracking refs
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isTouchMoved = useRef<boolean>(false);
  const isPinch = useRef<boolean>(false);
  const isTouchInteraction = useRef<boolean>(false);
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const lastTapTime = useRef<number>(0);

  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!showChapterDrawer && !showSettingsModal && !showShortcutsModal) {
        setShowControls(false);
      }
    }, 4500);
  };

  // Zoom helpers
  const handleZoomIn = () => {
    setScale((prev) => Math.min(3, +(prev + 0.25).toFixed(2)));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(0.8, +(prev - 0.25).toFixed(2));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const currentIndex = manga.chapters.findIndex((c) => c.id === currentChapter.id);
  const prevChapter = currentIndex > 0 ? manga.chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < manga.chapters.length - 1 ? manga.chapters[currentIndex + 1] : null;

  const handleNextChapter = () => {
    if (nextChapter) {
      setCurrentChapter(nextChapter);
      onSelectChapter(nextChapter);
    }
  };

  const handlePrevChapter = () => {
    if (prevChapter) {
      setCurrentChapter(prevChapter);
      onSelectChapter(prevChapter);
    }
  };

  // Single page navigation
  const handlePrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else if (prevChapter) {
      handlePrevChapter();
    }
  }, [currentPageIndex, prevChapter]);

  const handleNextPage = useCallback(() => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else if (nextChapter) {
      handleNextChapter();
    }
  }, [currentPageIndex, pages.length, nextChapter]);

  // Jump to specific page (Scrubber / Slider)
  const handleScrubberChange = (targetPage1Based: number) => {
    const targetIdx = Math.max(0, Math.min(pages.length - 1, targetPage1Based - 1));
    setCurrentPageIndex(targetIdx);
    if (readingMode === 'webtoon' && pageRefs.current[targetIdx]) {
      pageRefs.current[targetIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Fetch chapter pages & restore exact scroll / page position
  useEffect(() => {
    let isMounted = true;
    const fetchPages = async () => {
      setIsLoading(true);
      setLoadedPages({});
      handleResetZoom();
      pageRefs.current = [];

      try {
        const useDataSaver = readerSettings.imageQuality === 'data-saver';
        const imgUrls = await mangaApi.getChapterPages(currentChapter, { dataSaver: useDataSaver });
        if (isMounted) {
          setPages(imgUrls);

          // Check for saved scroll position
          const scrollKey = `manga_reader_scroll_${manga.id}_${currentChapter.id}`;
          let targetPage = currentChapter.id === initialChapter.id ? initialPageIndex : 0;
          let savedScrollTop = 0;

          try {
            const savedPos = localStorage.getItem(scrollKey);
            if (savedPos) {
              const parsed = JSON.parse(savedPos);
              if (typeof parsed.pageIndex === 'number' && parsed.pageIndex >= 0 && parsed.pageIndex < imgUrls.length) {
                targetPage = parsed.pageIndex;
              }
              if (typeof parsed.scrollTop === 'number') {
                savedScrollTop = parsed.scrollTop;
              }
            }
          } catch (e) {}

          setCurrentPageIndex(targetPage);
          resetControlsTimer();

          if (onChapterRead) {
            onChapterRead(currentChapter, targetPage);
          }

          // Restore scroll position for webtoon mode after render
          if (targetPage > 0 || savedScrollTop > 0) {
            setTimeout(() => {
              if (scrollContainerRef.current) {
                if (savedScrollTop > 50) {
                  scrollContainerRef.current.scrollTop = savedScrollTop;
                } else if (pageRefs.current[targetPage]) {
                  pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setRestoredToastMsg(`Đã khôi phục vị trí đọc: Trang ${targetPage + 1}`);
                setTimeout(() => setRestoredToastMsg(null), 3200);
              }
            }, 350);
          }
        }
      } catch (err) {
        console.error('Error fetching chapter pages:', err);
        if (isMounted) {
          setPages([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchPages();
    return () => {
      isMounted = false;
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [currentChapter, readerSettings.imageQuality]);

  // Presence heartbeat for real-time admin monitoring
  useEffect(() => {
    presenceService.startHeartbeat({
      accountId: 'user',
      accountDisplayName: 'Độc Giả Manga',
      profileId: 'manga_profile',
      profileName: 'Độc Giả',
      type: 'reading_manga',
      itemTitle: manga.title || 'Truyện tranh',
      itemSubtitle: currentChapter.title ? `Chương ${currentChapter.chapterNumber}: ${currentChapter.title}` : `Chương ${currentChapter.chapterNumber}`,
      itemCover: manga.coverUrl,
      apiSourceUsed: currentChapter.source || 'otruyen',
      currentTime: currentPageIndex + 1,
      duration: pages.length || 1,
      progressPercent: Math.round(((currentPageIndex + 1) / (pages.length || 1)) * 100),
    });

    return () => {
      presenceService.stopHeartbeat();
    };
  }, [manga.title, currentChapter.chapterNumber, currentChapter.title, currentChapter.source]);

  // Reset zoom on page change in single mode & record read
  useEffect(() => {
    handleResetZoom();
    if (!isLoading && onChapterRead) {
      onChapterRead(currentChapter, currentPageIndex);
      presenceService.updateProgress(currentPageIndex + 1, pages.length || 1);
      // Persist current page index
      try {
        const scrollKey = `manga_reader_scroll_${manga.id}_${currentChapter.id}`;
        localStorage.setItem(
          scrollKey,
          JSON.stringify({
            pageIndex: currentPageIndex,
            scrollTop: scrollContainerRef.current?.scrollTop || 0,
            timestamp: Date.now(),
          })
        );
      } catch (e) {}
    }
  }, [currentPageIndex, isLoading]);

  const targetPageRef = useRef<number>(0);
  const isSwitchingModeRef = useRef<boolean>(false);
  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll smoothly/instantly to a specific page element in Webtoon mode
  const scrollToWebtoonPage = useCallback((pageIdx: number, smooth = false) => {
    const container = scrollContainerRef.current;
    const el = pageRefs.current[pageIdx];
    if (container && el) {
      const offset = el.offsetTop - container.offsetTop;
      container.scrollTo({
        top: Math.max(0, offset),
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Highly accurate focal page detector in Webtoon Mode
  const getActiveWebtoonPage = useCallback((): number => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0 || pageRefs.current.length === 0) {
      return currentPageIndex;
    }
    const containerRect = container.getBoundingClientRect();
    const focalY = containerRect.top + containerRect.height * 0.4;

    let bestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= focalY && rect.bottom >= focalY) {
        return i;
      }
      const pageCenter = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(pageCenter - focalY);
      if (dist < minDistance) {
        minDistance = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [pages.length, currentPageIndex]);

  // Mode Toggle handler preserving exact current page index
  const handleToggleReadingMode = () => {
    handleResetZoom();

    if (readingMode === 'webtoon') {
      // Switching from Webtoon -> Single: accurately capture current visible page
      const currentActive = getActiveWebtoonPage();
      setCurrentPageIndex(currentActive);
      setReadingMode('single');
    } else {
      // Switching from Single -> Webtoon: anchor to current single page
      const targetPage = currentPageIndex;
      targetPageRef.current = targetPage;
      isSwitchingModeRef.current = true;
      setReadingMode('webtoon');

      if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);

      // Perform fast sequential alignment checks across animation frames
      const tryScroll = (attempts = 0) => {
        const el = pageRefs.current[targetPage];
        if (el && scrollContainerRef.current) {
          scrollToWebtoonPage(targetPage, false);
          if (attempts < 4) {
            requestAnimationFrame(() => tryScroll(attempts + 1));
          } else {
            // Keep anchor lock active for 1s to absorb image decode shifts
            switchTimeoutRef.current = setTimeout(() => {
              isSwitchingModeRef.current = false;
            }, 1000);
          }
        } else if (attempts < 15) {
          setTimeout(() => tryScroll(attempts + 1), 30);
        } else {
          isSwitchingModeRef.current = false;
        }
      };

      requestAnimationFrame(() => tryScroll(0));
    }
  };

  // Re-anchor webtoon scroll if previous image expands during transition
  const handleWebtoonImageLoad = (idx: number) => {
    setLoadedPages((prev) => ({ ...prev, [idx]: true }));
    if (isSwitchingModeRef.current && idx <= targetPageRef.current) {
      scrollToWebtoonPage(targetPageRef.current, false);
    }
  };

  // Webtoon Scroll Listener: Track current page & Debounced save scroll position
  const handleWebtoonScroll = () => {
    if (isSwitchingModeRef.current) return;
    if (!scrollContainerRef.current || pages.length === 0 || readingMode !== 'webtoon') return;
    const container = scrollContainerRef.current;
    const containerTop = container.scrollTop;

    const activeIdx = getActiveWebtoonPage();

    if (activeIdx !== currentPageIndex && activeIdx >= 0 && activeIdx < pages.length) {
      setCurrentPageIndex(activeIdx);
    }

    // Debounce save scroll position
    if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current);
    scrollSaveTimeout.current = setTimeout(() => {
      try {
        const scrollKey = `manga_reader_scroll_${manga.id}_${currentChapter.id}`;
        localStorage.setItem(
          scrollKey,
          JSON.stringify({
            pageIndex: activeIdx,
            scrollTop: containerTop,
            timestamp: Date.now(),
          })
        );
      } catch (e) {}
    }, 400);
  };

  // Smart Preloader: Preload next pages and next chapter in advance
  useEffect(() => {
    if (pages.length === 0) return;

    // 1. Preload next 5 pages in current chapter
    for (let i = 1; i <= 5; i++) {
      const nextIdx = currentPageIndex + i;
      if (nextIdx < pages.length && pages[nextIdx]) {
        const img = new Image();
        img.src = pages[nextIdx];
      }
    }

    // 2. If near end of chapter (or >= 65% of chapter), preload next chapter's first pages
    if (nextChapter && (currentPageIndex >= pages.length - 4 || pages.length <= 4)) {
      if (!preloadedChapterRef.current[nextChapter.id]) {
        preloadedChapterRef.current[nextChapter.id] = true;
        mangaApi
          .getChapterPages(nextChapter)
          .then((nextUrls) => {
            if (nextUrls && nextUrls.length > 0) {
              nextUrls.slice(0, 4).forEach((url) => {
                const img = new Image();
                img.src = url;
              });
            }
          })
          .catch(() => {});
      }
    }
  }, [currentPageIndex, pages, nextChapter]);

  // Keyboard Shortcuts (PC / Laptop navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (showShortcutsModal) setShowShortcutsModal(false);
        else if (showSettingsModal) setShowSettingsModal(false);
        else if (showChapterDrawer) setShowChapterDrawer(false);
        else onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (readerSettings.readingDirection === 'rtl' && readingMode === 'single') {
          handlePrevPage();
        } else {
          handleNextPage();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (readerSettings.readingDirection === 'rtl' && readingMode === 'single') {
          handleNextPage();
        } else {
          handlePrevPage();
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') {
        if (readingMode === 'webtoon' && scrollContainerRef.current) {
          e.preventDefault();
          scrollContainerRef.current.scrollBy({ top: 380, behavior: 'smooth' });
        } else if (readingMode === 'single') {
          e.preventDefault();
          handleNextPage();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (readingMode === 'webtoon' && scrollContainerRef.current) {
          e.preventDefault();
          scrollContainerRef.current.scrollBy({ top: -380, behavior: 'smooth' });
        } else if (readingMode === 'single') {
          e.preventDefault();
          handlePrevPage();
        }
      } else if (e.key === 'PageDown') {
        if (scrollContainerRef.current) {
          e.preventDefault();
          scrollContainerRef.current.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
        }
      } else if (e.key === 'PageUp') {
        if (scrollContainerRef.current) {
          e.preventDefault();
          scrollContainerRef.current.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleReadingMode();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'l' || e.key === 'L') {
        setShowChapterDrawer((prev) => !prev);
      } else if (e.key === '+' || e.key === '=' || e.key === 'z' || e.key === 'Z') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_' || e.key === 'x' || e.key === 'X') {
        handleZoomOut();
      } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
        handleResetZoom();
      } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        setShowShortcutsModal((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    readingMode,
    readerSettings.readingDirection,
    handleNextPage,
    handlePrevPage,
    showShortcutsModal,
    showSettingsModal,
    showChapterDrawer,
    onClose,
  ]);

  // Touch gesture handlers (Pinch to Zoom, Pan when zoomed, Swipe to change page, Tap to toggle controls)
  const handleTouchStart = (e: React.TouchEvent) => {
    isTouchInteraction.current = true;
    isTouchMoved.current = false;
    touchStartTime.current = Date.now();

    if (e.touches.length === 2) {
      // 2-finger Pinch start
      isPinch.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDist.current = dist;
      initialScale.current = scale;
    } else if (e.touches.length === 1) {
      // 1-finger touch
      isPinch.current = false;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;
      lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist.current !== null) {
      isTouchMoved.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / initialPinchDist.current;
      const newScale = Math.min(3, Math.max(0.7, +(initialScale.current * ratio).toFixed(2)));
      setScale(newScale);
    } else if (e.touches.length === 1) {
      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;

      const moveDistance = Math.hypot(
        e.touches[0].clientX - touchStartX.current,
        e.touches[0].clientY - touchStartY.current
      );

      if (moveDistance > 8) {
        isTouchMoved.current = true;
      }

      if (scale > 1 && lastPanPoint.current) {
        const deltaX = e.touches[0].clientX - lastPanPoint.current.x;
        const deltaY = e.touches[0].clientY - lastPanPoint.current.y;
        setPan((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
        lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  };

  const handleTouchEnd = () => {
    const touchDuration = Date.now() - touchStartTime.current;
    const wasPinch = isPinch.current;
    const moved = isTouchMoved.current;

    initialPinchDist.current = null;
    lastPanPoint.current = null;
    isPinch.current = false;
    isTouchMoved.current = false;

    setTimeout(() => {
      isTouchInteraction.current = false;
    }, 350);

    if (wasPinch) return;

    if (moved) {
      if (scale <= 1) {
        setPan({ x: 0, y: 0 });
        if (readingMode === 'single') {
          const diffX = touchStartX.current - touchEndX.current;
          const diffY = touchStartY.current - touchEndY.current;
          if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
            if (diffX > 0) {
              readerSettings.readingDirection === 'rtl' ? handlePrevPage() : handleNextPage();
            } else {
              readerSettings.readingDirection === 'rtl' ? handleNextPage() : handlePrevPage();
            }
          }
        }
      }
      return;
    }

    // Stationary TAP
    if (touchDuration < 350) {
      const now = Date.now();
      if (now - lastTapTime.current < 280) {
        if (scale > 1) {
          handleResetZoom();
        } else {
          setScale(2);
        }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now;

      if (!showChapterDrawer && !showSettingsModal && !showShortcutsModal) {
        setShowControls((prev) => !prev);
      }
    }
  };

  const handleContainerClick = () => {
    if (isTouchInteraction.current) return;
    if (!showChapterDrawer && !showSettingsModal && !showShortcutsModal) {
      setShowControls((prev) => !prev);
    }
  };

  // Color Filter CSS style calculation
  const getImageFilterStyle = () => {
    const filters: string[] = [];
    if (readerSettings.brightness !== 100) {
      filters.push(`brightness(${readerSettings.brightness / 100})`);
    }
    if (readerSettings.colorFilter === 'sepia') {
      filters.push('sepia(0.4) contrast(0.95)');
    } else if (readerSettings.colorFilter === 'dark-invert') {
      filters.push('invert(0.92) hue-rotate(180deg)');
    } else if (readerSettings.colorFilter === 'high-contrast') {
      filters.push('contrast(1.3) brightness(1.05)');
    }
    return filters.length > 0 ? filters.join(' ') : undefined;
  };

  const getBackgroundColorClass = () => {
    switch (readerSettings.backgroundColor) {
      case 'dark-gray':
        return 'bg-[#18181b]';
      case 'navy':
        return 'bg-[#0f172a]';
      case 'warm-paper':
        return 'bg-[#1c1917]';
      case 'black':
      default:
        return 'bg-[#09090b]';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 ${getBackgroundColorClass()} text-white flex flex-col select-none overflow-hidden transition-colors duration-300`}
      onClick={handleContainerClick}
    >
      {/* Restored Toast notification */}
      {restoredToastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600/90 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl border border-blue-400/40 flex items-center space-x-2 animate-fade-in pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-blue-200" />
          <span>{restoredToastMsg}</span>
        </div>
      )}

      {/* Source Disabled Warning Banner */}
      {sourceWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-amber-600/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl border border-amber-400/50 flex items-center space-x-2 animate-fade-in pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping"></span>
          <span>{sourceWarning}</span>
        </div>
      )}

      {/* Top Header Overlay with safe area padding */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/95 via-black/80 to-transparent px-3 sm:px-6 pt-[calc(env(safe-area-inset-top)+14px)] pb-4 flex items-center justify-between transition-transform duration-300 ${
          showControls ? 'translate-y-0' : '-translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 max-w-[40%] sm:max-w-none">
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition flex-shrink-0"
            title="Quay lại (Esc)"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-base truncate">{manga.title}</h1>
            <p className="text-[11px] sm:text-xs text-gray-300 truncate">{currentChapter.title}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
          {/* Zoom controls in header (Desktop) */}
          <div className="hidden lg:flex items-center bg-white/10 rounded-xl p-0.5 border border-white/10">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition"
              title="Thu nhỏ (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-white/10 rounded-lg transition"
              title="Đặt lại kích thước (0)"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition"
              title="Phóng to (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Reading Mode Direct Toggle Button */}
          <button
            onClick={handleToggleReadingMode}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition border ${
              readingMode === 'webtoon'
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
                : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
            }`}
            title="Đổi chế độ đọc (Phím M)"
          >
            {readingMode === 'webtoon' ? (
              <>
                <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
                <span className="hidden xs:inline sm:inline">Cuộn dọc</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                <span className="hidden xs:inline sm:inline">Từng trang</span>
              </>
            )}
          </button>

          {/* Settings & Display Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-semibold transition flex items-center space-x-1.5 ${
              readerSettings.colorFilter !== 'normal' || readerSettings.brightness !== 100 || readerSettings.imageQuality === 'data-saver'
                ? 'bg-amber-600/25 border-amber-500/40 text-amber-300 hover:bg-amber-600/35'
                : 'bg-white/10 border-white/10 hover:bg-white/20 text-gray-200'
            }`}
            title="Cài đặt đọc truyện & Hiển thị"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span className="inline">Cài đặt</span>
          </button>

          {/* Fullscreen Button (Desktop & supported mobile) */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 transition"
            title={isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Chapter Drawer Button */}
          <button
            onClick={() => setShowChapterDrawer(true)}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition"
            title="Danh sách chương (Phím C hoặc L)"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Chương</span>
          </button>

          {/* Close Reader Button */}
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            title="Đóng trình đọc (Esc)"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Main Reader View */}
      <div
        ref={scrollContainerRef}
        onScroll={readingMode === 'webtoon' ? handleWebtoonScroll : undefined}
        className={`flex-1 relative pt-[calc(env(safe-area-inset-top)+72px)] pb-44 px-2 sm:px-4 ${
          readingMode === 'single'
            ? 'overflow-hidden flex items-center justify-center'
            : 'overflow-y-auto overflow-x-hidden block'
        }`}
        onTouchStart={(e) => {
          isSwitchingModeRef.current = false;
          handleTouchStart(e);
        }}
        onWheel={() => {
          isSwitchingModeRef.current = false;
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 font-medium">Đang tải trang truyện...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="text-center p-6 text-gray-400 min-h-[60vh] flex flex-col items-center justify-center">
            <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Không thể tải trang truyện hoặc chương này trống.</p>
          </div>
        ) : readingMode === 'webtoon' ? (
          /* Webtoon vertical scroll mode */
          <div
            className="flex flex-col items-center w-full max-w-3xl mx-auto space-y-3 transition-transform duration-100 ease-out origin-top"
            style={{
              transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
            }}
          >
            {pages.map((pageUrl, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="relative w-full flex flex-col items-center"
              >
                <MangaReaderPageItem
                  pageUrl={pageUrl}
                  idx={idx}
                  totalPages={pages.length}
                  filterStyle={getImageFilterStyle()}
                  onLoaded={() => handleWebtoonImageLoad(idx)}
                  mode="webtoon"
                />
              </div>
            ))}

            {/* End of Chapter Action */}
            <div className="w-full py-12 flex flex-col items-center space-y-4 bg-black/40 rounded-2xl mt-8">
              <p className="text-gray-300 text-sm font-medium">Đã đọc xong {currentChapter.title}</p>
              {nextChapter ? (
                <button
                  onClick={handleNextChapter}
                  className="px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition flex items-center space-x-2 shadow-lg shadow-blue-600/30 active:scale-95"
                >
                  <span>Chương tiếp theo ({nextChapter.chapterNumber})</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <p className="text-gray-500 text-xs">Bạn đã đọc đến chương mới nhất của truyện này!</p>
              )}
            </div>
          </div>
        ) : (
          /* Single Page Mode */
          <div className="relative w-full h-full min-h-[60vh] flex items-center justify-center py-2">
            {pages[currentPageIndex] && (
              <div
                className="relative max-h-full max-w-full flex items-center justify-center transition-transform duration-100 ease-out"
                style={{
                  transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
                }}
              >
                <MangaReaderPageItem
                  pageUrl={pages[currentPageIndex]}
                  idx={currentPageIndex}
                  totalPages={pages.length}
                  filterStyle={getImageFilterStyle()}
                  onLoaded={() => setLoadedPages((prev) => ({ ...prev, [currentPageIndex]: true }))}
                  mode="single"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Left & Right Page Navigation Buttons (Single Page Mode) */}
      {readingMode === 'single' && !isLoading && pages.length > 0 && (
        <div
          className={`transition-all duration-300 ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              readerSettings.readingDirection === 'rtl' ? handleNextPage() : handlePrevPage();
            }}
            disabled={currentPageIndex === 0 && !prevChapter}
            className={`fixed left-2 sm:left-6 top-1/2 -translate-y-1/2 z-40 p-2.5 sm:p-4 rounded-full backdrop-blur-md transition shadow-2xl flex items-center justify-center ${
              currentPageIndex === 0 && !prevChapter
                ? 'opacity-20 bg-black/40 text-gray-600 cursor-not-allowed'
                : 'bg-black/80 hover:bg-blue-600 border border-white/20 text-white hover:scale-110 active:scale-95'
            }`}
            title="Trang trước (← / A)"
          >
            <ChevronLeft className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              readerSettings.readingDirection === 'rtl' ? handlePrevPage() : handleNextPage();
            }}
            disabled={currentPageIndex === pages.length - 1 && !nextChapter}
            className={`fixed right-2 sm:right-6 top-1/2 -translate-y-1/2 z-40 p-2.5 sm:p-4 rounded-full backdrop-blur-md transition shadow-2xl flex items-center justify-center ${
              currentPageIndex === pages.length - 1 && !nextChapter
                ? 'opacity-20 bg-black/40 text-gray-600 cursor-not-allowed'
                : 'bg-black/80 hover:bg-blue-600 border border-white/20 text-white hover:scale-110 active:scale-95'
            }`}
            title="Trang tiếp theo (→ / D)"
          >
            <ChevronRight className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>
        </div>
      )}

      {/* Floating Center Zoom Widget (Centered horizontally above Scrubber) */}
      <div
        className={`fixed bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-30 bg-[#141418]/90 backdrop-blur-md border border-white/20 rounded-full px-2.5 py-1.5 flex items-center space-x-1.5 shadow-2xl transition-all duration-300 ${
          showControls || scale !== 1
            ? 'opacity-100 pointer-events-auto scale-100'
            : 'opacity-0 pointer-events-none scale-90'
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-white/20 active:bg-blue-600 rounded-full text-white transition"
          title="Thu nhỏ (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className={`px-2.5 py-0.5 text-xs font-bold rounded-full transition ${
            scale !== 1 ? 'bg-blue-600 text-white shadow-md' : 'text-gray-300 hover:text-white'
          }`}
          title="Đặt lại 100% (0)"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-white/20 active:bg-blue-600 rounded-full text-white transition"
          title="Phóng to (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        {scale !== 1 && (
          <button
            onClick={handleResetZoom}
            className="p-1.5 text-yellow-400 hover:bg-white/20 rounded-full transition"
            title="Khôi phục kích thước ban đầu"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Quick Page Slider / Scrubber Bar (Shows above bottom footer when controls are active) */}
      {!isLoading && pages.length > 1 && (
        <div
          className={`fixed bottom-[72px] sm:bottom-[76px] left-0 right-0 z-40 px-4 sm:px-12 flex justify-center transition-all duration-300 ${
            showControls ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-xl bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center space-x-3">
            <span className="text-[11px] sm:text-xs font-mono font-bold text-blue-400 whitespace-nowrap min-w-[65px]">
              Trang {currentPageIndex + 1}/{pages.length}
            </span>
            <div className="flex-1 relative flex items-center">
              <input
                type="range"
                min="1"
                max={pages.length}
                value={currentPageIndex + 1}
                onChange={(e) => handleScrubberChange(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-2 bg-white/20 rounded-lg appearance-none"
              />
            </div>
            <span className="text-[10px] text-gray-400 font-mono hidden sm:inline">
              {Math.round(((currentPageIndex + 1) / pages.length) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Bottom Footer Controls with safe area padding */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-[#0f0f11]/95 backdrop-blur-xl border-t border-white/10 px-3 sm:px-6 pt-3 pb-[max(env(safe-area-inset-bottom),18px)] flex items-center justify-between transition-transform duration-300 ${
          showControls ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          onClick={handlePrevChapter}
          disabled={!prevChapter}
          className={`flex items-center space-x-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
            prevChapter ? 'bg-white/10 hover:bg-white/20 text-white active:scale-95' : 'bg-white/5 text-gray-600 cursor-not-allowed'
          }`}
          title="Chương trước"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Chap trước</span>
        </button>

        <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-300 font-medium">
          {readingMode === 'single' ? (
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-white/5 border border-white/10 rounded-xl p-1">
              <button
                onClick={readerSettings.readingDirection === 'rtl' ? handleNextPage : handlePrevPage}
                disabled={currentPageIndex === 0}
                className="px-2.5 py-1 rounded-lg bg-white/10 disabled:opacity-25 hover:bg-white/20 text-white text-xs font-semibold active:scale-95"
              >
                Trước
              </button>
              <span className="px-1 text-[11px] sm:text-xs font-mono font-bold text-gray-200">
                {currentPageIndex + 1}/{pages.length}
              </span>
              <button
                onClick={readerSettings.readingDirection === 'rtl' ? handlePrevPage : handleNextPage}
                disabled={currentPageIndex === pages.length - 1}
                className="px-2.5 py-1 rounded-lg bg-white/10 disabled:opacity-25 hover:bg-white/20 text-white text-xs font-semibold active:scale-95"
              >
                Sau
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400 font-mono">{pages.length} trang</span>
          )}
        </div>

        <button
          onClick={handleNextChapter}
          disabled={!nextChapter}
          className={`flex items-center space-x-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
            nextChapter ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 active:scale-95' : 'bg-white/5 text-gray-600 cursor-not-allowed'
          }`}
          title="Chương tiếp theo"
        >
          <span>Chap sau</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Chapter List Drawer */}
      {showChapterDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-fade-in"
          onClick={() => setShowChapterDrawer(false)}
        >
          <div
            className="w-full max-w-md bg-[#18181b] h-full flex flex-col shadow-2xl border-l border-white/10 pt-[calc(env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 pt-[calc(env(safe-area-inset-top)+16px)] border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-base">Danh sách chương ({manga.chapters.length})</h3>
              <button
                onClick={() => setShowChapterDrawer(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {manga.chapters.map((ch) => {
                const isSelected = ch.id === currentChapter.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setCurrentChapter(ch);
                      onSelectChapter(ch);
                      setShowChapterDrawer(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm transition flex items-center justify-between ${
                      isSelected ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30' : 'hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <span className="line-clamp-1">{ch.title}</span>
                    {isSelected && <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium">Đang đọc</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Display & Eye Care Settings Modal */}
      {showSettingsModal && (
        <MangaReaderSettingsModal
          settings={readerSettings}
          onChangeSettings={handleUpdateSettings}
          onClose={() => setShowSettingsModal(false)}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}
    </div>
  );
};

interface MangaReaderPageItemProps {
  pageUrl: string;
  idx: number;
  totalPages: number;
  filterStyle?: string;
  onLoaded?: () => void;
  mode?: 'webtoon' | 'single';
}

const MangaReaderPageItem: React.FC<MangaReaderPageItemProps> = ({
  pageUrl,
  idx,
  totalPages,
  filterStyle,
  onLoaded,
  mode = 'webtoon',
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(pageUrl);
  const [attempt, setAttempt] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    setCurrentSrc(pageUrl);
    setAttempt(0);
    setHasError(false);
    setIsLoaded(false);
  }, [pageUrl]);

  const handleError = () => {
    if (attempt === 0) {
      // Step 1: Retry via dedicated server proxy
      setAttempt(1);
      setCurrentSrc(getProxyImageUrl(pageUrl));
    } else if (attempt === 1) {
      // Step 2: Try data-saver / official CDN fallback for MangaDex
      const mdMatch = pageUrl.match(/(?:mangadex\.network|uploads\.mangadex\.org)\/(data|data-saver)\/([a-f0-9]+)\/([^?#]+)/i);
      if (mdMatch) {
        const [, , hash, file] = mdMatch;
        setAttempt(2);
        const fallbackUrl = getProxyImageUrl(`https://uploads.mangadex.org/data-saver/${hash}/${file}`);
        setCurrentSrc(fallbackUrl);
      } else {
        setHasError(true);
        setIsLoaded(true);
        onLoaded?.();
      }
    } else {
      setHasError(true);
      setIsLoaded(true);
      onLoaded?.();
    }
  };

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setIsLoaded(false);
    setAttempt(1);
    setCurrentSrc(`${getProxyImageUrl(pageUrl)}&retry=${Date.now()}`);
  };

  if (hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 bg-[#16161a] border border-white/10 rounded-2xl text-center my-3 ${
          mode === 'single' ? 'min-h-[420px] w-full max-w-md shadow-2xl' : 'w-full min-h-[260px]'
        }`}
      >
        <BookOpen className="w-8 h-8 text-red-400 mb-2 opacity-80" />
        <p className="text-sm font-semibold text-gray-200 mb-1">Không tải được trang {idx + 1}</p>
        <p className="text-xs text-gray-400 mb-4 max-w-xs leading-relaxed">
          Máy chủ MangaDex node tạm thời bận hoặc kết nối mạng bị gián đoạn.
        </p>
        <button
          onClick={handleManualRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-lg shadow-blue-600/30"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Tải lại trang {idx + 1}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full flex flex-col items-center overflow-hidden ${
        mode === 'webtoon' ? 'min-h-[300px] sm:min-h-[500px] bg-black/20 rounded-xl shadow-md' : 'max-h-[calc(100vh-200px)]'
      }`}
    >
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs animate-pulse z-10 min-h-[250px]">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
          <span className="text-[11px] text-gray-300 font-mono font-medium">Đang tải trang {idx + 1}...</span>
        </div>
      )}
      <img
        src={currentSrc}
        alt={`Trang ${idx + 1}`}
        referrerPolicy="no-referrer"
        style={{ filter: filterStyle }}
        className={`w-full max-w-full h-auto object-contain transition-all duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${mode === 'single' ? 'max-h-[calc(100vh-200px)] rounded-lg shadow-2xl' : ''}`}
        loading={idx < 4 ? 'eager' : 'lazy'}
        onLoad={() => {
          setIsLoaded(true);
          onLoaded?.();
        }}
        onError={handleError}
      />
      {mode === 'webtoon' && (
        <div className="w-full py-1 text-center bg-black/50 text-[11px] text-gray-400 font-mono">
          Trang {idx + 1} / {totalPages}
        </div>
      )}
    </div>
  );
};

