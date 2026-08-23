import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, Account } from '../../types';
import {
  Search,
  Youtube,
  LayoutGrid,
  ChevronDown,
  Check,
  Shield,
  Lock,
  LogOut,
  X,
  Tv,
  BookOpen,
  Film,
  Sparkles,
  Flame,
  Clock,
  Bookmark,
  Share2,
  ExternalLink,
} from 'lucide-react';
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
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'music', label: 'Âm nhạc' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'tech', label: 'Công nghệ' },
  { id: 'entertainment', label: 'Giải trí' },
  { id: 'kids', label: 'Thiếu nhi' },
  { id: 'saved', label: 'Đã lưu' },
  { id: 'history', label: 'Lịch sử' },
];

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
  activeCategory,
  onCategoryChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);

  // Profile PIN prompt state
  const [pinPromptProfile, setPinPromptProfile] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    onSearch('');
    if (searchInputRef.current) searchInputRef.current.focus();
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

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0f0a0c]/95 backdrop-blur-md border-b border-red-900/40 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col gap-2.5">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo Brand */}
            <button
              onClick={() => {
                onLogoClick?.();
                onCategoryChange('all');
                setSearchQuery('');
              }}
              className="flex items-center gap-2 cursor-pointer focus:outline-none group shrink-0"
              title="Về trang chủ Gấu YouTube"
            >
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border-2 border-red-600/80 shadow-lg shadow-red-600/30 group-hover:scale-105 transition-all">
                <img src={appLogo} alt="Gấu YouTube Logo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-red-600/30 to-transparent flex items-center justify-center">
                  <Youtube className="w-4 h-4 text-white drop-shadow-md" />
                </div>
              </div>
              <div className="flex flex-col items-start text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
                    Gấu
                  </span>
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-red-500 leading-none">
                    YouTube
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] bg-red-600/30 text-red-300 border border-red-500/50 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                    0 QUẢNG CÁO
                  </span>
                </div>
              </div>
            </button>

            {/* Desktop Search Bar */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center flex-1 max-w-xl mx-4"
            >
              <div className="relative w-full flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm video YouTube hoặc dán link / Video ID..."
                  className="w-full bg-[#181114] text-white text-sm pl-10 pr-9 py-2 rounded-full border border-red-900/50 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all placeholder:text-slate-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="ml-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer shadow-md shadow-red-600/30"
              >
                Tìm
              </button>
            </form>

            {/* Actions: App Switcher & Profile */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* App Switcher */}
              <div className="relative">
                <button
                  onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1e1317] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-slate-300 hover:text-red-300 cursor-pointer transition-all hover:scale-105"
                  title="Chuyển đổi ứng dụng"
                >
                  <LayoutGrid className="w-4 h-4 text-red-400" />
                </button>
                {isAppMenuOpen && (
                  <div className="absolute right-[-2rem] sm:right-0 top-12 w-64 bg-[#140c0f] border border-red-900/80 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95">
                    <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-2 px-2">
                      HỆ SINH THÁI GẤU
                    </div>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          onSwitchApp('cinema');
                          setIsAppMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-blue-950/50 hover:text-blue-300 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-900/40 flex items-center justify-center">
                          <Film className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-bold">Gấu Cinema HD</span>
                          <span className="text-[10px] text-slate-400">Xem phim thả ga</span>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          onSwitchApp('livetv');
                          setIsAppMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-orange-950/50 hover:text-orange-300 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-orange-900/40 flex items-center justify-center">
                          <Tv className="w-4 h-4 text-orange-400" />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-bold">Gấu LiveTV</span>
                          <span className="text-[10px] text-slate-400">Truyền hình trực tiếp</span>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          onSwitchApp('manga');
                          setIsAppMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-purple-950/50 hover:text-purple-300 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-900/40 flex items-center justify-center">
                          <BookOpen className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-bold">Gấu Manga</span>
                          <span className="text-[10px] text-slate-400">Thế giới truyện tranh</span>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setIsAppMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-bold text-red-300 bg-red-950/60 border border-red-600/50"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
                          <Youtube className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span>Gấu YouTube (Đang chọn)</span>
                          <span className="text-[10px] text-red-400">0 Quảng cáo</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* User Profile Menu */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center gap-1.5 cursor-pointer focus:outline-none group p-1"
                >
                  <div
                    className="w-8 h-8 rounded-lg overflow-hidden border-2 border-red-500 shadow-md group-hover:scale-105 transition-transform"
                    style={{ borderColor: activeProfile?.color || '#ef4444' }}
                  >
                    <img
                      src={activeProfile?.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${
                      isProfileMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-12 w-64 bg-[#140c0f] border border-red-900/80 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95">
                    {currentAccount && (
                      <div className="px-2 py-1.5 mb-2 bg-[#1a0f12] rounded-xl border border-red-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />
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

                    <div className="pb-3 mb-3 border-b border-red-900/40">
                      <div className="text-[11px] text-red-400 uppercase font-bold tracking-wider px-2 mb-2">
                        Chuyển hồ sơ ({profiles.length}/5)
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {profiles.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleProfileClickInDropdown(p)}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                              activeProfile?.id === p.id
                                ? 'bg-red-600/20 text-red-300 font-semibold border border-red-500/40'
                                : 'text-slate-300 hover:bg-red-950/40 hover:text-white'
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
                                <span className="text-[9px] bg-red-950 text-red-300 px-1 rounded font-bold shrink-0">
                                  Chính
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              {p.pin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                              {activeProfile?.id === p.id && (
                                <Check className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {currentAccount?.role === 'admin' && onOpenAdminDashboard && (
                        <button
                          onClick={() => {
                            onOpenAdminDashboard();
                            setIsProfileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-amber-300 hover:bg-amber-950/40 transition-colors cursor-pointer"
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
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/60 transition-colors cursor-pointer"
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

          {/* Mobile Search Input */}
          <form onSubmit={handleSearchSubmit} className="md:hidden flex items-center w-full">
            <div className="relative w-full flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm video hoặc dán link YouTube..."
                className="w-full bg-[#181114] text-white text-xs pl-9 pr-8 py-2 rounded-full border border-red-900/50 focus:border-red-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Categories Horizontal Scroll Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40 border border-red-500'
                    : 'bg-[#1a1013] text-slate-300 hover:bg-red-950/60 hover:text-white border border-red-900/30'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* PIN Verification Modal */}
      {pinPromptProfile && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#180f12] border border-red-600/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <Lock className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">
              Nhập mã PIN cho hồ sơ "{pinPromptProfile.name}"
            </h3>
            <p className="text-xs text-slate-400 mb-4">Hồ sơ này đã được bảo vệ bằng mã PIN</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                placeholder="Nhập PIN..."
                autoFocus
                className="w-full bg-black/60 border border-red-900 rounded-xl px-4 py-2.5 text-center text-xl tracking-widest text-white focus:border-red-500 focus:outline-none"
              />
              {pinError && <p className="text-xs text-red-500 font-semibold">Mã PIN không đúng!</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPinPromptProfile(null)}
                  className="flex-1 bg-slate-800 text-slate-300 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-700"
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
