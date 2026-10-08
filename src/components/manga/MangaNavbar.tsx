import React, { useState, useEffect, useRef } from "react";
import { UserProfile, Account } from "../../types";
import {
  MangaItem,
  mangaApi,
  MangaSource,
  getProxyImageUrl,
  handleMangaImageError,
} from "../../services/mangaApi";
import {
  Search,
  ChevronDown,
  Check,
  X,
  Layers,
  User,
  Clock,
  Bookmark,
  LayoutGrid,
  Home,
  Shield,
  Settings,
  LogOut,
  Lock,
  BookOpen,
  Trophy,
  Compass,
  Library,
  History as HistoryIcon,
  HardDrive,
  Flame,
} from "lucide-react";
import appLogo from "../../assets/images/app_logo.jpg";
import { motion, AnimatePresence } from "motion/react";
import { appConfigService } from "../../services/appConfigService";
import { Capacitor } from "@capacitor/core";

export type MangaNavTab = "home" | "explore" | "ranking" | "saved" | "history";

interface MangaNavbarProps {
  currentAccount?: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: "cinema" | "manga") => void;
  onSwitchProfileScreen?: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
  onLogoClick?: () => void;
  activeTab?: MangaNavTab;
  onTabChange?: (tab: MangaNavTab) => void;
  onSelectManga?: (manga: MangaItem) => void;
  onSearchSubmit?: (keyword: string) => void;
  selectedSource?: MangaSource;
}

