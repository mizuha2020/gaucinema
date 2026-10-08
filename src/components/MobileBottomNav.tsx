import React, { useState } from 'react';
import { NavTab, UserProfile } from '../types';
import { Home, Tv, Film, Search, User, Bookmark, Clock, Check, Layers, Download, HardDrive } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchProfileScreen: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchProfileScreen,
}) => {
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const isNativeApp = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

  const navButtons = isNativeApp ? [
    {
      tab: 'home' as NavTab,
      label: 'Trang Chủ',
      icon: Home,
    },
    {
      tab: 'offline' as NavTab,
      label: 'Đã Lưu',
      icon: HardDrive,
    },
    {
      tab: 'filter' as NavTab,
      label: 'Tìm / Lọc',
      icon: Search,
    },
    {
      tab: 'single' as NavTab,
      label: 'Phim Lẻ',
      icon: Film,
    },
  ] : [
    {
      tab: 'home' as NavTab,
      label: 'Trang Chủ',
      icon: Home,
    },
    {
      tab: 'series' as NavTab,
      label: 'Phim Bộ',
      icon: Tv,
    },
    {
      tab: 'single' as NavTab,
      label: 'Phim Lẻ',
      icon: Film,
    },
    {
      tab: 'filter' as NavTab,
      label: 'Tìm / Lọc',
      icon: Search,
    },
  ];

  return (
    <>
      {/* Mobile Profile & Account Drawer */}
      {isProfileDrawerOpen && (
        <div
          id="mobile-profile-backdrop"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end md:hidden animate-in fade-in duration-200"
          onClick={() => setIsProfileDrawerOpen(false)}
        >
          <div
            id="mobile-profile-sheet"
            className="bg-[#0f172a] border-t border-blue-900/80 rounded-t-3xl p-5 bottom-nav-safe space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Handle */}
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto" />

            {/* Current Active Profile Banner */}
            <div className="flex items-center justify-between p-3 bg-[#131f37] rounded-2xl border border-blue-900/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl overflow-hidden border-2 shadow-md shrink-0"
                  style={{ borderColor: activeProfile?.color || '#2563EB' }}
                >
                  <img
                    src={
                      activeProfile?.avatar ||
                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
                    }
                    alt={activeProfile?.name || 'User'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{activeProfile?.name || 'Người xem'}</span>
                  </h4>
                  <p className="text-xs text-sky-400">Đang hoạt động trên Gấu Cinema</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsProfileDrawerOpen(false);
                  onSwitchProfileScreen();
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                Đổi hồ sơ
              </button>
            </div>

            {/* Quick Profile Switching */}
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                Chuyển nhanh người dùng (5 Users):
              </p>
              <div className="grid grid-cols-5 gap-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProfile(p);
                      setIsProfileDrawerOpen(false);
                    }}
                    className="flex flex-col items-center gap-1 p-1 cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                        activeProfile?.id === p.id
                          ? 'scale-105 shadow-md shadow-blue-500/40 ring-2 ring-sky-400'
                          : 'opacity-70'
                      }`}
                      style={{ borderColor: p.color }}
                    >
                      <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      {activeProfile?.id === p.id && (
                        <div className="absolute inset-0 bg-blue-600/30 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-300 font-medium truncate w-full text-center">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Navigation Links */}
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  onTabChange('my-list');
                  setIsProfileDrawerOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm font-medium transition-colors ${
                  activeTab === 'my-list'
                    ? 'bg-blue-600/25 text-sky-300 border border-blue-500/40'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-5 h-5 text-sky-400" />
                <span>Danh sách phim đã lưu của tôi</span>
              </button>

              {isNativeApp && (
                <button
                  onClick={() => {
                    onTabChange('offline');
                    setIsProfileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm font-medium transition-colors border ${
                    activeTab === 'offline'
                      ? 'bg-amber-600/25 text-amber-300 border-amber-500/40'
                      : 'text-amber-300 hover:bg-amber-950/30 border-amber-900/30'
                  }`}
                >
                  <HardDrive className="w-5 h-5 text-amber-400" />
                  <span>Đã Lưu Offline (7 ngày)</span>
                </button>
              )}

              <button
                onClick={() => {
                  onTabChange('history');
                  setIsProfileDrawerOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-blue-600/25 text-sky-300 border border-blue-500/40'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Clock className="w-5 h-5 text-indigo-400" />
                <span>Lịch sử xem & Tiến độ phát</span>
              </button>

              <button
                onClick={() => {
                  onTabChange('anime');
                  setIsProfileDrawerOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm font-medium transition-colors ${
                  activeTab === 'anime'
                    ? 'bg-blue-600/25 text-sky-300 border border-blue-500/40'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-5 h-5 text-teal-400" />
                <span>Kho Anime & Phim Hoạt Hình</span>
              </button>
            </div>

            <button
              onClick={() => setIsProfileDrawerOpen(false)}
              className="w-full py-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-semibold"
            >
              Đóng menu
            </button>
          </div>
        </div>
      )}

      {/* Floating / Fixed Bottom Bar for Mobile & Compact Tablets */}
      <div
        id="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b1329]/95 backdrop-blur-xl border-t border-blue-900/60 bottom-nav-safe md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
      >
        <div className="grid grid-cols-5 items-center h-14 px-1">
          {navButtons.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                id={`mobile-tab-${item.tab}`}
                onClick={() => onTabChange(item.tab)}
                className={`flex flex-col items-center justify-center h-full min-h-[44px] cursor-pointer focus:outline-none transition-all ${
                  isActive ? 'text-sky-300 scale-105' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`p-1 rounded-full transition-all ${
                    isActive ? 'bg-blue-600/30 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold text-sky-300' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Profile / Account Tab */}
          <button
            id="mobile-tab-profile"
            onClick={() => setIsProfileDrawerOpen(true)}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] cursor-pointer focus:outline-none transition-all ${
              activeTab === 'my-list' || activeTab === 'history' || isProfileDrawerOpen
                ? 'text-sky-300 scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className="w-6 h-6 rounded-full overflow-hidden border transition-all"
              style={{ borderColor: activeProfile?.color || '#38BDF8' }}
            >
              <img
                src={
                  activeProfile?.avatar ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'
                }
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <span
              className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[50px] ${
                activeTab === 'my-list' || activeTab === 'history' || isProfileDrawerOpen
                  ? 'font-bold text-sky-300'
                  : 'font-medium'
              }`}
            >
              {activeProfile?.name ? activeProfile.name.split(' ')[0] : 'Cá Nhân'}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};
