import React from 'react';
import {
  Home,
  Smartphone,
  Tv,
  History,
  Clock,
  ThumbsUp,
  Video,
  ListVideo,
  Settings,
  Film,
  BookOpen,
  Sparkles,
  Flame,
  Music,
  Gamepad2,
  Newspaper,
  Trophy,
  Compass,
  CheckCircle2,
  Radio,
  User,
  ChevronRight,
} from 'lucide-react';
import { YouTubeChannel } from '../../types';

export type YouTubeTab =
  | 'home'
  | 'shorts'
  | 'subscriptions'
  | 'library'
  | 'history'
  | 'your_videos'
  | 'watch_later'
  | 'liked'
  | 'trending'
  | 'music'
  | 'gaming'
  | 'news'
  | 'sports';

interface YouTubeSidebarProps {
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  subscribedChannels?: YouTubeChannel[];
  onSelectChannel?: (channel: YouTubeChannel) => void;
  onSwitchApp?: (app: 'cinema' | 'manga' | 'livetv' | 'youtube') => void;
}

export const YouTubeSidebar: React.FC<YouTubeSidebarProps> = ({
  activeCategory = 'home',
  onSelectCategory,
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
  subscribedChannels = [],
  onSelectChannel,
  onSwitchApp,
}) => {
  const isExpanded = !collapsed;

  const handleItemClick = (cat: string) => {
    onSelectCategory?.(cat);
    onCloseMobile?.();
  };

  const navItemsMain = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'shorts', label: 'Shorts', icon: Smartphone },
    { id: 'subscriptions', label: 'Kênh đăng ký', icon: Tv },
  ];

  const navItemsLibrary = [
    { id: 'history', label: 'Lịch sử đã xem', icon: History },
    { id: 'watch_later', label: 'Xem sau', icon: Clock },
    { id: 'liked', label: 'Video đã thích', icon: ThumbsUp },
    { id: 'your_videos', label: 'Video của bạn', icon: Video },
  ];

  const navItemsExplore = [
    { id: 'trending', label: 'Thịnh hành', icon: Flame },
    { id: 'music', label: 'Âm nhạc', icon: Music },
    { id: 'gaming', label: 'Trò chơi', icon: Gamepad2 },
    { id: 'news', label: 'Tin tức 24h', icon: Newspaper },
    { id: 'sports', label: 'Thể thao', icon: Trophy },
  ];

  const renderCollapsedItem = (item: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const Icon = item.icon;
    const isActive = activeCategory === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleItemClick(item.id)}
        className={`w-full flex flex-col items-center justify-center py-3 px-1 rounded-xl transition-colors cursor-pointer ${
          isActive
            ? 'bg-[#272727] text-white font-bold'
            : 'text-[#AAAAAA] hover:bg-[#272727]/60 hover:text-white'
        }`}
        title={item.label}
      >
        <Icon className={`w-5 h-5 mb-1 ${isActive ? 'text-[#FF0000]' : ''}`} />
        <span className="text-[10px] truncate max-w-full tracking-tight">{item.label}</span>
      </button>
    );
  };

  const renderExpandedItem = (item: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const Icon = item.icon;
    const isActive = activeCategory === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleItemClick(item.id)}
        className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
          isActive
            ? 'bg-[#272727] text-white font-bold'
            : 'text-slate-200 hover:bg-[#272727]/70 hover:text-white'
        }`}
      >
        <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#FF0000]' : 'text-slate-300'}`} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 py-3 px-2 text-white">
      <div className="space-y-4">
        {/* Main Nav Section */}
        <div className="space-y-0.5">
          {navItemsMain.map((item) =>
            isExpanded ? renderExpandedItem(item) : renderCollapsedItem(item)
          )}
        </div>

        {/* Divider */}
        {isExpanded && <div className="border-t border-[#272727] my-2" />}

        {/* Library Section */}
        {isExpanded ? (
          <div className="space-y-0.5">
            <div
              className="px-3 py-1 text-xs font-bold text-white flex items-center justify-between cursor-pointer hover:text-red-400"
              onClick={() => handleItemClick('saved')}
            >
              <span>Bạn</span>
              <ChevronRight className="w-4 h-4 text-[#AAAAAA]" />
            </div>
            {navItemsLibrary.map((item) => renderExpandedItem(item))}
          </div>
        ) : (
          <div className="space-y-0.5 border-t border-[#272727] pt-2">
            {renderCollapsedItem({ id: 'saved', label: 'Bạn', icon: User })}
            {renderCollapsedItem({ id: 'history', label: 'Lịch sử', icon: History })}
          </div>
        )}

        {/* Divider */}
        {isExpanded && <div className="border-t border-[#272727] my-2" />}

        {/* Subscriptions Channels Section (Expanded only) */}
        {isExpanded && (
          <div className="space-y-1">
            <div className="px-3 py-1 text-xs font-bold text-[#AAAAAA] uppercase tracking-wider">
              Kênh đã đăng ký ({subscribedChannels.length})
            </div>
            {subscribedChannels.length === 0 ? (
              <p className="px-3 text-[11px] text-[#AAAAAA]">Chưa đăng ký kênh nào</p>
            ) : (
              subscribedChannels.slice(0, 8).map((chan) => (
                <button
                  key={chan.id || chan.title}
                  onClick={() => {
                    onSelectChannel?.(chan);
                    onCloseMobile?.();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-[#272727] hover:text-white transition-colors cursor-pointer text-left"
                >
                  <img
                    src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=FF0000&color=fff&bold=true`}
                    alt={chan.title}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-white/10"
                  />
                  <span className="truncate flex-1 font-medium">{chan.title}</span>
                  <span className="w-2 h-2 rounded-full bg-[#FF0000] shrink-0" />
                </button>
              ))
            )}
          </div>
        )}

        {/* Divider */}
        {isExpanded && <div className="border-t border-[#272727] my-2" />}

        {/* Explore Section */}
        {isExpanded && (
          <div className="space-y-0.5">
            <div className="px-3 py-1 text-xs font-bold text-[#AAAAAA] uppercase tracking-wider">
              Khám phá
            </div>
            {navItemsExplore.map((item) => renderExpandedItem(item))}
          </div>
        )}

        {/* Ecosystem Apps Switcher */}
        {isExpanded && (
          <>
            <div className="border-t border-[#272727] my-2" />
            <div className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-bold text-[#FF0000] uppercase tracking-wider">
                Dịch vụ Gấu Systems
              </div>
              <button
                onClick={() => onSwitchApp?.('cinema')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-[#272727] hover:text-blue-400 transition-colors cursor-pointer"
              >
                <Film className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate">Gấu Cinema HD</span>
              </button>
              <button
                onClick={() => onSwitchApp?.('livetv')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-[#272727] hover:text-orange-400 transition-colors cursor-pointer"
              >
                <Tv className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="truncate">Gấu LiveTV</span>
              </button>
              <button
                onClick={() => onSwitchApp?.('manga')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-[#272727] hover:text-purple-400 transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="truncate">Gấu Manga</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer Disclaimer */}
      {isExpanded && (
        <div className="pt-4 border-t border-[#272727] px-3 text-[10px] text-[#AAAAAA] space-y-1 leading-snug">
          <p>© 2026 Gấu YouTube VN</p>
          <p>Trải nghiệm 0 quảng cáo thương mại</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`fixed top-14 left-0 bottom-0 z-40 bg-[#0F0F0F] border-r border-[#272727] transition-all duration-300 hidden md:block ${
          isExpanded ? 'w-[240px]' : 'w-[72px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[110] md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
          />

          {/* Drawer Sidebar */}
          <div className="relative w-64 bg-[#0F0F0F] h-full border-r border-[#272727] shadow-2xl z-10 animate-slide-in-left">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
