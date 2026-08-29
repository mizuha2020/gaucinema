import React, { useState } from 'react';
import { Account, UserProfile } from '../types';
import { AnimeView } from '../components/anime/AnimeView';
import { AnimeNavbar, AnimeSection } from '../components/anime/AnimeNavbar';
import { AnimeDetailView } from '../components/anime/AnimeDetail';
import { AnimeHome } from '../components/anime/AnimeHome';
import { AnimeListsView } from '../components/anime/AnimeListsView';
import { UserActivityItem } from '../types';

type SortKey = 'POPULARITY' | 'UPDATED_AT' | 'START_DATE';

interface AnimeAppWrapperProps {
  currentAccount: Account | null;
  activeProfile: UserProfile | null;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onSwitchApp: (app: 'cinema' | 'manga' | 'livetv' | 'youtube' | 'anime') => void;
  onSwitchProfileScreen: () => void;
  onOpenAdminDashboard?: () => void;
  onLogout?: () => void;
}

export const AnimeAppWrapper: React.FC<AnimeAppWrapperProps> = ({
  currentAccount,
  activeProfile,
  profiles,
  onSelectProfile,
  onSwitchApp,
  onSwitchProfileScreen,
  onOpenAdminDashboard,
  onLogout,
}) => {
  const [section, setSection] = useState<AnimeSection>('home');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [resumeEpisodeId, setResumeEpisodeId] = useState<string | null>(null);
  const [browseSort, setBrowseSort] = useState<SortKey>('POPULARITY');
  const [resetKey, setResetKey] = useState(0);

  const goHome = () => {
    setSelectedId(null);
    setResumeEpisodeId(null);
    setSection('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogoClick = () => {
    setResetKey((k) => k + 1);
    goHome();
  };

  const handleSelect = (id: number) => {
    setResumeEpisodeId(null);
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResume = (item: UserActivityItem) => {
    const parts = item.contentId.split(':');
    const mediaId = Number(parts[1]);
    const episodeId = parts[2] || null;
    setResumeEpisodeId(episodeId);
    setSelectedId(mediaId);
  };

  const handleBrowse = (sort: SortKey) => {
    setBrowseSort(sort);
    setSelectedId(null);
    setResumeEpisodeId(null);
    setSection('browse');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSection = (s: AnimeSection) => {
    setSelectedId(null);
    setResumeEpisodeId(null);
    setSection(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDetailBack = () => {
    setSelectedId(null);
    setResumeEpisodeId(null);
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-zinc-100 selection:bg-amber-400 selection:text-black">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[#05070a]" />
        <div className="absolute -top-[30%] -right-[20%] w-[80%] h-[60%] bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[20%] w-[60%] h-[50%] bg-orange-600/8 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[40%] h-[40%] bg-violet-600/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: '24px 24px' }} />
      </div>

      <div className="relative">
        <AnimeNavbar
          section={section}
          onSectionChange={handleSection}
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
        {/* Offset for fixed navbar — same as Manga/Cinema */}
        <div className="h-[64px] sm:h-[64px] pt-[max(12px,env(safe-area-inset-top))] pointer-events-none" aria-hidden />
        <main className="min-h-[calc(100vh-160px)] pb-24 md:pb-10 pt-4">
          {selectedId !== null ? (
            <AnimeDetailView
              mediaId={selectedId}
              onBack={handleDetailBack}
              currentAccount={currentAccount}
              activeProfile={activeProfile}
              initialEpisodeId={resumeEpisodeId}
            />
          ) : section === 'home' ? (
            <AnimeHome
              currentAccount={currentAccount}
              activeProfile={activeProfile}
              onSelect={handleSelect}
              onResume={handleResume}
              onBrowse={handleBrowse}
            />
          ) : section === 'browse' ? (
            <AnimeView
              key={resetKey}
              activeProfile={activeProfile}
              currentAccount={currentAccount}
              onSelect={handleSelect}
              initialSort={browseSort}
            />
          ) : (
            <AnimeListsView
              mode={section === 'continue' ? 'continue' : section === 'history' ? 'history' : 'mylist'}
              currentAccount={currentAccount}
              activeProfile={activeProfile}
              onResume={handleResume}
              onSelect={handleSelect}
            />
          )}
        </main>
      </div>
    </div>
  );
};
