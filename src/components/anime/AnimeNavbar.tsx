import React, { useEffect, useState } from 'react';
import { Account, UserProfile } from '../../types';
import { appConfigService } from '../../services/appConfigService';
import appLogo from '../../assets/images/app_logo.jpg';
import {
  BookOpen,
  Clapperboard,
  History,
  Home,
  LayoutGrid,
  LogOut,
  PlayCircle,
  Search,
  Tv,
  Youtube,
  Bookmark,
  User,
  ChevronDown,
  Check,
  Shield,
  Lock,
  Settings,
  Sparkles,
} from 'lucide-react';

export type AnimeSection = 'home' | 'browse' | 'continue' | 'history' | 'mylist';

interface AnimeNavbarProps {
  section: AnimeSection;
  onSectionChange: (s: AnimeSection) => void;
  currentAccount: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  appConfig?: { [k: string]: { enabled: boolean; label?: string; description?: string } };
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: 'cinema' | 'manga' | 'livetv' | 'youtube' | 'anime') => void;
  onSwitchProfileScreen: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
  onLogoClick: () => void;
}

const TABS: { key: AnimeSection; label: string; icon: React.ReactNode }[] = [
  { key: 'home', label: 'Trang chủ', icon: <Home className="w-3.5 h-3.5" /> },
  { key: 'browse', label: 'Khám phá', icon: <Search className="w-3.5 h-3.5" /> },
  { key: 'continue', label: 'Đang xem', icon: <PlayCircle className="w-3.5 h-3.5" /> },
  { key: 'mylist', label: 'Bộ sưu tập', icon: <Bookmark className="w-3.5 h-3.5" /> },
  { key: 'history', label: 'Lịch sử', icon: <History className="w-3.5 h-3.5" /> },
];

