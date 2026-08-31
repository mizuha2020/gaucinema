import React, { useState } from 'react';
import { Account, UserProfile } from '../types';
import { MangaView } from '../components/manga/MangaView';

interface MangaAppWrapperProps {
  currentAccount: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: 'cinema' | 'manga' | 'livetv' | 'youtube' | 'anime') => void;
  onSwitchProfileScreen: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
}

export const MangaAppWrapper: React.FC<MangaAppWrapperProps> = ({
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout
}) => {
  const [resetKey, setResetKey] = useState(0);
  const handleLogoClick = () => {
    try { localStorage.setItem('gau_manga_active_view', 'home'); } catch {}
    setResetKey(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0b0c16] text-white font-sans selection:bg-purple-600 selection:text-white">
      <MangaView
        key={resetKey}
        activeProfile={activeProfile}
        currentAccount={currentAccount}
        profiles={profiles}
        onSelectProfile={onSelectProfile}
        onSwitchApp={onSwitchApp}
        onSwitchProfileScreen={onSwitchProfileScreen}
        onOpenAdminDashboard={onOpenAdminDashboard}
        onLogout={onLogout}
        onLogoClick={handleLogoClick}
      />
    </div>
  );
};
