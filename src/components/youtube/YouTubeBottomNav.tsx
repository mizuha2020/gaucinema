import React, { useState } from 'react';
import { Home, Sparkles, Tv, Radio, User, Bookmark, LayoutGrid, Film, BookOpen, Clock, Heart, Check, Lock, ChevronRight, X } from 'lucide-react';
import { UserProfile } from '../../types';

interface YouTubeBottomNavProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onOpenCreateModal: () => void;
  activeProfile: UserProfile | null;
  profiles?: UserProfile[];
  onSelectProfile?: (profile: UserProfile) => void;
  onSwitchProfileScreen?: () => void;
  onSwitchApp?: (app: 'cinema' | 'manga' | 'livetv' | 'youtube') => void;
}

export const YouTubeBottomNav: React.FC<YouTubeBottomNavProps> = ({
  activeCategory,
  onSelectCategory,
  onOpenCreateModal,
  activeProfile,
  profiles = [],
  onSelectProfile,
  onSwitchProfileScreen,
  onSwitchApp,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile Drawer for Profile & Ecosystem Switcher */}
      {isDrawerOpen && (
        <div
          id="yt-mobile-ecosystem-backdrop"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            id="yt-mobile-ecosystem-sheet"
            className="bg-[#181818] border-t border-[#333333] rounded-t-3xl p-5 bottom-nav-safe space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Handle */}
            <div className="w-12 h-1.5 bg-[#444] rounded-full mx-auto" />

            {/* Current Active Profile Banner */}
            <div className="flex items-center justify-between p-3 bg-[#222] rounded-2xl border border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-xl overflow-hidden border-2 shadow-md shrink-0"
                  style={{ borderColor: activeProfile?.color || '#FF0000' }}
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
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <span>{activeProfile?.name || 'Người xem'}</span>
                    {activeProfile?.isKid && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/40">
                        Kids
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-red-400 font-medium truncate">Đang xem trên Gấu YouTube VN</p>
                </div>
              </div>

              {onSwitchProfileScreen && (
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    onSwitchProfileScreen();
                  }}
                  className="text-xs bg-[#333] hover:bg-[#444] text-slate-200 px-3 py-1.5 rounded-lg border border-white/10 shrink-0 cursor-pointer font-medium"
                >
                  Đổi hồ sơ
                </button>
              )}
            </div>

            {/* Ecosystem Switcher Cards */}
            {onSwitchApp && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-red-500 uppercase tracking-wider px-1 flex items-center justify-between">
                  <span>HỆ SINH THÁI GẤU ENTERTAINMENT</span>
                  <LayoutGrid className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onSwitchApp('cinema');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#222] hover:bg-[#2c2c2c] border border-white/5 hover:border-blue-500/50 text-slate-200 transition-all cursor-pointer group shadow-sm active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-500/30 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform shadow-inner">
                      <Film className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Gấu Cinema</span>
                    <span className="text-[9px] text-blue-400">Xem phim HD</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onSwitchApp('livetv');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#222] hover:bg-[#2c2c2c] border border-white/5 hover:border-orange-500/50 text-slate-200 transition-all cursor-pointer group shadow-sm active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-500/30 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform shadow-inner">
                      <Tv className="w-5 h-5 text-orange-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Gấu LiveTV</span>
                    <span className="text-[9px] text-orange-400">Truyền hình</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onSwitchApp('manga');
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#222] hover:bg-[#2c2c2c] border border-white/5 hover:border-purple-500/50 text-slate-200 transition-all cursor-pointer group shadow-sm active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform shadow-inner">
                      <BookOpen className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Gấu Manga</span>
                    <span className="text-[9px] text-purple-400">Đọc truyện</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Profile Switching if multiple profiles */}
            {profiles.length > 1 && onSelectProfile && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Chuyển hồ sơ nhanh
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {profiles.map((p) => {
                    const isSelected = p.id === activeProfile?.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          onSelectProfile(p);
                          setIsDrawerOpen(false);
                        }}
                        className={`flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#2a2a2a] border-red-500/60 text-white font-bold'
                            : 'bg-[#222] border-white/5 text-slate-300 hover:bg-[#2a2a2a]'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg overflow-hidden border shrink-0"
                          style={{ borderColor: p.color }}
                        >
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-xs truncate flex-1">{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Navigation Shortcuts */}
            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => {
                  onSelectCategory('saved');
                  setIsDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeCategory === 'saved'
                    ? 'bg-red-950/40 text-red-300 border border-red-500/30'
                    : 'bg-[#222] text-slate-200 hover:bg-[#2c2c2c]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bookmark className="w-4 h-4 text-red-500" />
                  <span>Video đã lưu & Yêu thích</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => {
                  onSelectCategory('history');
                  setIsDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeCategory === 'history'
                    ? 'bg-red-950/40 text-red-300 border border-red-500/30'
                    : 'bg-[#222] text-slate-200 hover:bg-[#2c2c2c]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>Lịch sử xem YouTube</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="w-full py-3 bg-[#262626] hover:bg-[#333] text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Đóng menu
            </button>
          </div>
        </div>
      )}

      {/* Floating / Fixed Bottom Bar for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-md border-t border-[#272727] px-1 sm:px-3 py-1 flex items-center justify-around lg:hidden pb-[calc(6px+env(safe-area-inset-bottom,0px))] select-none shadow-2xl">
        {/* 1. Home */}
        <button
          onClick={() => onSelectCategory('home')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeCategory === 'home' || activeCategory === 'all'
              ? 'text-white font-bold'
              : 'text-[#AAAAAA] hover:text-slate-200'
          }`}
        >
          <Home
            className={`w-5 h-5 ${
              activeCategory === 'home' || activeCategory === 'all'
                ? 'fill-current text-white'
                : ''
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight">Trang chủ</span>
        </button>

        {/* 2. Shorts */}
        <button
          onClick={() => onSelectCategory('shorts')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeCategory === 'shorts'
              ? 'text-white font-bold'
              : 'text-[#AAAAAA] hover:text-slate-200'
          }`}
        >
          <Sparkles
            className={`w-5 h-5 ${
              activeCategory === 'shorts' ? 'fill-current text-red-500' : ''
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight">Shorts</span>
        </button>

        {/* 3. Subscriptions */}
        <button
          onClick={() => onSelectCategory('subscriptions')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeCategory === 'subscriptions'
              ? 'text-white font-bold'
              : 'text-[#AAAAAA] hover:text-slate-200'
          }`}
        >
          <Tv
            className={`w-5 h-5 ${
              activeCategory === 'subscriptions' ? 'text-red-500' : ''
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight">Kênh đ.ký</span>
        </button>

        {/* 4. Trending / Live */}
        <button
          onClick={() => onSelectCategory('trending')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeCategory === 'trending'
              ? 'text-white font-bold'
              : 'text-[#AAAAAA] hover:text-slate-200'
          }`}
        >
          <Radio
            className={`w-5 h-5 ${
              activeCategory === 'trending' ? 'text-red-500 animate-pulse' : ''
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight">Thịnh hành</span>
        </button>

        {/* 5. You / Library / Ecosystem */}
        <button
          onClick={() => {
            if (activeCategory === 'saved' || activeCategory === 'history') {
              setIsDrawerOpen(true);
            } else {
              onSelectCategory('saved');
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setIsDrawerOpen(true);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeCategory === 'saved' ||
            activeCategory === 'history' ||
            activeCategory === 'watch_later' ||
            activeCategory === 'liked' ||
            isDrawerOpen
              ? 'text-white font-bold'
              : 'text-[#AAAAAA] hover:text-slate-200'
          }`}
        >
          {activeProfile?.avatar ? (
            <img
              src={activeProfile.avatar}
              alt={activeProfile.name}
              className={`w-5 h-5 rounded-full object-cover border ${
                activeCategory === 'saved' ||
                activeCategory === 'history' ||
                activeCategory === 'watch_later' ||
                isDrawerOpen
                  ? 'border-red-500 ring-2 ring-red-500/40'
                  : 'border-white/20'
              }`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <User className="w-5 h-5" />
          )}
          <span className="text-[10px] mt-0.5 tracking-tight">
            {activeProfile?.name ? activeProfile.name.split(' ')[0] : 'Bạn'}
          </span>
        </button>
      </nav>
    </>
  );
};

