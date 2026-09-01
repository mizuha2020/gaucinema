const fs = require('fs');
let content = fs.readFileSync('src/components/manga/MangaView.tsx', 'utf8');
content = content.replace(
  "  const [isLoadingMore, setIsLoadingMore] = useState(false);\n  const skipNextFetchRef = React.useRef(false);",
  "  const [isLoadingMore, setIsLoadingMore] = useState(false);\n  const [isDetailLoading, setIsDetailLoading] = useState(false);\n  const skipNextFetchRef = React.useRef(false);\n\n  // Cache: keep home/ranking data to avoid reload on tab switch\n  const tabCacheRef = React.useRef(new Map());\n  const getTabCacheKey = (tab, kw) => {\n    if (tab === 'home') return `home:${kw.trim()}`;\n    if (tab === 'ranking') return 'ranking';\n    return `${tab}:${kw}`;\n  };\n  const saveTabCache = (key, items, totalPagesVal, pageVal) => {\n    tabCacheRef.current.set(key, { items, totalPages: totalPagesVal, page: pageVal });\n  };"
);
content = content.replace(
  /  const fetchMixed = async \(pageNum: number, searchKey: string, append = false\) => \{[\s\S]*?  \/\/ Home fetch - infinite scroll: page 1 replace \(preload 1-3\), page>1 append\n  useEffect\(\(\) => \{\n    if \(skipNextFetchRef\.current\) \{ skipNextFetchRef\.current = false; return; \}\n    if \(!isDetail && activeTab === 'home'\) \{\n      fetchMixed\(page, searchKeyword, page > 1\);\n    \} else if \(!isDetail && activeTab === 'ranking'\) \{\n      fetchMixed\(page, '', page > 1\);\n    \}\n  \}, \[page, activeTab, isDetail, searchKeyword, activeSources\]\);/,
  `  const fetchMixed = async (pageNum, searchKey, append = false, cacheKeyForSave) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    const guard = setTimeout(() => { setIsLoading(false); setIsLoadingMore(false); }, 15000);
    try {
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
        const merged = [];
        const seen = new Set();
        let maxPages = 1;
        for (const r of results) {
          maxPages = Math.max(maxPages, r.totalPages || 1);
          for (const it of r.items || []) {
            if (!seen.has(it.id)) { seen.add(it.id); merged.push(it); }
          }
        }
        setMangaList(merged);
        setTotalPages(maxPages);
        if (cacheKeyForSave) saveTabCache(cacheKeyForSave, merged, maxPages, 8);
        if (merged.length > 0) { skipNextFetchRef.current = true; setPage(8); }
      } else {
        const result = await mangaApi.getMixedMangaList(pageNum, searchKey);
        if (append) {
          setMangaList(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newItems = (result.items || []).filter(it => !existingIds.has(it.id));
            const mergedList = [...prev, ...newItems];
            if (cacheKeyForSave) saveTabCache(cacheKeyForSave, mergedList, result.totalPages || 1, pageNum);
            return mergedList;
          });
        } else {
          setMangaList(result.items || []);
          if (cacheKeyForSave) saveTabCache(cacheKeyForSave, result.items || [], result.totalPages || 1, pageNum);
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

  // Invalidate tab cache when sources change
  useEffect(() => {
    tabCacheRef.current.clear();
  }, [activeSources]);

  // Home / Ranking fetch with tab cache to avoid reload on navigator switch
  useEffect(() => {
    if (skipNextFetchRef.current) { skipNextFetchRef.current = false; return; }
    if (isDetail) return;
    if (activeTab !== 'home' && activeTab !== 'ranking') return;
    const kw = activeTab === 'ranking' ? '' : searchKeyword;
    const cacheKey = getTabCacheKey(activeTab, kw);
    const cached = tabCacheRef.current.get(cacheKey);
    const isAppend = page > 1;
    if (!isAppend && cached && cached.items.length > 0) {
      setMangaList(cached.items);
      setTotalPages(cached.totalPages);
      if (cached.page !== page) {
        skipNextFetchRef.current = true;
        setPage(cached.page);
      }
      setIsLoading(false);
      setIsLoadingMore(false);
      window.dispatchEvent(new Event('app-data-loaded'));
      return;
    }
    if (isAppend && cached && page <= cached.page) {
      setMangaList(cached.items);
      setTotalPages(cached.totalPages);
      setIsLoading(false);
      setIsLoadingMore(false);
      window.dispatchEvent(new Event('app-data-loaded'));
      return;
    }
    if (!isAppend && cached && cached.page > 1 && cached.items.length > 0) {
      setMangaList(cached.items);
      setTotalPages(cached.totalPages);
      skipNextFetchRef.current = true;
      setPage(cached.page);
      setIsLoading(false);
      setIsLoadingMore(false);
      window.dispatchEvent(new Event('app-data-loaded'));
      return;
    }
    fetchMixed(page, kw, isAppend, cacheKey);
  }, [page, activeTab, isDetail, searchKeyword, activeSources]);`
);
content = content.replace(
  "  const handleOpenDetail = async (item: MangaItem) => {\n    setIsLoading(true);",
  "  const handleOpenDetail = async (item: MangaItem) => {\n    setIsDetailLoading(true);"
);
content = content.replace(
  "    setIsLoading(false);\n    const full: MangaItem = {",
  "    setIsDetailLoading(false);\n    const full: MangaItem = {"
);
content = content.replace(
  "  const handleTabChange = (tab: MangaNavTab) => {\n    setSelectedManga(null);\n    setActiveTab(tab);\n    if (tab === 'history') setHistoryPage(1);\n    if (tab === 'home' || tab === 'ranking') {\n      // Về trang chủ/ranking thì không áp dụng search - clear Conan còn sót, reset về 1 để infinite scroll hoạt động\n      setSearchKeyword('');\n      setHomeInput('');\n      if (tab === 'home') setExploreKeyword('');\n      setPage(1);\n      setMangaList([]);\n    }",
  "  const handleTabChange = (tab: MangaNavTab) => {\n    setSelectedManga(null);\n    setActiveTab(tab);\n    if (tab === 'history') setHistoryPage(1);\n    if (tab === 'home' || tab === 'ranking') {\n      const cacheKey = tab === 'ranking' ? 'ranking' : 'home:';\n      const cached = tabCacheRef.current.get(cacheKey);\n      setSearchKeyword('');\n      setHomeInput('');\n      if (tab === 'home') setExploreKeyword('');\n      if (cached && cached.items.length > 0) {\n        setMangaList(cached.items);\n        setTotalPages(cached.totalPages);\n        setIsLoading(false);\n        setIsLoadingMore(false);\n        if (cached.page !== 1) {\n          skipNextFetchRef.current = true;\n          setPage(cached.page);\n        } else {\n          setPage(1);\n        }\n      } else {\n        setPage(1);\n        setMangaList([]);\n      }\n    }"
);
content = content.replace(
  "                      <div key={idx} onClick={async () => {\n                        if(!active){ setDisabledSourceAlert(`Nguồn \"${item.source.toUpperCase()}\" đang tạm khóa.`); return; }\n                        setIsLoading(true);\n                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);\n                        setIsLoading(false);",
  "                      <div key={idx} onClick={async () => {\n                        if(!active){ setDisabledSourceAlert(`Nguồn \"${item.source.toUpperCase()}\" đang tạm khóa.`); return; }\n                        setIsDetailLoading(true);\n                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);\n                        setIsDetailLoading(false);"
);
content = content.replace(
  "                        if(found){ window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: found.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: found, pageIndex: item.pageIndex || 0 }); }\n                      }} className={`bg-white/[0.03]",
  "                        if(found){ window.history.pushState({ tab: 'manga', mangaView: 'detail', mangaId: (full as MangaItem).id }, ''); window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: found.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: found, pageIndex: item.pageIndex || 0 }); }\n                      }} className={`bg-white/[0.03]"
);
content = content.replace(
  "                    {continueReading.map((item, idx) => (\n                      <div key={`${item.mangaId}-${idx}`} onClick={async()=>{\n                        setIsLoading(true);\n                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);\n                        setIsLoading(false);",
  "                    {continueReading.map((item, idx) => (\n                      <div key={`${item.mangaId}-${idx}`} onClick={async()=>{\n                        setIsDetailLoading(true);\n                        const detail = await mangaApi.getMangaDetail(item.source, item.mangaId);\n                        setIsDetailLoading(false);"
);
content = content.replace(
  "                        if(ch) { window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: ch.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: ch, pageIndex: item.pageIndex || 0 }); }\n                      }} className=\"group relative w-36",
  "                        if(ch) { window.history.pushState({ tab: 'manga', mangaView: 'detail', mangaId: (full as MangaItem).id }, ''); window.history.pushState({ tab: 'manga', mangaView: 'reader', chapterId: ch.id }, ''); setActiveReadingSession({ manga: full as MangaItem, chapter: ch, pageIndex: item.pageIndex || 0 }); }\n                      }} className=\"group relative w-36"
);
content = content.replace(
  "          <MangaReaderModal\n            key={`reader-${selectedManga.id}-${activeReadingSession.chapter.id}`}",
  "          <MangaReaderModal\n            key={`reader-${selectedManga.id}`}"
);
content = content.replace(
  "      {/* Disabled source alert */}",
  "      {/* Detail loading overlay - không reload trang chủ */}\n      {isDetailLoading && (\n        <div className=\"fixed inset-0 z-40 flex items-center justify-center bg-[#0b0c16]/60 backdrop-blur-sm\">\n          <div className=\"flex flex-col items-center gap-3\">\n            <div className=\"w-10 h-10 border-4 border-white/10 border-t-fuchsia-500 rounded-full animate-spin\" />\n            <p className=\"text-sm text-white/60\">Đang tải truyện...</p>\n          </div>\n        </div>\n      )}\n\n      {/* Disabled source alert */}"
);
// Simple transition: add key to pt-20 container for fade
content = content.replace(
  '          <div className="pt-20 sm:pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">',
  '          <div key={activeTab} className="pt-20 sm:pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">'
);
fs.writeFileSync('src/components/manga/MangaView.tsx', content, 'utf8');
console.log('patched final');
