import React, { useEffect, useState } from 'react';
import { Account, MyListItem, UserActivityItem, UserProfile } from '../../types';
import { firestoreStorage } from '../../services/firestoreStorage';
import { watchHistoryService } from '../../services/watchHistoryService';
import { ContinueWatchingCard, MyListCard } from './AnimeCards';
import { History, PlayCircle, Bookmark, Trash2, Sparkles, Search } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export type AnimeListMode = 'continue' | 'history' | 'mylist';

interface AnimeListsViewProps {
  mode: AnimeListMode;
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
  onResume: (item: UserActivityItem) => void;
  onSelect: (id: number) => void;
}

const META: Record<AnimeListMode, { title: string; subtitle: string; icon: React.ReactNode; empty: string }> = {
  continue: {
    title: 'Đang xem',
    subtitle: 'Tiếp tục hành trình anime của bạn',
    icon: <PlayCircle className="w-6 h-6 text-white" />,
    empty: 'Bạn chưa xem anime nào. Hãy chọn một bộ để bắt đầu!',
  },
  history: {
    title: 'Lịch sử xem',
    subtitle: 'Tất cả những gì bạn đã xem',
    icon: <History className="w-6 h-6 text-white" />,
    empty: 'Chưa có lịch sử xem anime.',
  },
  mylist: {
    title: 'Bộ sưu tập',
    subtitle: 'Những bộ anime bạn đã lưu lại',
    icon: <Bookmark className="w-6 h-6 text-white" />,
    empty: 'Danh sách trống. Nhấn “Lưu lại” ở trang chi tiết để lưu anime.',
  },
};

export const AnimeListsView: React.FC<AnimeListsViewProps> = ({
  mode,
  currentAccount,
  activeProfile,
  onResume,
  onSelect,
}) => {
  const [history, setHistory] = useState<UserActivityItem[]>([]);
  const [myList, setMyList] = useState<MyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const accountId = currentAccount?.id || currentAccount?.username || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const loadHistory = watchHistoryService
      .getUserHistory(accountId, 200)
      .then((items) => {
        if (cancelled) return;
        const anime = (items || []).filter((i) => i.mediaType === 'anime');
        const deduped =
          mode === 'continue'
            ? (() => {
                const seen = new Set<string>();
                return anime
                  .map((i) => ({ ...i, _mediaId: i.contentId.split(':')[1] }))
                  .filter((i) => {
                    if (!i._mediaId || seen.has(i._mediaId)) return false;
                    seen.add(i._mediaId);
                    return true;
                  })
                  .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
              })()
            : anime.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
        setHistory(deduped);
      })
      .catch(() => {});

    const loadList =
      accountId && activeProfile
        ? firestoreStorage
            .getMyList(currentAccount!.id || currentAccount!.username || '', activeProfile.id)
            .then((list) => {
              if (!cancelled) setMyList(list.filter((i) => i.movieSlug.startsWith('anime:')));
            })
            .catch(() => {})
        : Promise.resolve();

    Promise.all([loadHistory, loadList]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, activeProfile, currentAccount, mode]);

  const handleDeleteHistory = async (item: UserActivityItem) => {
    try {
      await watchHistoryService.deleteRecord(item.id);
      setHistory((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      /* ignore */
    }
  };

  const handleRemoveList = async (item: MyListItem) => {
    if (!currentAccount || !activeProfile) return;
    try {
      await firestoreStorage.toggleMyList(currentAccount.id || currentAccount.username || '', activeProfile.id, {
        movieSlug: item.movieSlug,
        movieName: item.movieName,
        movieThumb: item.movieThumb,
      });
      setMyList((prev) => prev.filter((i) => i.movieSlug !== item.movieSlug));
    } catch {
      /* ignore */
    }
  };

  const meta = META[mode];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur p-6 sm:p-8 mb-6 overflow-hidden relative">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center shadow-lg shrink-0">
            {meta.icon}
          </div>
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight text-white flex items-center gap-2">
              {meta.title}
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-amber-400 text-black">
                <Sparkles className="w-3 h-3" /> PREMIUM
              </span>
            </h1>
            <p className="text-[13px] text-white/40">{meta.subtitle}</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2 text-xs text-white/30">
            {(mode === 'history' || mode === 'continue' ? history.length : myList.length)} bộ
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
          <span className="text-xs text-white/30">Đang tải...</span>
        </div>
      ) : (() => {
        const count = mode === 'history' || mode === 'continue' ? history.length : myList.length;
        if (count === 0) {
          return (
            <div className="text-center py-16 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02]">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-white font-semibold">{meta.empty}</p>
              <p className="text-sm text-white/30 mt-1">Khám phá kho anime khổng lồ ngay bây giờ</p>
            </div>
          );
        }
        const list =
          mode === 'history' || mode === 'continue'
            ? history.map((i) => ({ key: i.id, node: <ContinueWatchingCard item={i} onResume={onResume} /> }))
            : myList.map((i) => ({ key: i.movieSlug, node: <MyListCard item={i} onClick={onSelect} /> }));

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
            {list.map((entry) => (
              <div key={entry.key} className="relative group">
                {entry.node}
                {(mode === 'history' || mode === 'mylist') && (
                  <button
                    onClick={() =>
                      mode === 'history'
                        ? handleDeleteHistory(history.find((h) => h.id === entry.key)!)
                        : handleRemoveList(myList.find((m) => m.movieSlug === entry.key)!)
                    }
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 backdrop-blur border border-white/10 text-white/60 hover:bg-red-500 hover:text-white hover:border-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                    title={mode === 'history' ? 'Xóa khỏi lịch sử' : 'Xóa khỏi danh sách'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
};
