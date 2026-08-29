import React, { useState } from 'react';
import { Account, UserProfile } from '../types';
import { MangaView } from '../components/manga/MangaView';
import { MangaNavbar } from '../components/manga/MangaNavbar';

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
    setResetKey(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0b0c16] text-white font-sans selection:bg-purple-600 selection:text-white">
      <MangaNavbar
        currentAccount={currentAccount}
        activeProfile={activeProfile}
        profiles={profiles}
        onSelectProfile={onSelectProfile}
        onSwitchApp={onSwitchApp}
        onSwitchProfileScreen={onSwitchProfileScreen}
        onOpenAdminDashboard={onOpenAdminDashboard}
        onLogout={onLogout}
        onLogoClick={handleLogoClick}
      />
      
      <main className="relative min-h-[calc(100vh-160px)] pb-24 md:pb-16 pt-4">
        <MangaView key={resetKey} activeProfile={activeProfile} currentAccount={currentAccount} />
      </main>
    </div>
  );
};
