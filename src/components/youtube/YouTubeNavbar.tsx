import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, Account } from '../../types';
import { VIETNAM_TOPIC_PILLS } from './YouTubeView';
import {
  Menu,
  Search,
  Youtube,
  Mic,
  Video,
  Bell,
  X,
  Check,
  Shield,
  Lock,
  LogOut,
  ChevronDown,
  Film,
  Tv,
  BookOpen,
  LayoutGrid,
  Clock,
  Trash2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { youtubeApi } from '../../services/youtubeApi';
import { appConfigService } from '../../services/appConfigService';
import appLogo from '../../assets/images/app_logo.jpg';

interface YouTubeNavbarProps {
  currentAccount?: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: 'cinema' | 'manga' | 'livetv' | 'youtube') => void;
  onSwitchProfileScreen?: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
  onLogoClick?: () => void;
  onSearch: (query: string) => void;
  onToggleSidebar?: () => void;
  onOpenMobileSidebar?: () => void;
  onOpenVoiceSearch?: () => void;
  onOpenCreateModal?: () => void;
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
  selectedVnTopic?: string;
  onSelectVnTopic?: (topicId: string) => void;
}

export const YouTubeNavbar: React.FC<YouTubeNavbarProps> = ({
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout,
  onLogoClick,
  onSearch,
  onToggleSidebar,
  onOpenMobileSidebar,
  onOpenVoiceSearch,
  onOpenCreateModal,
  activeCategory = 'all',
  onCategoryChange,
  selectedVnTopic,
  onSelectVnTopic,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<Record<string, { enabled: boolean }>>({});

  useEffect(() => {
    const unsub = appConfigService.subscribe((cfg) => setAppConfig(cfg));
    return unsub;
  }, []);

  // Search History / Auto-complete state
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gau_yt_search_history');
      return saved ? JSON.parse(saved) : ['Nhạc trẻ hot vpop', 'Review phim chiếu rạp', 'MixiGaming', 'Lofi hip hop relax'];
    } catch {
      return ['Nhạc trẻ hot vpop', 'Review phim chiếu rạp', 'MixiGaming'];
    }
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Profile PIN prompt state
  const [pinPromptProfile, setPinPromptProfile] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Fetch search suggestions with debounce
  useEffect(() => {
    const qTrim = searchQuery.trim();
    if (!qTrim) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const list = await youtubeApi.getSuggestions(qTrim);
        setSuggestions(list);
      } catch (e) {
        console.error('Failed to get suggestions:', e);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Notifications State
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'MixiGaming đã đăng video mới: "Mặt Bằng Căn Hộ Mới"', time: '10 phút trước', unread: true, thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
    { id: 2, title: 'VTV24: "Bản tin Thời sự toàn cảnh 24h"', time: '1 giờ trước', unread: true, thumb: 'https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg' },
    { id: 3, title: 'Gấu YouTube VN: "Cập nhật giao diện YouTube Clone sắc nét"', time: '3 giờ trước', unread: false, thumb: 'https://i.ytimg.com/vi/L_LUpnjgPso/hqdefault.jpg' },
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    try {
      localStorage.setItem('gau_yt_search_history', JSON.stringify(searchHistory));
    } catch (e) {
      console.error('Failed to save search history:', e);
    }
  }, [searchHistory]);

  // Click outside search container to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedDesktop = searchContainerRef.current && searchContainerRef.current.contains(target);
      if (!clickedDesktop) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus mobile search input when overlay opens
  useEffect(() => {
    if (isMobileSearchOpen) {
      setTimeout(() => {
        mobileSearchInputRef.current?.focus();
      }, 100);
    }
  }, [isMobileSearchOpen]);

  const handleSearchSubmit = (queryToSearch?: string) => {
    const q = (queryToSearch !== undefined ? queryToSearch : searchQuery).trim();
    if (q) {
      if (!searchHistory.includes(q)) {
        setSearchHistory((prev) => [q, ...prev.slice(0, 9)]);
      }
      onSearch(q);
      setIsSearchFocused(false);
      setIsMobileSearchOpen(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    onSearch('');
    if (searchInputRef.current) searchInputRef.current.focus();
    if (mobileSearchInputRef.current) mobileSearchInputRef.current.focus();
  };

  const handleRemoveHistoryItem = (itemToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory((prev) => prev.filter((item) => item !== itemToRemove));
  };

  const handleProfileClickInDropdown = (p: UserProfile) => {
    if (p.id === activeProfile?.id) {
      setIsProfileMenuOpen(false);
      return;
    }
    if (p.pin) {
      setPinPromptProfile(p);
      setEnteredPin('');
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
      setEnteredPin('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F0F0F] border-b border-[#272727] select-none pt-[env(safe-area-inset-top,0px)]">
        {/* MAIN TOP HEADER BAR */}
        <div className="h-14 px-2 sm:px-4 flex items-center justify-between gap-2">
          {/* LEFT SECTION: Hamburger + Logo + VN Badge */}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <button
              onClick={() => {
                if (window.innerWidth < 960 && onOpenMobileSidebar) {
                  onOpenMobileSidebar();
                } else if (onToggleSidebar) {
                  onToggleSidebar();
                }
              }}
              className="p-2 rounded-full text-slate-200 hover:bg-[#272727] active:bg-[#383838] transition-colors cursor-pointer"
              title="Menu điều hướng"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                onLogoClick?.();
                setSearchQuery('');
              }}
              className="flex items-center gap-1.5 cursor-pointer focus:outline-none group"
              title="Trang chủ YouTube"
            >
              <div className="flex items-center gap-1">
                <div className="w-7 h-5 sm:w-8 sm:h-5.5 bg-[#FF0000] rounded-md flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                  <Youtube className="w-4 h-4 text-white fill-white" />
                </div>
                <span className="text-base sm:text-lg font-bold tracking-tighter text-white font-sans flex items-center gap-1">
                  YouTube
                  <span className="text-[10px] font-semibold text-[#AAAAAA] align-top tracking-normal pl-0.5">
                    VN
                  </span>
                </span>
              </div>
            </button>
          </div>

          {/* TABLET / DESKTOP CENTER SEARCH BAR (Visible from >=600px / sm) */}
          <div
            ref={searchContainerRef}
            className="relative flex-1 max-w-2xl mx-2 sm:mx-4 hidden sm:flex items-center gap-2 justify-center"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              className="flex items-center flex-1 max-w-xl"
            >
              <div
                className={`relative flex items-center flex-1 bg-[#121212] border border-[#303030] rounded-l-full px-3 py-1.5 transition-all ${
                  isSearchFocused ? 'border-[#1c62b9] bg-black' : ''
                }`}
              >
                {isSearchFocused && <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />}
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="w-full bg-transparent text-white text-sm focus:outline-none placeholder:text-[#AAAAAA]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="text-slate-400 hover:text-white p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="bg-[#222222] hover:bg-[#383838] border border-l-0 border-[#303030] text-slate-200 px-4 sm:px-5 py-2 rounded-r-full transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                title="Tìm kiếm"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* Voice Search Mic Button */}
            <button
              onClick={onOpenVoiceSearch}
              className="p-2 sm:p-2.5 rounded-full bg-[#222222] hover:bg-[#383838] text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Tìm kiếm bằng giọng nói"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Desktop Search History & Auto-Complete Suggestions Dropdown Overlay */}
            {isSearchFocused && (searchQuery.trim() ? suggestions.length > 0 : searchHistory.length > 0) && (
              <div className="absolute top-12 left-0 right-12 bg-[#212121] border border-[#383838] rounded-2xl shadow-2xl py-2 z-50 text-xs text-white animate-fade-in">
                {!searchQuery.trim() ? (
                  <>
                    <div className="px-3 py-1 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wider flex items-center justify-between">
                      <span>Tìm kiếm gần đây</span>
                      <Clock className="w-3.5 h-3.5 text-[#AAAAAA]" />
                    </div>
                    {searchHistory.map((item, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(item);
                          handleSearchSubmit(item);
                        }}
                        className="flex items-center justify-between px-3 py-2 hover:bg-[#3F3F3F] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <Clock className="w-3.5 h-3.5 text-[#AAAAAA] shrink-0" />
                          <span className="font-medium truncate">{item}</span>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemoveHistoryItem(item, e);
                          }}
                          className="p-1 text-[#AAAAAA] hover:text-red-400 cursor-pointer"
                          title="Xóa khỏi lịch sử tìm kiếm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="px-3 py-1 text-[11px] font-semibold text-[#AAAAAA] uppercase tracking-wider flex items-center justify-between border-b border-[#2d2d2d] pb-1.5 mb-1">
                      <span>Gợi ý tìm kiếm</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    </div>
                    {suggestions.map((item, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(item);
                          handleSearchSubmit(item);
                        }}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-[#3F3F3F] cursor-pointer transition-colors text-white"
                      >
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{item}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SECTION: Mobile Search Icon + Create + Notifications + User Avatar */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Mobile Search Lens Button (Only on < 600px) */}
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="sm:hidden p-2 rounded-full text-slate-200 hover:bg-[#272727] active:bg-[#383838] transition-colors cursor-pointer"
              title="Tìm kiếm"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Mobile Mic Button on tiny screens */}
            <button
              onClick={onOpenVoiceSearch}
              className="sm:hidden p-2 rounded-full text-slate-200 hover:bg-[#272727] active:bg-[#383838] transition-colors cursor-pointer"
              title="Tìm giọng nói"
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Create Video Button (Hidden on Mobile < 600px) */}
            <button
              onClick={onOpenCreateModal}
              className="hidden sm:flex p-2 rounded-full text-slate-200 hover:bg-[#272727] hover:text-white transition-colors cursor-pointer relative items-center justify-center"
              title="Tạo / Tải lên video"
            >
              <Video className="w-5 h-5 text-slate-200" />
            </button>

            {/* Notifications Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 rounded-full text-slate-200 hover:bg-[#272727] hover:text-white transition-colors cursor-pointer relative"
                title="Thông báo"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 bg-[#FF0000] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 top-11 w-80 bg-[#282828] border border-[#3F3F3F] rounded-2xl shadow-2xl p-3 z-50 text-white space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[#3F3F3F]">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-red-500" />
                      <span>Thông báo</span>
                    </h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-[11px] text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        className={`flex gap-2.5 p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                          item.unread ? 'bg-[#3F3F3F]/60 font-semibold' : 'hover:bg-[#3F3F3F]/40 text-slate-300'
                        }`}
                      >
                        <img
                          src={item.thumb}
                          alt="Notification"
                          className="w-12 aspect-video rounded object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="line-clamp-2 leading-tight">{item.title}</p>
                          <p className="text-[10px] text-[#AAAAAA]">{item.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* App Switcher Icon (Visible on all devices including mobile) */}
            <div className="relative">
              <button
                onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                className="p-2 rounded-full text-slate-200 hover:bg-[#272727] active:bg-[#383838] hover:text-white transition-colors cursor-pointer"
                title="Dịch vụ Gấu Systems"
              >
                <LayoutGrid className="w-5 h-5 text-slate-300" />
              </button>

              {isAppMenuOpen && (
                <div className="absolute right-[-2rem] sm:right-0 top-11 w-64 max-w-[calc(100vw-24px)] bg-[#282828] border border-[#3F3F3F] rounded-2xl shadow-2xl p-3 z-50 text-white animate-fade-in space-y-2">
                  <div className="text-[11px] font-bold text-red-500 uppercase tracking-wider px-2">
                    Dịch vụ Gấu Ecosystem
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onSwitchApp('cinema');
                        setIsAppMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-[#3F3F3F] hover:text-blue-400 transition-colors cursor-pointer text-left"
                    >
                      <Film className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Gấu Cinema HD</span>
                    </button>
                    <button
                      onClick={() => {
                        if (appConfig.livetv?.enabled !== false) {
                          onSwitchApp('livetv');
                          setIsAppMenuOpen(false);
                        }
                      }}
                      disabled={appConfig.livetv?.enabled === false}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left ${appConfig.livetv?.enabled === false ? 'opacity-40 cursor-not-allowed text-slate-500' : 'text-slate-200 hover:bg-[#3F3F3F] hover:text-orange-400'}`}
                    >
                      <Tv className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>Gấu LiveTV</span>
                      {appConfig.livetv?.enabled === false && <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded-full">OFF</span>}
                    </button>
                    <button
                      onClick={() => {
                        if (appConfig.manga?.enabled !== false) {
                          onSwitchApp('manga');
                          setIsAppMenuOpen(false);
                        }
                      }}
                      disabled={appConfig.manga?.enabled === false}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left ${appConfig.manga?.enabled === false ? 'opacity-40 cursor-not-allowed text-slate-500' : 'text-slate-200 hover:bg-[#3F3F3F] hover:text-purple-400'}`}
                    >
                      <BookOpen className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Gấu Manga</span>
                      {appConfig.manga?.enabled === false && <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded-full">OFF</span>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar Menu */}
            <div className="relative">
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-1 cursor-pointer focus:outline-none p-1"
              >
                <div
                  className="w-8 h-8 rounded-full overflow-hidden border-2 border-red-500 shadow-md group-hover:scale-105 transition-transform"
                  style={{ borderColor: activeProfile?.color || '#FF0000' }}
                >
                  <img
                    src={activeProfile?.avatar}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-11 w-64 bg-[#282828] border border-[#3F3F3F] rounded-2xl shadow-2xl p-3 z-50 text-white animate-fade-in">
                  {currentAccount && (
                    <div className="px-2 py-1.5 mb-2 bg-[#1f1f1f] rounded-xl border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Shield className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          @{currentAccount.username}
                        </span>
                      </div>
                      {currentAccount.role === 'admin' && (
                        <span className="text-[9px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.2 rounded font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pb-2 mb-2 border-b border-[#3F3F3F]">
                    <div className="text-[11px] text-[#AAAAAA] uppercase font-bold tracking-wider px-2 mb-2">
                      Chuyển hồ sơ ({profiles.length}/5)
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleProfileClickInDropdown(p)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                            activeProfile?.id === p.id
                              ? 'bg-[#3F3F3F] text-white font-bold border border-white/20'
                              : 'text-slate-300 hover:bg-[#3F3F3F]/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={p.avatar}
                              alt={p.name}
                              className="w-6 h-6 rounded-full object-cover border shrink-0"
                              style={{ borderColor: p.color }}
                              referrerPolicy="no-referrer"
                            />
                            <span className="truncate">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {p.pin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                            {activeProfile?.id === p.id && <Check className="w-4 h-4 text-red-500" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ecosystem Switcher within Profile Menu */}
                  <div className="pb-2 mb-2 border-b border-[#3F3F3F]">
                    <div className="text-[11px] text-[#AAAAAA] uppercase font-bold tracking-wider px-2 mb-1.5 flex items-center justify-between">
                      <span>Hệ sinh thái Gấu</span>
                      <LayoutGrid className="w-3.5 h-3.5 text-red-500" />
                    </div>
                    <div className="grid grid-cols-3 gap-1 px-1">
                      <button
                        onClick={() => {
                          onSwitchApp('cinema');
                          setIsProfileMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#1f1f1f] hover:bg-[#333] border border-white/5 hover:border-blue-500/40 text-slate-200 transition-all cursor-pointer group"
                      >
                        <Film className="w-4 h-4 text-blue-400 mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-medium leading-tight">Cinema</span>
                      </button>
                      <button
                        onClick={() => {
                          onSwitchApp('livetv');
                          setIsProfileMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#1f1f1f] hover:bg-[#333] border border-white/5 hover:border-orange-500/40 text-slate-200 transition-all cursor-pointer group"
                      >
                        <Tv className="w-4 h-4 text-orange-400 mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-medium leading-tight">LiveTV</span>
                      </button>
                      <button
                        onClick={() => {
                          onSwitchApp('manga');
                          setIsProfileMenuOpen(false);
                        }}
                        className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#1f1f1f] hover:bg-[#333] border border-white/5 hover:border-purple-500/40 text-slate-200 transition-all cursor-pointer group"
                      >
                        <BookOpen className="w-4 h-4 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-medium leading-tight">Manga</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {currentAccount?.role === 'admin' && onOpenAdminDashboard && (
                      <button
                        onClick={() => {
                          onOpenAdminDashboard();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-950/40 transition-colors cursor-pointer text-left"
                      >
                        <Shield className="w-4 h-4 text-amber-400" />
                        <span>Bảng quản trị hệ thống</span>
                      </button>
                    )}
                    {onLogout && (
                      <button
                        onClick={() => {
                          onLogout();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-[#3F3F3F] transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span>Đăng xuất</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TOPIC FILTER PILLS BAR IN NAVBAR HEADER */}
        {selectedVnTopic !== undefined && onSelectVnTopic && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && (
          <div className="px-3 py-1.5 border-t border-[#272727] flex items-center gap-2 overflow-x-auto scrollbar-none max-w-full bg-[#0F0F0F]">
            {VIETNAM_TOPIC_PILLS.map((pill) => {
              const isSelected = selectedVnTopic === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => onSelectVnTopic(pill.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-sm scale-100'
                      : 'bg-[#272727] text-slate-300 hover:bg-[#383838] hover:text-white'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* FULL SCREEN MOBILE SEARCH OVERLAY (<600px) */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-[100] bg-[#0F0F0F] flex flex-col animate-fade-in pt-[env(safe-area-inset-top,0px)]">
          {/* Top Search Bar */}
          <div className="h-14 px-3 flex items-center gap-2 border-b border-[#272727]">
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              className="p-2 rounded-full text-slate-200 hover:bg-[#272727] active:bg-[#383838] transition-colors cursor-pointer shrink-0"
              title="Quay lại"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchSubmit();
              }}
              className="flex items-center flex-1 min-w-0"
            >
              <div className="flex items-center flex-1 bg-[#1e1e1e] rounded-full px-3 py-2 border border-white/10 focus-within:border-[#1c62b9]">
                <input
                  ref={mobileSearchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm trên YouTube..."
                  className="w-full bg-transparent text-white text-sm focus:outline-none placeholder:text-[#AAAAAA]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="text-slate-400 hover:text-white p-1 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>

            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                onOpenVoiceSearch?.();
              }}
              className="p-2 rounded-full bg-[#222222] text-white hover:bg-[#333333] transition-colors cursor-pointer shrink-0"
              title="Tìm kiếm giọng nói"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          {/* Search History & Live Suggestions List in Fullscreen Overlay */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {!searchQuery.trim() ? (
              <>
                <div className="px-3 py-2 text-xs font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center justify-between">
                  <span>Lịch sử tìm kiếm</span>
                  <Clock className="w-4 h-4 text-[#AAAAAA]" />
                </div>
                {searchHistory.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSearchQuery(item);
                      handleSearchSubmit(item);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-[#272727] active:bg-[#333333] cursor-pointer transition-colors text-white text-sm"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <Clock className="w-4 h-4 text-[#AAAAAA] shrink-0" />
                      <span className="truncate">{item}</span>
                    </div>
                    <button
                      onClick={(e) => handleRemoveHistoryItem(item, e)}
                      className="p-1.5 text-[#AAAAAA] hover:text-red-400 cursor-pointer"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center justify-between border-b border-white/5">
                  <span>Gợi ý tìm kiếm</span>
                  <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                </div>
                {suggestions.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSearchQuery(item);
                      handleSearchSubmit(item);
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#272727] active:bg-[#333333] cursor-pointer transition-colors text-white text-sm"
                  >
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold truncate">{item}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* PIN Verification Modal */}
      {pinPromptProfile && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#272727] border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <Lock className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">
              Nhập mã PIN cho hồ sơ "{pinPromptProfile.name}"
            </h3>
            <p className="text-xs text-[#AAAAAA] mb-4">Hồ sơ này đã được bảo vệ bằng mã PIN</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="Nhập PIN..."
                autoFocus
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-center text-xl tracking-widest text-white focus:border-red-500 focus:outline-none"
              />
              {pinError && <p className="text-xs text-red-500 font-semibold">Mã PIN không đúng!</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPinPromptProfile(null)}
                  className="flex-1 bg-[#3F3F3F] text-slate-300 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-red-700"
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
