import React, { useState, useMemo, useEffect } from 'react';
import { UserStats, Account } from '../../types';
import { authService, formatExpiryDate } from '../../services/authService';
import {
  userAnalyticsService,
  formatDurationText,
  formatDateTimeExact,
  formatRelativeTime,
  getEffectiveTotalOnline,
  getEffectiveTotalWatch,
} from '../../services/userAnalyticsService';
import {
  Users,
  Clock,
  Film,
  BookOpen,
  Youtube,
  Search,
  RefreshCw,
  Layers,
  Activity,
  ArrowRight,
  Database,
  CheckCircle2,
} from 'lucide-react';

interface AdminUserStatsTabProps {
  userStats: UserStats[];
  onOpenUserDetail: (stat: UserStats) => void;
  onRefresh: () => Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const AdminUserStatsTab: React.FC<AdminUserStatsTabProps> = ({
  userStats,
  onOpenUserDetail,
  onRefresh,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'online_time' | 'watch_time' | 'last_active' | 'name'>('watch_time');
  const [isSyncing, setIsSyncing] = useState(false);

  // Hạn dùng tài khoản (Prompt 5 A2.5): join với collection accounts
  const [accountsById, setAccountsById] = useState<Record<string, Account>>({});
  useEffect(() => {
    let alive = true;
    authService
      .getAllAccounts()
      .then((accs) => {
        if (!alive) return;
        const map: Record<string, Account> = {};
        for (const a of accs) {
          map[a.id] = a;
          if (a.username) map[`@${a.username}`] = a;
        }
        setAccountsById(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const getExpiryOf = (accountId: string): { expired: boolean; expiringSoon: boolean; daysLeft: number | null; dateStr: string | null } => {
    const acc =
      accountsById[accountId] ||
      Object.values(accountsById).find((a) => a.username === accountId);
    if (!acc || acc.role === 'admin' || !acc.expiresAt) {
      return { expired: false, expiringSoon: false, daysLeft: null, dateStr: null };
    }
    const msLeft = acc.expiresAt - Date.now();
    return {
      expired: msLeft <= 0,
      expiringSoon: msLeft > 0 && msLeft < 7 * 24 * 60 * 60 * 1000,
      daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
      dateStr: formatExpiryDate(acc.expiresAt),
    };
  };

  // Aggregates
  const totalOnlineSecAll = useMemo(() => {
    return userStats.reduce((sum, u) => sum + getEffectiveTotalOnline(u), 0);
  }, [userStats]);

  const totalWatchSecAll = useMemo(() => {
    return userStats.reduce((sum, u) => sum + getEffectiveTotalWatch(u), 0);
  }, [userStats]);

  const onlineUsersCount = useMemo(() => {
    return userStats.filter((u) => u.isOnline).length;
  }, [userStats]);

  // Filtered and Sorted Users
  const filteredUsers = useMemo(() => {
    return userStats.filter((u) => {
      if (statusFilter === 'online' && !u.isOnline) return false;
      if (statusFilter === 'offline' && u.isOnline) return false;

      if (expiryFilter !== 'all') {
        const e = getExpiryOf(u.accountId);
        if (expiryFilter === 'active' && (e.expired || e.expiringSoon)) return false;
        if (expiryFilter === 'expiring' && !e.expiringSoon) return false;
        if (expiryFilter === 'expired' && !e.expired) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (u.accountDisplayName || '').toLowerCase().includes(q);
        const matchId = u.accountId.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'watch_time') return (b.totalWatchSeconds || 0) - (a.totalWatchSeconds || 0);
      if (sortBy === 'online_time') return (b.totalOnlineSeconds || 0) - (a.totalOnlineSeconds || 0);
      if (sortBy === 'last_active') return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
      if (sortBy === 'name') return (a.accountDisplayName || a.accountId).localeCompare(b.accountDisplayName || b.accountId);
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userStats, statusFilter, expiryFilter, searchQuery, sortBy, accountsById]);

  // Sync legacy history
  const handleSyncLegacy = async () => {
    setIsSyncing(true);
    try {
      const result = await userAnalyticsService.syncAndAggregateLegacyHistory();
      onShowToast?.(`Đã đồng bộ thành công ${result.totalRecords} bản ghi từ ${result.totalAccounts} tài khoản!`);
      await onRefresh();
    } catch (e: any) {
      onShowToast?.(`Lỗi đồng bộ: ${e?.message || 'Thất bại'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users & Online */}
        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Số Thành Viên</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-white">{userStats.length}</h3>
                <span className="text-xs text-slate-400">tài khoản</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-sky-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400 font-bold">{onlineUsersCount} đang trực tuyến</span>
          </div>
        </div>

        {/* Total Online Time Across Users */}
        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Thời Gian Online</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-sky-400">{formatDurationText(totalOnlineSecAll)}</h3>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-800/60">
            Tích lũy nhịp tim thực tế của người dùng
          </p>
        </div>

        {/* Total Watch Time Across Users */}
        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Thời Lượng Đã Xem</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-indigo-300">{formatDurationText(totalWatchSecAll)}</h3>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
              <Film className="w-6 h-6" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-800/60">
            Phim, Manga và YouTube
          </p>
        </div>

        {/* Sync Legacy History Button Card */}
        <div className="bg-[#0b1222] border border-indigo-900/60 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Đồng Bộ Lịch Sử Toàn Bộ</span>
            </p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Tổng hợp lại toàn bộ dữ liệu lịch sử từ hồ sơ người dùng vào bảng thống kê
            </p>
          </div>
          <button
            onClick={handleSyncLegacy}
            disabled={isSyncing}
            className="mt-3 flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/30 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Đang tổng hợp dữ liệu...' : 'Đồng Bộ & Tổng Hợp'}</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Filter, Sort */}
      <div className="bg-[#0b1222] border border-blue-950/80 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm người dùng theo tên hiển thị hoặc username..."
              className="w-full pl-10 pr-4 py-2 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tất cả ({userStats.length})
              </button>
              <button
                onClick={() => setStatusFilter('online')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'online' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Online ({onlineUsersCount})
              </button>
              <button
                onClick={() => setStatusFilter('offline')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'offline' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Offline ({userStats.length - onlineUsersCount})
              </button>
            </div>

            {/* Expiry Filter (Prompt 5 A2.5) */}
            <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setExpiryFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  expiryFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mọi hạn
              </button>
              <button
                onClick={() => setExpiryFilter('active')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  expiryFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Đang hoạt động
              </button>
              <button
                onClick={() => setExpiryFilter('expiring')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  expiryFilter === 'expiring' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sắp hết hạn
              </button>
              <button
                onClick={() => setExpiryFilter('expired')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  expiryFilter === 'expired' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Đã hết hạn
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="watch_time">Thời lượng xem nhiều nhất</option>
              <option value="online_time">Thời gian online nhiều nhất</option>
              <option value="last_active">Hoạt động gần nhất</option>
              <option value="name">Tên A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users List Grid */}
      {filteredUsers.length === 0 ? (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 mx-auto flex items-center justify-center text-slate-500">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-300">Không tìm thấy người dùng nào phù hợp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const movieSec = user.watchSecondsByMedia?.movie || 0;
            const mangaSec = user.watchSecondsByMedia?.manga || 0;
            const ytSec = user.watchSecondsByMedia?.youtube || 0;
            const totalWatchSec = getEffectiveTotalWatch(user);
            const expiry = getExpiryOf(user.accountId);
            const expiryClass = expiry.expired
              ? 'text-red-400'
              : expiry.expiringSoon
                ? 'text-amber-400'
                : 'text-slate-400';

            return (
              <div
                key={user.accountId}
                className="bg-[#0f172a] border border-slate-800/90 hover:border-blue-700/60 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between transition-all group"
              >
                <div className="space-y-4">
                  {/* User Profile Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white font-bold text-base shadow">
                          {(user.accountDisplayName || user.accountId || 'U').substring(0, 1).toUpperCase()}
                        </div>
                        {user.isOnline && (
                          <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0f172a]"></span>
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                          {user.accountDisplayName || user.accountId}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-mono truncate">@{user.accountId}</p>
                      </div>
                    </div>

                    {user.isOnline ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                        Offline
                      </span>
                    )}
                  </div>

                  {/* Stat Metrics */}
                  <div className="grid grid-cols-2 gap-2 bg-[#070b16]/80 p-3 rounded-xl border border-slate-800/80">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Tổng Online</p>
                      <p className="text-xs font-black text-sky-400 mt-0.5">
                        {formatDurationText(getEffectiveTotalOnline(user))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Tổng Thời Lượng Xem</p>
                      <p className="text-xs font-black text-indigo-300 mt-0.5">
                        {formatDurationText(totalWatchSec)}
                      </p>
                    </div>
                  </div>

                  {/* Breakdown by Media Type mini-chips */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Phân bố xem:</span>
                      <span className="font-mono text-slate-300">{user.totalSessions || 1} phiên</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="bg-[#131f37] border border-sky-900/30 rounded-lg p-1.5">
                        <p className="text-[10px] text-sky-400 font-bold flex items-center justify-center gap-0.5">
                          <Film className="w-2.5 h-2.5" /> Phim
                        </p>
                        <p className="text-[10px] text-white font-bold truncate mt-0.5">
                          {formatDurationText(movieSec)}
                        </p>
                      </div>

                      <div className="bg-[#131f37] border border-emerald-900/30 rounded-lg p-1.5">
                        <p className="text-[10px] text-emerald-400 font-bold flex items-center justify-center gap-0.5">
                          <BookOpen className="w-2.5 h-2.5" /> Truyện
                        </p>
                        <p className="text-[10px] text-white font-bold truncate mt-0.5">
                          {formatDurationText(mangaSec)}
                        </p>
                      </div>

                      <div className="bg-[#131f37] border border-red-900/30 rounded-lg p-1.5">
                        <p className="text-[10px] text-red-400 font-bold flex items-center justify-center gap-0.5">
                          <Youtube className="w-2.5 h-2.5" /> YT
                        </p>
                        <p className="text-[10px] text-white font-bold truncate mt-0.5">
                          {formatDurationText(ytSec)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Last Active Item */}
                  {user.lastActiveItem && (
                    <div className="bg-[#131f37]/50 border border-slate-800 rounded-xl p-2.5 text-xs">
                      <span className="text-[10px] text-slate-400 block font-medium">Đang/Vừa xem:</span>
                      <p className="text-white font-bold line-clamp-1 mt-0.5">{user.lastActiveItem.title}</p>
                      {user.lastActiveItem.subtitle && (
                        <p className="text-[10px] text-sky-400 truncate">{user.lastActiveItem.subtitle}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer Action */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-2">
                  <div className={`flex items-center justify-between text-[11px] font-semibold ${expiryClass}`}>
                    <span>Hạn dùng:</span>
                    <span>
                      {expiry.dateStr
                        ? `${expiry.dateStr} (${expiry.expired ? 'hết hạn' : `${expiry.daysLeft} ngày còn lại`})`
                        : 'Không thời hạn'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      Lần cuối: {formatRelativeTime(user.lastActiveAt)}
                    </span>

                    <button
                      onClick={() => onOpenUserDetail(user)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <span>Xem Lịch Sử</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