export const MangaNavbar: React.FC<MangaNavbarProps> = ({
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout,
  onLogoClick,
  activeTab = "home",
  onTabChange,
  onSelectManga,
  onSearchSubmit,
  selectedSource = "truyenqq",
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [appConfig, setAppConfig] = useState<
    Record<string, { enabled: boolean }>
  >({});
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchOverlayRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isNativeApp = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    const unsub = appConfigService.subscribe((cfg) => setAppConfig(cfg));
    return unsub;
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 28);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      )
        setIsProfileMenuOpen(false);
      if (appMenuRef.current && !appMenuRef.current.contains(e.target as Node))
        setIsAppMenuOpen(false);
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node) &&
        mobileMenuToggleRef.current &&
        !mobileMenuToggleRef.current.contains(e.target as Node)
      )
        setIsMobileMenuOpen(false);
      const isInsideDesktop = searchContainerRef.current?.contains(
        e.target as Node,
      );
      const isInsideMobile = mobileSearchOverlayRef.current?.contains(
        e.target as Node,
      );
      if (!isInsideDesktop && !isInsideMobile) setIsSearchOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsProfileMenuOpen(false);
        setIsAppMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const isMobileScreen =
      typeof window !== "undefined" && window.innerWidth < 640;
    const shouldLock = isMobileMenuOpen || (isSearchOpen && isMobileScreen);
    if (shouldLock) {
      document.body.style.overflow = "hidden";
      (document.body.style as any).height = "100vh";
    } else {
      document.body.style.overflow = "";
      (document.body.style as any).height = "";
    }
    return () => {
      document.body.style.overflow = "";
      (document.body.style as any).height = "";
    };
  }, [isSearchOpen, isMobileMenuOpen]);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await mangaApi.getMangaList(
          selectedSource,
          1,
          searchQuery.trim(),
        );
        setSearchResults((res.items || []).slice(0, 6));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedSource]);

  const handleCloseSearch = () => setIsSearchOpen(false);
  const handleOpenSearch = () => setIsSearchOpen(true);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        const mob = document.getElementById(
          "manga-search-input-mobile",
        ) as HTMLInputElement | null;
        mob?.focus();
      }, 60);
    }
  }, [isSearchOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      onSearchSubmit?.(searchQuery.trim());
      handleCloseSearch();
    }
  };

  const [pinPromptProfile, setPinPromptProfile] = useState<UserProfile | null>(
    null,
  );
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const handleProfileClickInDropdown = (p: UserProfile) => {
    if (p.id === activeProfile?.id) {
      setIsProfileMenuOpen(false);
      return;
    }
    if (p.pin) {
      setPinPromptProfile(p);
      setEnteredPin("");
      setPinError(false);
      setIsProfileMenuOpen(false);
    } else {
      onSelectProfile(p);
      setIsProfileMenuOpen(false);
    }
  };
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinPromptProfile && enteredPin === pinPromptProfile.pin) {
      onSelectProfile(pinPromptProfile);
      setPinPromptProfile(null);
      setEnteredPin("");
      setPinError(false);
    } else setPinError(true);
  };

  const primaryItems: {
    label: string;
    tab: MangaNavTab;
    icon: React.ReactNode;
  }[] = [
    { label: "Trang Chủ", tab: "home", icon: <Home className="w-3.5 h-3.5" /> },
    {
      label: "Khám Phá",
      tab: "explore",
      icon: <Compass className="w-3.5 h-3.5" />,
    },
    {
      label: "Xếp Hạng",
      tab: "ranking",
      icon: <Trophy className="w-3.5 h-3.5" />,
    },
  ];
  const secondaryItems: { label: string; tab: MangaNavTab }[] = [
    { label: "Tủ Sách", tab: "saved" },
    { label: "Lịch Sử", tab: "history" },
  ];
  const allNavItems = [...primaryItems, ...secondaryItems];

  const navBtnClass = (tab: MangaNavTab) =>
    `cursor-pointer whitespace-nowrap px-2 py-1.5 rounded-lg text-xs lg:text-sm flex items-center gap-1.5 transition-[background-color,box-shadow,border-color,color,transform] duration-200 ease-out ${
      activeTab === tab
        ? "text-fuchsia-300 font-bold bg-purple-900/30 border border-purple-700/40 shadow-sm scale-[1.01]"
        : "text-slate-300 hover:text-white hover:bg-white/5"
    }`;

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 pt-[max(10px,env(safe-area-inset-top))] ${
          isScrolled
            ? "bg-[#0b0c16]/95 backdrop-blur-md shadow-2xl shadow-black/50 border-b border-purple-900/30 pb-3"
            : "bg-gradient-to-b from-[#0b0c16]/95 via-[#0b0c16]/60 to-transparent pb-4"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          {/* Left: Brand + Nav */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-1">
            <button
              onClick={() => {
                onLogoClick?.();
                onTabChange?.("home");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex items-center gap-2.5 cursor-pointer focus:outline-none group text-left shrink-0"
              title="Về đầu trang"
            >
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border-2 border-purple-500/50 shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-all">
                <img
                  src={appLogo}
                  alt="Gấu Manga Logo"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-purple-600/20 to-transparent" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-300 to-indigo-400 leading-none">
                  Gấu
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-[0.2em] text-purple-400/90">
                  MANGA
                </span>
              </div>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1.5 lg:gap-2 text-sm font-medium overflow-hidden">
              {primaryItems.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => onTabChange?.(item.tab)}
                  className={navBtnClass(item.tab)}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <AnimatePresence initial={false}>
                {!isSearchOpen && (
                  <motion.div
                    key="sec-nav"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap"
                  >
                    {secondaryItems.map((item) => (
                      <button
                        key={item.tab}
                        onClick={() => onTabChange?.(item.tab)}
                        className={navBtnClass(item.tab)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </nav>
          </div>

          {/* Right: Search + App Switcher + Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Desktop expandable search */}
            <div
              ref={searchContainerRef}
              className="relative flex items-center justify-end"
            >
              <AnimatePresence initial={false}>
                {isSearchOpen ? (
                  <motion.div
                    key="search-active"
                    initial={{ width: 40, opacity: 0.4 }}
                    animate={{ width: "clamp(200px, 28vw, 340px)", opacity: 1 }}
                    exit={{ width: 40, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className="hidden sm:flex items-center bg-[#13131a]/95 border border-purple-600/60 rounded-full px-3 py-1.5 shadow-xl backdrop-blur"
                  >
                    <Search
                      className="w-4 h-4 text-fuchsia-400 shrink-0 mr-1.5 cursor-pointer"
                      onClick={() => searchInputRef.current?.focus()}
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      autoFocus
                      placeholder="Tìm tên truyện, tác giả..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      style={{ fontSize: "15px" }}
                      className="w-full bg-transparent border-none text-white text-sm focus:outline-none placeholder-white/40 min-w-0"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        }}
                        className="text-white/40 hover:text-white p-0.5 shrink-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCloseSearch}
                        className="text-white/40 hover:text-white p-0.5 shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.button
                    key="search-collapsed"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{
                      scale: 0.9,
                      opacity: 0,
                      position: "absolute",
                      right: 0,
                    }}
                    transition={{ duration: 0.16 }}
                    onClick={handleOpenSearch}
                    className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-white/5 hover:bg-purple-900/30 border border-white/10 hover:border-purple-700/50 text-white/70 hover:text-fuchsia-300 cursor-pointer transition-all hover:scale-105"
                    title="Tìm kiếm truyện"
                  >
                    <Search className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
              <button
                onClick={handleOpenSearch}
                className="sm:hidden text-white/70 hover:text-fuchsia-300 p-1.5 rounded-full hover:bg-white/5"
                aria-label="Tìm kiếm"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Live results dropdown desktop */}
              {isSearchOpen && searchQuery && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="hidden sm:block absolute right-0 top-12 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-[#0f0f14] border border-purple-900/60 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-3 border-b border-white/5 flex items-center justify-between text-xs text-white/50 bg-[#13131a]">
                    <span className="truncate pr-2">
                      Kết quả cho:{" "}
                      <strong className="text-white">"{searchQuery}"</strong>
                    </span>
                    {isSearching && (
                      <span className="text-fuchsia-400 animate-pulse shrink-0">
                        Đang tìm...
                      </span>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
                    {searchResults.length > 0 ? (
                      searchResults.map((m, idx) => (
                        <div
                          key={`${m.id || m.slug}-${idx}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (onSelectManga) onSelectManga(m);
                            else onSearchSubmit?.(m.title);
                            handleCloseSearch();
                          }}
                          className="group flex items-center gap-3 p-3 hover:bg-white/[0.04] cursor-pointer transition-colors"
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 border border-white/10">
                            <img
                              src={m.coverUrl}
                              alt={m.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              referrerPolicy="no-referrer"
                              onError={(e) =>
                                handleMangaImageError(e, m.coverUrl)
                              }
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-white truncate group-hover:text-fuchsia-300">
                              {m.title}
                            </h4>
                            <p className="text-xs text-white/40 truncate">
                              {m.source?.toUpperCase()}{" "}
                              {m.status ? `• ${m.status}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 p-1.5 rounded-full bg-purple-600/20 text-fuchsia-300 border border-purple-500/30">
                            <BookOpen className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      ))
                    ) : !isSearching ? (
                      <div className="p-6 text-center text-white/40 text-sm">
                        Không tìm thấy truyện phù hợp. Nhấn Enter để tìm kiếm
                        toàn bộ.
                      </div>
                    ) : null}
                  </div>
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSearchSubmit?.(searchQuery);
                      handleCloseSearch();
                    }}
                    className="p-3 bg-[#0b0c16] hover:bg-white/[0.03] text-center text-xs font-semibold text-fuchsia-400 cursor-pointer border-t border-white/5"
                  >
                    Xem tất cả kết quả tìm kiếm →
                  </div>
                </div>
              )}
            </div>

            {/* App Switcher */}
            <div className="relative" ref={appMenuRef}>
              <button
                onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 hover:bg-purple-900/30 border border-white/10 hover:border-purple-700/50 text-white/70 hover:text-fuchsia-300 cursor-pointer transition-all hover:scale-105"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              {isAppMenuOpen && (
                <div className="absolute right-[-2rem] sm:right-0 top-12 w-64 bg-[#0f0f14] border border-purple-900/60 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in">
                  <div className="text-xs font-bold text-white/40 mb-2 px-2">
                    HỆ SINH THÁI
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onSwitchApp("cinema");
                        setIsAppMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium text-white hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-900/40 flex items-center justify-center">
                        <Home className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span>Gấu Cinema HD</span>
                        <span className="text-[10px] text-white/40">
                          Xem phim thả ga
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-1.5 cursor-pointer focus:outline-none group p-1"
              >
                <div
                  className="w-8 h-8 rounded-lg overflow-hidden border-2 shadow-md group-hover:scale-105 transition-transform"
                  style={{ borderColor: activeProfile?.color || "#a855f7" }}
                >
                  <img
                    src={activeProfile?.avatar}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/40 group-hover:text-white transition-transform ${
                    isProfileMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isProfileMenuOpen && (
                <div className="absolute right-0 top-12 w-64 bg-[#0f0f14] border border-purple-900/60 rounded-2xl shadow-2xl p-3 z-50">
                  {currentAccount && (
                    <div className="px-2 py-1.5 mb-2 bg-white/[0.04] rounded-xl border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Shield className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          @{currentAccount.username}
                        </span>
                      </div>
                      {currentAccount.role === "admin" && (
                        <span className="text-[9px] bg-red-950 text-red-300 border border-red-800/80 px-1.5 py-0.2 rounded font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                  )}
                  <div className="pb-3 mb-3 border-b border-white/10">
                    <div className="text-xs text-fuchsia-400 uppercase font-bold tracking-wider px-2 mb-2">
                      Chuyển hồ sơ ({profiles.length}/2)
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleProfileClickInDropdown(p)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                            activeProfile?.id === p.id
                              ? "bg-purple-600/20 text-fuchsia-300 font-semibold border border-purple-500/40"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={p.avatar}
                              alt={p.name}
                              className="w-7 h-7 rounded-md object-cover border shrink-0"
                              style={{ borderColor: p.color }}
                            />
                            <span className="truncate">{p.name}</span>
                            {p.isPrimary && (
                              <span className="text-[9px] bg-purple-900/60 text-purple-300 px-1 rounded font-bold shrink-0">
                                Chính
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {p.pin && (
                              <Lock className="w-3.5 h-3.5 text-white/30" />
                            )}
                            {activeProfile?.id === p.id && (
                              <Check className="w-4 h-4 text-fuchsia-400" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onTabChange?.("saved");
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                    >
                      <Library className="w-4 h-4 text-fuchsia-400" />
                      <span>Tủ Sách Của Tôi</span>
                    </button>
                    <button
                      onClick={() => {
                        onTabChange?.("history");
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                    >
                      <HistoryIcon className="w-4 h-4 text-white/40" />
                      <span>Lịch Sử Đọc</span>
                    </button>
                    {currentAccount?.role === "admin" &&
                      onOpenAdminDashboard && (
                        <button
                          onClick={() => {
                            onOpenAdminDashboard();
                            setIsProfileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm font-bold text-indigo-300 hover:bg-indigo-950/80 transition-colors cursor-pointer border border-indigo-900/60"
                        >
                          <Settings className="w-4 h-4 text-indigo-400" />
                          <span>Quản Trị Hệ Thống (Admin)</span>
                        </button>
                      )}
                    {onSwitchProfileScreen && (
                      <button
                        onClick={() => {
                          onSwitchProfileScreen();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                      >
                        <User className="w-4 h-4 text-white/40" />
                        <span>Màn hình chọn người xem</span>
                      </button>
                    )}
                    {isNativeApp && (
                      <button
                        onClick={() => {
                          onSwitchApp("cinema");
                          setIsProfileMenuOpen(false);
                          try {
                            localStorage.setItem("gau_active_tab", "offline");
                          } catch {}
                          window.dispatchEvent(
                            new CustomEvent("gau_navigate_cinema_tab", {
                              detail: "offline",
                            }),
                          );
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-amber-300 hover:bg-amber-950/30 transition-colors cursor-pointer border border-amber-900/30"
                      >
                        <HardDrive className="w-4 h-4 text-amber-400" />
                        <span>Đã Lưu Offline</span>
                      </button>
                    )}
                    {onLogout && (
                      <button
                        onClick={() => {
                          onLogout();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-red-300 hover:bg-red-950/70 transition-colors cursor-pointer border-t border-white/10 mt-1"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span>Đăng xuất tài khoản</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile menu toggle */}
            <button
              ref={mobileMenuToggleRef}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-white/70 hover:text-white p-1"
              aria-label="Mở menu"
            >
              <Layers className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {isMobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="md:hidden bg-[#0b0c16] border-b border-purple-900/30 px-4 py-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              {allNavItems.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => {
                    onTabChange?.(item.tab as MangaNavTab);
                    setIsMobileMenuOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${
                    activeTab === item.tab
                      ? "bg-purple-600 text-white font-bold border border-purple-500 shadow-lg shadow-purple-600/20"
                      : "bg-white/5 text-white/60 border border-white/10"
                  }`}
                >
                  {"icon" in item && (item as any).icon}
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-xs text-white/40">Nguồn:</span>
              <span className="text-xs bg-purple-900/30 border border-purple-800/50 text-purple-300 px-2 py-1 rounded-full font-bold uppercase">
                {selectedSource}
              </span>
            </div>
          </div>
        )}

        {/* Mobile fullscreen search */}
        {isSearchOpen && (
          <div
            ref={mobileSearchOverlayRef}
            className="sm:hidden fixed inset-0 z-50 bg-[#0b0c16]/98 backdrop-blur-xl flex flex-col"
          >
            <div className="p-3 border-b border-purple-900/40 flex items-center gap-2 safe-pt bg-[#0b0c16]">
              <div className="relative flex-1 flex items-center bg-white/5 border border-purple-800/40 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-fuchsia-400 shrink-0 mr-2" />
                <input
                  id="manga-search-input-mobile"
                  type="text"
                  autoFocus
                  placeholder="Tìm tên truyện, tác giả..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{ fontSize: "16px" }}
                  className="w-full bg-transparent border-none text-white text-base focus:outline-none placeholder-white/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSearchQuery("");
                      const m = document.getElementById(
                        "manga-search-input-mobile",
                      ) as HTMLInputElement | null;
                      m?.focus();
                    }}
                    className="text-white/40 hover:text-white p-1 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCloseSearch();
                }}
                className="text-xs font-semibold text-white/60 hover:text-white px-2 py-2 cursor-pointer"
              >
                Hủy
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
              {searchResults.length > 0 ? (
                searchResults.map((m, idx) => (
                  <div
                    key={`${m.id}-${idx}`}
                    onClick={() => {
                      if (onSelectManga) onSelectManga(m);
                      else onSearchSubmit?.(m.title);
                      handleCloseSearch();
                    }}
                    className="flex items-center gap-3 p-2.5 rounded-xl active:bg-white/5 cursor-pointer"
                  >
                    <img
                      src={m.coverUrl}
                      alt={m.title}
                      className="w-12 h-16 object-cover rounded-lg shrink-0 bg-white/5"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleMangaImageError(e, m.coverUrl)}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {m.title}
                      </h4>
                      <p className="text-xs text-white/40 truncate">
                        {m.source?.toUpperCase()}{" "}
                        {m.status ? `• ${m.status}` : ""}
                      </p>
                    </div>
                  </div>
                ))
              ) : isSearching ? (
                <div className="p-8 text-center text-white/40 text-sm animate-pulse">
                  Đang tìm kiếm...
                </div>
              ) : searchQuery ? (
                <div className="p-8 text-center text-white/30 text-sm">
                  Không tìm thấy kết quả cho "{searchQuery}"
                </div>
              ) : (
                <div className="p-8 text-center text-white/20 text-sm">
                  Nhập tên truyện để tìm kiếm nhanh
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* PIN Prompt */}
      {pinPromptProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f0f14] border border-purple-900/80 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border-2 border-purple-500 shadow-lg">
              <img
                src={pinPromptProfile.avatar}
                alt={pinPromptProfile.name}
                className="w-full h-full object-cover"
              />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">
              Nhập mã PIN của {pinPromptProfile.name}
            </h3>
            <p className="text-xs text-white/40 mb-6">
              Hồ sơ này được bảo vệ bằng mã PIN 4 chữ số.
            </p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                maxLength={4}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full bg-white/5 border border-purple-800/60 rounded-xl px-4 py-3 text-center text-2xl tracking-widest text-white focus:outline-none focus:border-purple-500"
              />
              {pinError && (
                <p className="text-xs text-red-400 font-medium">
                  Mã PIN không chính xác. Vui lòng thử lại.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPinPromptProfile(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 font-semibold py-2.5 rounded-xl text-sm cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg shadow-purple-600/30 cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
