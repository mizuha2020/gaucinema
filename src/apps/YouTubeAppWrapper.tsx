import React, { useState } from 'react';
import { Account, UserProfile } from '../types';
import { YouTubeNavbar } from '../components/youtube/YouTubeNavbar';
import { YouTubeView } from '../components/youtube/YouTubeView';

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

export type GauYtCategory = 'home' | 'trending' | 'saved' | 'history';

const YT_CATEGORY_KEY = 'gau_yt_active_category';

const loadInitialCategory = (): GauYtCategory => {
  try {
    const saved = localStorage.getItem(YT_CATEGORY_KEY);
    if (saved === 'home' || saved === 'trending' || saved === 'saved' || saved === 'history') {
      return saved;
    }
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
  const [activeCategory, setActiveCategory] = useState<GauYtCategory>(loadInitialCategory);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat as GauYtCategory);
    try {
      localStorage.setItem(YT_CATEGORY_KEY, cat);
    } catch {
      // Ignore
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogoClick = () => {
    setResetKey((prev) => prev + 1);
    setSearchQuery('');
    handleCategoryChange('home');
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0a0608] text-white font-sans selection:bg-red-600 selection:text-white">
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
        />
      )}

      <main className="relative min-h-[calc(100vh-160px)]">
        <YouTubeView
          key={resetKey}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          searchQuery={searchQuery}
          activeCategory={activeCategory}
          onChannelViewChange={setIsChannelViewOpen}
        />
      </main>
    </div>
  );
};