export const AnimeNavbar: React.FC<AnimeNavbarProps> = ({
  section,
  onSectionChange,
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout,
  onLogoClick,
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<Record<string, { enabled: boolean }>>({});

  useEffect(() => {
    const unsub = appConfigService.subscribe((cfg) => setAppConfig(cfg));
    return unsub;
  }, []);

  const [pinPromptProfile, setPinPromptProfile] = useState<UserProfile | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

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

  // Close menus on outside click / Esc
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#anime-profile-menu') && !target.closest('#anime-profile-trigger')) {
        setIsProfileMenuOpen(false);
      }
      if (!target.closest('#anime-app-menu') && !target.closest('#anime-app-trigger')) {
        setIsAppMenuOpen(false);
      }
      if (!target.closest('#anime-mobile-menu') && !target.closest('#anime-mobile-toggle')) {
        setIsMobileMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileMenuOpen(false);
        setIsAppMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-[#0b0c16]/95 backdrop-blur-md border-b border-amber-900/30 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-6">
          {/* Left: Brand + Tabs */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-1">
            {/* Brand — dùng lại logo giống các app khác */}
            <button
              onClick={onLogoClick}
              className="flex items-center gap-2.5 cursor-pointer focus:outline-none group text-left shrink-0"
              title="Về trang chủ Gấu Anime"
            >
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border-2 border-amber-500/50 shadow-lg shadow-amber-500/20 group-hover:scale-110 group-hover:border-amber-400 transition-all duration-300">
                <img src={appLogo} alt="Gấu Anime Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-amber-600/20 to-transparent" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 drop-shadow-[0_2px_12px_rgba(245,158,11,0.5)] leading-none">
                  Gấu
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-[0.2em] text-amber-400/90 -mt-0.5">
                  ANIME
                </span>
              </div>
            </button>

            {/* Desktop Tabs */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2 text-sm font-medium">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onSectionChange(t.key)}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs lg:text-sm whitespace-nowrap transition-all cursor-pointer ${
                    section === t.key
                      ? 'text-amber-300 font-bold border-b-2 border-amber-500 bg-amber-500/10'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right: App Switcher + Profile + Mobile Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* App Switcher */}
            <div className="relative">
              <button
                id="anime-app-trigger"
                onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-900/60 hover:bg-[#131f37] border border-slate-800/80 hover:border-amber-600/60 text-slate-300 hover:text-amber-300 cursor-pointer transition-all hover:scale-105"
                title="Hệ sinh thái Gấu"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              {isAppMenuOpen && (
                <div
                  id="anime-app-menu"
                  className="absolute right-[-2rem] sm:right-0 top-12 w-72 bg-[#0f172a] border border-amber-900/40 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="text-xs font-bold text-slate-400 mb-2 px-2 tracking-widest">HỆ SINH THÁI</div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onSwitchApp('cinema');
                        setIsAppMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium text-slate-200 hover:bg-blue-900/30 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-900/40 flex items-center justify-center">
                        <Clapperboard className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span>Gấu Cinema</span>
                        <span className="text-[10px] text-slate-400 font-normal">Xem phim online</span>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        if (appConfig.livetv?.enabled !== false) {
                          onSwitchApp('livetv');
                          setIsAppMenuOpen(false);
                        }
                      }}
                      disabled={appConfig.livetv?.enabled === false}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        appConfig.livetv?.enabled === false ? 'opacity-40 cursor-not-allowed text-slate-500' : 'text-slate-200 hover:bg-sky-900/30 hover:text-sky-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-900/40 flex items-center justify-center">
                        <Tv className="w-4 h-4 text-sky-400" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span>Gấu LiveTV</span>
                        <span className="text-[10px] text-slate-400 font-normal">{appConfig.livetv?.enabled === false ? 'Đang bảo trì' : 'Truyền hình & Thể thao'}</span>
                      </div>
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
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        appConfig.manga?.enabled === false ? 'opacity-40 cursor-not-allowed text-slate-500' : 'text-slate-200 hover:bg-purple-900/30 hover:text-purple-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-900/40 flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span>Gấu Manga</span>
                        <span className="text-[10px] text-slate-400 font-normal">{appConfig.manga?.enabled === false ? 'Đang bảo trì' : 'Thế giới truyện tranh'}</span>
                      </div>
                      {appConfig.manga?.enabled === false && <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded-full">OFF</span>}
                    </button>

                    <button
                      onClick={() => {
                        if (appConfig.youtube?.enabled !== false) {
                          onSwitchApp('youtube');
                          setIsAppMenuOpen(false);
                        }
                      }}
                      disabled={appConfig.youtube?.enabled === false}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        appConfig.youtube?.enabled === false ? 'opacity-40 cursor-not-allowed text-slate-500' : 'text-slate-200 hover:bg-red-900/30 hover:text-red-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center">
                        <Youtube className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span>Gấu YouTube</span>
                        <span className="text-[10px] font-normal">{appConfig.youtube?.enabled === false ? <span className="text-slate-400">Đang bảo trì</span> : <span className="text-red-400">Theme Đỏ - 0 Quảng cáo</span>}</span>
                      </div>
                      {appConfig.youtube?.enabled === false && <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded-full">OFF</span>}
                    </button>

                    {/* Current app highlighted */}
                    <div className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-200">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-bold">Gấu Anime</span>
                        <span className="text-[10px] text-amber-300/70 font-normal">Bạn đang ở đây</span>
                      </div>
                      <span className="ml-auto text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded-full border border-amber-500/30">●</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                id="anime-profile-trigger"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-1.5 cursor-pointer focus:outline-none group p-1"
                aria-label="Tài khoản"
              >
                <div
                  className="w-8 h-8 rounded-lg overflow-hidden border-2 shadow-md group-hover:scale-105 transition-transform"
                  style={{ borderColor: activeProfile?.color || '#f59e0b' }}
                >
                  <img
                    src={activeProfile?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                    alt={activeProfile?.name || 'Profile'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileMenuOpen && (
                <div
                  id="anime-profile-menu"
                  className="absolute right-0 top-12 w-64 bg-[#0f172a] border border-amber-900/40 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200"
                >
                  {currentAccount && (
                    <div className="px-2 py-1.5 mb-2 bg-[#131f37] rounded-xl border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">@{currentAccount.username}</span>
                      </div>
                      {currentAccount.role === 'admin' && <span className="text-[9px] bg-red-950 text-red-300 border border-red-800/80 px-1.5 py-0.2 rounded font-bold">ADMIN</span>}
                    </div>
                  )}

                  <div className="pb-3 mb-3 border-b border-slate-800">
                    <div className="text-xs text-amber-400 uppercase font-bold tracking-wider px-2 mb-2">Chuyển hồ sơ ({profiles.length}/5)</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleProfileClickInDropdown(p)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                            activeProfile?.id === p.id ? 'bg-amber-600/20 text-amber-200 font-semibold border border-amber-500/40' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={p.avatar} alt={p.name} className="w-7 h-7 rounded-md object-cover border shrink-0" style={{ borderColor: p.color }} />
                            <span className="truncate">{p.name}</span>
                            {p.isPrimary && <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1 rounded font-bold shrink-0">Chính</span>}
                            {p.isKid && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1 rounded shrink-0">Kids</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {p.pin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                            {activeProfile?.id === p.id && <Check className="w-4 h-4 text-amber-400" />}
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
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm font-bold text-indigo-300 hover:bg-indigo-950/80 hover:text-indigo-200 transition-colors cursor-pointer border border-indigo-900/60"
                      >
                        <Settings className="w-4 h-4 text-indigo-400" />
                        <span>Quản Trị Hệ Thống (Admin)</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onSwitchProfileScreen();
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>Màn hình chọn người xem</span>
                    </button>
                    <button
                      onClick={() => {
                        onSectionChange('history');
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                    >
                      <History className="w-4 h-4 text-slate-400" />
                      <span>Lịch sử xem</span>
                    </button>
                    <button
                      onClick={() => {
                        onSectionChange('mylist');
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                    >
                      <Bookmark className="w-4 h-4 text-slate-400" />
                      <span>Danh sách của tôi</span>
                    </button>
                    {onLogout && (
                      <button
                        onClick={() => {
                          onLogout();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl text-sm text-red-300 hover:bg-red-950/70 hover:text-red-200 transition-colors cursor-pointer border-t border-slate-800/80 mt-1"
                      >
                        <LogOut className="w-4 h-4 text-red-400" />
                        <span>Đăng xuất tài khoản</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Tabs Toggle */}
            <button
              id="anime-mobile-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-full bg-slate-900/60 hover:bg-[#131f37] border border-slate-800/80 text-slate-300 hover:text-amber-300 cursor-pointer transition-all"
              aria-label="Menu"
            >
              <LayoutGrid className={`w-4 h-4 transition-transform ${isMobileMenuOpen ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Tabs Drawer */}
        {isMobileMenuOpen && (
          <div id="anime-mobile-menu" className="md:hidden bg-[#0b0c16] border-t border-amber-900/20 px-4 py-3 space-y-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  onSectionChange(t.key);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                  section === t.key ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* PIN Modal — giống hệt Manga/Cinema */}
      {pinPromptProfile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-amber-900/60 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 border-2 border-amber-500 shadow-lg">
              <img src={pinPromptProfile.avatar} alt={pinPromptProfile.name} className="w-full h-full object-cover" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Nhập mã PIN của {pinPromptProfile.name}</h3>
            <p className="text-xs text-slate-400 mb-6">Hồ sơ này được bảo vệ bằng mã PIN 4 chữ số.</p>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                maxLength={4}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full bg-slate-900 border border-amber-800/40 rounded-xl px-4 py-3 text-center text-2xl tracking-widest text-white focus:outline-none focus:border-amber-500"
              />
              {pinError && <p className="text-xs text-red-400 font-medium">Mã PIN không chính xác. Vui lòng thử lại.</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setPinPromptProfile(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer">
                  Hủy
                </button>
                <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer shadow-lg shadow-amber-600/30">
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
