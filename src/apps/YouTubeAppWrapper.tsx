import React, { useState, useEffect, useCallback } from 'react';
import { Account, UserProfile, YouTubeVideo, YouTubeChannel } from '../types';
import { YouTubeNavbar } from '../components/youtube/YouTubeNavbar';
import { YouTubeSidebar } from '../components/youtube/YouTubeSidebar';
import { YouTubeBottomNav } from '../components/youtube/YouTubeBottomNav';
import { YouTubeView } from '../components/youtube/YouTubeView';
import { YouTubeShortsView } from '../components/youtube/YouTubeShortsView';
import { VoiceSearchModal } from '../components/youtube/VoiceSearchModal';
import { YouTubeCreateModal } from '../components/youtube/YouTubeCreateModal';
import { YouTubeShareModal } from '../components/youtube/YouTubeShareModal';
import { youtubeApi } from '../services/youtubeApi';
import { youtubeSubscriptionService } from '../services/youtubeSubscriptionService';
import { CheckCircle2 } from 'lucide-react';

interface YouTubeAppWrapperProps {
  currentAccount: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: 'cinema' | 'manga' | 'livetv' | 'youtube') => void;
  onSwitchProfileScreen: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
}

const YT_CATEGORY_KEY = 'gau_yt_active_category';

const loadInitialCategory = (): string => {
  try {
    const saved = localStorage.getItem(YT_CATEGORY_KEY);
    if (saved) return saved;
  } catch {
    // Ignore
  }
  return 'home';
};

export const YouTubeAppWrapper: React.FC<YouTubeAppWrapperProps> = ({
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout,
}) => {
  const [resetKey, setResetKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isChannelViewOpen, setIsChannelViewOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(loadInitialCategory);
  const [selectedSidebarChannel, setSelectedSidebarChannel] = useState<YouTubeChannel | null>(null);

  // Subscribed Channels State
  const [subscribedChannels, setSubscribedChannels] = useState<YouTubeChannel[]>(() =>
    youtubeSubscriptionService.getSubscribedChannels(activeProfile?.id)
  );

  useEffect(() => {
    const refreshSubs = () => {
      setSubscribedChannels(youtubeSubscriptionService.getSubscribedChannels(activeProfile?.id));
    };
    refreshSubs();
    window.addEventListener('gau_yt_subscriptions_updated', refreshSubs);
    return () => window.removeEventListener('gau_yt_subscriptions_updated', refreshSubs);
  }, [activeProfile?.id]);

  // Sidebar States (auto-collapsed on 960-1280px, expanded > 1280px, drawer < 960px)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1280;
    }
    return false;
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1280) {
        // large desktop -> expanded by default if not manually overridden
      } else if (window.innerWidth >= 960) {
        // desktop 961 - 1280px -> mini rail
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modals & Overlay States
  const [showVoiceSearch, setShowVoiceSearch] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [shareVideoTarget, setShareVideoTarget] = useState<YouTubeVideo | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Shorts state
  const [shortsList, setShortsList] = useState<YouTubeVideo[]>([]);
  const [isLoadingShorts, setIsLoadingShorts] = useState(false);

  const [selectedVnTopic, setSelectedVnTopic] = useState<string>('all');
  const showTopicPills = !searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setSearchQuery('');
    setSelectedSidebarChannel(null);
    setIsChannelViewOpen(false);
    try {
      localStorage.setItem(YT_CATEGORY_KEY, cat);
    } catch {
      // Ignore
    }

    if (cat === 'shorts' && shortsList.length === 0) {
      loadShorts();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadShorts = async () => {
    setIsLoadingShorts(true);
    try {
      const items = await youtubeApi.getTrending('shorts');
      setShortsList(items);
    } catch {
      // Fallback trending
      const fallback = await youtubeApi.getTrending('all');
      setShortsList(fallback);
    } finally {
      setIsLoadingShorts(false);
    }
  };

  const handleLogoClick = () => {
    setResetKey((prev) => prev + 1);
    setSearchQuery('');
    setSelectedSidebarChannel(null);
    setIsChannelViewOpen(false);
    handleCategoryChange('home');
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (activeCategory === 'shorts') {
      setActiveCategory('home');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#FFFFFF] font-sans selection:bg-[#FF0000] selection:text-white flex flex-col">
      {/* Fixed Top Header */}
      {!isChannelViewOpen && (
        <YouTubeNavbar
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          profiles={profiles}
          onSelectProfile={onSelectProfile}
          onSwitchApp={onSwitchApp}
          onSwitchProfileScreen={onSwitchProfileScreen}
          onOpenAdminDashboard={onOpenAdminDashboard}
          onLogout={onLogout}
          onLogoClick={handleLogoClick}
          onSearch={handleSearch}
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
          selectedVnTopic={selectedVnTopic}
          onSelectVnTopic={setSelectedVnTopic}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenVoiceSearch={() => setShowVoiceSearch(true)}
          onOpenCreateModal={() => setShowCreateModal(true)}
        />
      )}

      {/* Main Container with Sidebar + Content */}
      <div
        className={`flex flex-1 ${
          isChannelViewOpen
            ? 'pt-0'
            : showTopicPills
            ? 'pt-[calc(96px+env(safe-area-inset-top,0px))]'
            : 'pt-[calc(56px+env(safe-area-inset-top,0px))]'
        }`}
      >
        {/* Persistent Left Sidebar */}
        {!isChannelViewOpen && (
          <YouTubeSidebar
            activeCategory={activeCategory}
            onSelectCategory={handleCategoryChange}
            onSelectChannel={(chan) => {
              setSelectedSidebarChannel(chan);
              setIsChannelViewOpen(true);
            }}
            collapsed={sidebarCollapsed}
            mobileOpen={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
            subscribedChannels={subscribedChannels}
            onSwitchApp={onSwitchApp}
          />
        )}

        {/* Content Area */}
        <main
          className={`flex-1 transition-all duration-300 min-h-[calc(100vh-56px-env(safe-area-inset-top,0px))] pb-[calc(64px+env(safe-area-inset-bottom,0px))] lg:pb-0 ${
            !isChannelViewOpen
              ? sidebarCollapsed
                ? 'lg:ml-[72px]'
                : 'lg:ml-[240px]'
              : 'ml-0'
          }`}
        >
          {activeCategory === 'shorts' ? (
            <YouTubeShortsView
              shortsList={shortsList}
              onShowToast={showToast}
              onShareVideo={(v) => setShareVideoTarget(v)}
            />
          ) : (
            <YouTubeView
              key={resetKey}
              currentAccount={currentAccount}
              activeProfile={activeProfile}
              searchQuery={searchQuery}
              activeCategory={activeCategory}
              selectedVnTopic={selectedVnTopic}
              selectedChannel={selectedSidebarChannel}
              onClearSelectedChannel={() => setSelectedSidebarChannel(null)}
              onSelectVnTopic={setSelectedVnTopic}
              onChannelViewChange={setIsChannelViewOpen}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <YouTubeBottomNav
        activeCategory={activeCategory}
        onSelectCategory={handleCategoryChange}
        onOpenCreateModal={() => setShowCreateModal(true)}
        activeProfile={activeProfile}
        profiles={profiles}
        onSelectProfile={onSelectProfile}
        onSwitchProfileScreen={onSwitchProfileScreen}
        onSwitchApp={onSwitchApp}
      />

      {/* Voice Search Modal */}
      {showVoiceSearch && (
        <VoiceSearchModal
          onClose={() => setShowVoiceSearch(false)}
          onSearchResult={(term) => {
            handleSearch(term);
            showToast(`Đang tìm kiếm bằng giọng nói: "${term}"`);
          }}
        />
      )}

      {/* Create / Upload Video Modal */}
      {showCreateModal && (
        <YouTubeCreateModal
          onClose={() => setShowCreateModal(false)}
          onVideoCreated={(newVid) => {
            showToast(`Đã tải lên video thành công: "${newVid.title}"!`);
            handleCategoryChange('home');
          }}
        />
      )}

      {/* Share Video Modal */}
      {shareVideoTarget && (
        <YouTubeShareModal
          video={shareVideoTarget}
          onClose={() => setShareVideoTarget(null)}
          onShowToast={showToast}
        />
      )}

      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="fixed bottom-8 right-8 z-[120] bg-[#272727] border border-[#3F3F3F] text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
