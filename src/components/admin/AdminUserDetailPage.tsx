import React, { useState, useEffect, useMemo } from 'react';
import { UserStats, UserActivityItem, MediaActivityType, Account } from '../../types';
import { watchHistoryService } from '../../services/watchHistoryService';
import { apiFetch } from '../../services/apiConfig';
import { addCalendarMonths, formatExpiryDate } from '../../services/authService';
import { subscribeSessions, type SessionSlot } from '../../services/sessionService';
import { formatDurationText, formatDateTimeExact, formatRelativeTime, getEffectiveTotalOnline, getEffectiveTotalWatch } from '../../services/userAnalyticsService';
import {
  ArrowLeft,
  Clock,
  Film,
  BookOpen,
  Youtube,
  Sparkles,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  Trash2,
  Search,
  RefreshCw,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  PlayCircle,
  CalendarRange,
  LayoutDashboard,
  History,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface AdminUserDetailPageProps {
  userStat: UserStats;
  onBack: () => void;
  onShowToast?: (msg: string) => void;
}

type TabType = 'overview' | 'charts' | 'history';
type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom';
type ChartViewMode = 'daily' | 'monthly' | 'categories';

const MEDIA_COLORS: Record<string, string> = {
  movie: '#38bdf8', // sky-400
  manga: '#34d399', // emerald-400
  youtube: '#f87171', // red-400
  browsing: '#94a3b8', // slate-400
};

export const AdminUserDetailPage: React.FC<AdminUserDetailPageProps> = ({
  userStat,
  onBack,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activities, setActivities] = useState<UserActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filters state
  const [filterType, setFilterType] = useState<MediaActivityType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'in_progress'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // format: 'YYYY-MM'

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Chart View Mode
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('daily');

  // Thiết bị đang dùng (Prompt 4 PHẦN C): 2 slot RTDB theo thời gian thực
  const [liveSessions, setLiveSessions] = useState<SessionSlot[]>([]);
  const [kickingSlot, setKickingSlot] = useState<string | null>(null);

  // Thời hạn tài khoản (Prompt 5 A2.3/A2.5): đọc 1 lần, gia hạn qua endpoint
  const [accountDoc, setAccountDoc] = useState<Account | null>(null);
  const [extendMonths, setExtendMonths] = useState<number>(1);
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { db } = await import('../../services/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'accounts', userStat.accountId));
        if (alive && snap.exists()) {
          const data = snap.data() as Account;
          setAccountDoc({ ...data, id: snap.id });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [userStat.accountId]);

  const expiryBase = accountDoc?.expiresAt && accountDoc.expiresAt > Date.now()
    ? accountDoc.expiresAt
    : Date.now();
  const expiryPreview = (() => {
    try {
      return addCalendarMonths(expiryBase, extendMonths);
    } catch {
      return expiryBase;
    }
  })();

  const handleExtend = async () => {
    if (isExtending) return;
    setIsExtending(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userStat.accountId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: extendMonths }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.expiresAt) {
        setAccountDoc((prev) => (prev ? { ...prev, expiresAt: data.expiresAt } : prev));
        onShowToast?.(
          `Đã gia hạn ${extendMonths} tháng — hạn mới: ${formatExpiryDate(data.expiresAt)}`
        );
      } else {
        onShowToast?.(`Không gia hạn được: ${(data as any)?.error || res.status}`);
      }
    } catch {
      onShowToast?.('Không gia hạn được. Thử lại sau.');
    } finally {
      setIsExtending(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeSessions(userStat.accountId, setLiveSessions);
    return unsub;
  }, [userStat.accountId]);

  const handleKickSession = async (slot: '1' | '2', label: string) => {
    if (!window.confirm(`Ngắt phiên "${label}" của @${userStat.accountId}? Thiết bị đó sẽ bị chặn ở request kế tiếp.`)) return;
    setKickingSlot(slot);
    try {
      const res = await apiFetch(`/api/admin/sessions/${userStat.accountId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      if (res.ok) {
        onShowToast?.(`Đã ngắt phiên ${slot}`);
      } else {
        onShowToast?.('Không ngắt được phiên. Thử lại sau.');
      }
    } catch {
      onShowToast?.('Không ngắt được phiên. Thử lại sau.');
    } finally {
      setKickingSlot(null);
    }
  };

  // Load activities
  const fetchUserActivities = async () => {
    setIsLoading(true);
    try {
      const items = await watchHistoryService.getUserHistory(userStat.accountId, 100);
      setActivities(items);
    } catch (e) {
      void 0;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserActivities();
  }, [userStat.accountId]);

  // Handle single deletion
  const handleDeleteActivity = async (item: UserActivityItem) => {
    if (!window.confirm(`Xóa mục lịch sử "${item.title}" của người dùng này?`)) return;
    setIsDeleting(item.id);
    try {
      await watchHistoryService.deleteRecord(item.id);
      onShowToast?.(`Đã xóa mục lịch sử "${item.title}"`);
      setActivities((prev) => prev.filter((a) => a.id !== item.id));
    } catch (e: any) {
      onShowToast?.(`Lỗi khi xóa: ${e?.message || 'Thất bại'}`);
    } finally {
      setIsDeleting(null);
    }
  };

  // Generate Available Months for quick dropdown filter
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    activities.forEach((a) => {
      const ts = a.lastWatchedAt || a.firstStartedAt;
      if (ts) {
        const d = new Date(ts);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        monthsSet.add(`${yyyy}-${mm}`);
      }
    });
    // Ensure current month is present
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(curMonth);

    return Array.from(monthsSet).sort().reverse();
  }, [activities]);

  // Filter activities based on all criteria
  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      // 1. Media Type
      if (filterType !== 'all' && item.mediaType !== filterType) return false;

      // 2. Status
      if (filterStatus === 'completed' && !item.completed) return false;
      if (filterStatus === 'in_progress' && item.completed) return false;

      // 3. Search Keyword
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase().trim();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchSub = item.subtitle?.toLowerCase().includes(q);
        const matchSrc = item.apiSource?.toLowerCase().includes(q);
        if (!matchTitle && !matchSub && !matchSrc) return false;
      }

      // 4. Date filtering
      const itemTimestamp = item.lastWatchedAt || item.firstStartedAt || 0;
      if (!itemTimestamp) return true;

      const itemDate = new Date(itemTimestamp);

      // Selected specific month dropdown
      if (selectedMonth !== 'all') {
        const [yStr, mStr] = selectedMonth.split('-');
        if (itemDate.getFullYear() !== parseInt(yStr, 10) || itemDate.getMonth() + 1 !== parseInt(mStr, 10)) {
          return false;
        }
      }

      // Date Presets & Custom range
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      if (datePreset === 'today') {
        return itemTimestamp >= todayStart;
      }

      if (datePreset === 'yesterday') {
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        return itemTimestamp >= yesterdayStart && itemTimestamp < todayStart;
      }

      if (datePreset === '7days') {
        const start7Days = todayStart - 6 * 24 * 60 * 60 * 1000;
        return itemTimestamp >= start7Days;
      }

      if (datePreset === '30days') {
        const start30Days = todayStart - 29 * 24 * 60 * 60 * 1000;
        return itemTimestamp >= start30Days;
      }

      if (datePreset === 'this_month') {
        const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        return itemTimestamp >= startThisMonth;
      }

      if (datePreset === 'last_month') {
        const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        return itemTimestamp >= startLastMonth && itemTimestamp < endLastMonth;
      }

      if (datePreset === 'custom') {
        if (customFromDate) {
          const fromTs = new Date(`${customFromDate}T00:00:00`).getTime();
          if (itemTimestamp < fromTs) return false;
        }
        if (customToDate) {
          const toTs = new Date(`${customToDate}T23:59:59.999`).getTime();
          if (itemTimestamp > toTs) return false;
        }
      }

      return true;
    });
  }, [activities, filterType, filterStatus, searchKeyword, datePreset, customFromDate, customToDate, selectedMonth]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterStatus, searchKeyword, datePreset, customFromDate, customToDate, selectedMonth, pageSize]);

  // Pagination calculation
  const totalItems = filteredActivities.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedActivities = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, currentPage, pageSize]);

  // 5 Most Recent Activities for Quick Overview
  const recentActivities = useMemo(() => {
    return activities.slice(0, 5);
  }, [activities]);

  // Helper: get effective duration from activity item
  const getEffectiveDuration = (item: UserActivityItem): number => {
    let sec = Number(item.watchedDurationSeconds);
    if (!Number.isFinite(sec) || sec <= 0) {
      if (item.currentTime && item.currentTime > 0) {
        sec = item.currentTime;
      } else if (item.progressPercent && item.duration && item.duration > 0) {
        sec = Math.round((item.progressPercent / 100) * item.duration);
      } else {
        sec = 60;
      }
    }
    sec = Number(sec);
    return Number.isFinite(sec) && sec > 0 ? sec : 60;
  };

  // Activity-based stats (fallback)
  const activityMovieSec = useMemo(() => activities.filter(a => a.mediaType === 'movie').reduce((s, a) => s + getEffectiveDuration(a), 0), [activities]);
  const activityMangaSec = useMemo(() => activities.filter(a => a.mediaType === 'manga').reduce((s, a) => s + getEffectiveDuration(a), 0), [activities]);
  const activityYtSec = useMemo(() => activities.filter(a => a.mediaType === 'youtube').reduce((s, a) => s + getEffectiveDuration(a), 0), [activities]);

  // Final stats: userStat (Firestore) as primary, activity-based as fallback.
  // Coerce to finite numbers so a corrupted (e.g. unresolved increment) value
  // can never produce NaN in the charts/percentages.
  const safeSec = (v: number | undefined | null, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const movieSec = safeSec(userStat.watchSecondsByMedia?.movie, activityMovieSec);
  const mangaSec = safeSec(userStat.watchSecondsByMedia?.manga, activityMangaSec);
  const ytSec = safeSec(userStat.watchSecondsByMedia?.youtube, activityYtSec);

  const effTotal = getEffectiveTotalWatch(userStat);
  const sumTotal = movieSec + mangaSec + ytSec;
  const totalWatchSec =
    Number.isFinite(effTotal) && effTotal > 0
      ? effTotal
      : Number.isFinite(sumTotal) && sumTotal > 0
        ? sumTotal
        : 0;

  const moviePct = totalWatchSec > 0 ? Math.round((movieSec / totalWatchSec) * 100) : 0;
  const mangaPct = totalWatchSec > 0 ? Math.round((mangaSec / totalWatchSec) * 100) : 0;
  const ytPct = totalWatchSec > 0 ? Math.round((ytSec / totalWatchSec) * 100) : 0;

  // Chart Data Preparation: Daily Trend
  const dailyChartData = useMemo(() => {
    const daysMap = new Map<string, { dateStr: string; displayDate: string; watchMinutes: number; onlineMinutes: number; itemsCount: number }>();

    // Build timeline for last 14 days by default, or past 30 days
    const daysCount = datePreset === '7days' ? 7 : datePreset === '30days' ? 30 : 14;
    const now = new Date();

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      daysMap.set(key, {
        dateStr: key,
        displayDate: `${dd}/${mm}`,
        watchMinutes: 0,
        onlineMinutes: 0,
        itemsCount: 0,
      });
    }

    // Populate from activities
    activities.forEach((item) => {
      const ts = item.lastWatchedAt || item.firstStartedAt;
      if (!ts) return;
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;

      const durSec = getEffectiveDuration(item);
      const cur = daysMap.get(key);
      if (cur) {
        cur.watchMinutes += Math.round(durSec / 60);
        cur.onlineMinutes += Math.round((durSec + 60) / 60);
        cur.itemsCount += 1;
      } else if (daysMap.size < 60) {
        // If outside window but within custom range, add it
        daysMap.set(key, {
          dateStr: key,
          displayDate: `${dd}/${mm}`,
          watchMinutes: Math.round(durSec / 60),
          onlineMinutes: Math.round((durSec + 60) / 60),
          itemsCount: 1,
        });
      }
    });

    return Array.from(daysMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [activities, datePreset]);

  // Chart Data Preparation: Monthly Trend
  const monthlyChartData = useMemo(() => {
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    const currentYear = new Date().getFullYear();
    const monthsMap = new Map<number, { monthName: string; monthIndex: number; watchHours: number; itemsCount: number }>();

    for (let m = 0; m < 12; m++) {
      monthsMap.set(m, {
        monthName: monthNames[m],
        monthIndex: m,
        watchHours: 0,
        itemsCount: 0,
      });
    }

    activities.forEach((item) => {
      const ts = item.lastWatchedAt || item.firstStartedAt;
      if (!ts) return;
      const d = new Date(ts);
      if (d.getFullYear() === currentYear) {
        const m = d.getMonth();
        const cur = monthsMap.get(m);
        if (cur) {
          cur.watchHours += Number(((getEffectiveDuration(item)) / 3600).toFixed(2));
          cur.itemsCount += 1;
        }
      }
    });

    return Array.from(monthsMap.values());
  }, [activities]);

  // Chart Data Preparation: Media Categories Breakdown
  const categoryChartData = useMemo(() => {
    return [
      { name: 'Phim', value: Math.round(movieSec / 60), durationText: formatDurationText(movieSec), pct: moviePct, color: MEDIA_COLORS.movie },
      { name: 'Truyện Tranh', value: Math.round(mangaSec / 60), durationText: formatDurationText(mangaSec), pct: mangaPct, color: MEDIA_COLORS.manga },
      { name: 'YouTube', value: Math.round(ytSec / 60), durationText: formatDurationText(ytSec), pct: ytPct, color: MEDIA_COLORS.youtube },
    ].filter((item) => item.value > 0 || totalWatchSec === 0);
  }, [movieSec, mangaSec, ytSec, moviePct, mangaPct, ytPct, totalWatchSec]);

  // Export Filtered History to CSV
  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      onShowToast?.('Không có dữ liệu phù hợp để xuất file!');
      return;
    }

    const headers = [
      'STT',
      'Tài khoản',
      'Tên hiển thị',
      'Loại nội dung',
      'Tiêu đề',
      'Tập / Chương',
      'Nguồn phát',
      'Thời lượng xem (giây)',
      'Thời lượng xem (định dạng)',
      'Tiến độ (%)',
      'Đã hoàn thành',
      'Thời gian bắt đầu',
      'Thời gian xem gần nhất',
    ];

    const rows = filteredActivities.map((item, idx) => [
      idx + 1,
      `"${item.accountId || ''}"`,
      `"${item.accountDisplayName || ''}"`,
      `"${item.mediaType || ''}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.subtitle || '').replace(/"/g, '""')}"`,
      `"${item.apiSource || ''}"`,
      item.watchedDurationSeconds || 0,
      `"${formatDurationText(item.watchedDurationSeconds)}"`,
      `${item.progressPercent ?? 0}%`,
      item.completed ? 'Có' : 'Chưa',
      `"${formatDateTimeExact(item.firstStartedAt)}"`,
      `"${formatDateTimeExact(item.lastWatchedAt)}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lich_su_xem_${userStat.accountId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast?.(`Đã xuất ${filteredActivities.length} dòng lịch sử sang file CSV thành công!`);
  };

  return (
    <div id="admin-user-detail-page" className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header & Breadcrumb */}
      <div className="bg-[#0b1329] border border-blue-900/60 p-4 sm:p-5 rounded-3xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0 w-full md:w-auto">
          <button
            id="back-to-admin-stats-btn"
            onClick={onBack}
            className="p-3 rounded-2xl bg-[#0f172a] hover:bg-slate-700 text-sky-400 hover:text-white border border-slate-700/80 transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-2 text-xs font-bold min-h-[44px]"
            title="Quay lại danh sách"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Quay Lại</span>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/40 flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-lg">
                {(userStat.accountDisplayName || userStat.accountId || 'U').substring(0, 1).toUpperCase()}
              </div>
              {userStat.isOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0b1329]"></span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-black text-white truncate">
                  {userStat.accountDisplayName || userStat.accountId}
                </h2>
                {userStat.isOnline ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1 shadow-sm shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                    Offline
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-400">
                <span className="font-mono text-sky-400 text-[11px] sm:text-xs">@{userStat.accountId}</span>
                <span>•</span>
                <span className="text-[11px] sm:text-xs">
                  {userStat.firstSeenAt ? `Tạo: ${formatDateTimeExact(userStat.firstSeenAt)}` : 'Mặc định'}
                </span>
                {accountDoc && accountDoc.role !== 'admin' && (
                  <>
                    <span>•</span>
                    <span
                      className={`text-[11px] sm:text-xs font-bold ${
                        accountDoc.expiresAt && accountDoc.expiresAt < Date.now()
                          ? 'text-red-400'
                          : accountDoc.expiresAt && accountDoc.expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      Hạn dùng:{' '}
                      {accountDoc.expiresAt ? formatExpiryDate(accountDoc.expiresAt) : 'không thời hạn'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={fetchUserActivities}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer min-h-[44px]"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm Mới</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition cursor-pointer min-h-[44px]"
            title="Xuất file CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV ({filteredActivities.length})</span>
          </button>
        </div>
      </div>

      {/* Gia hạn tài khoản (Prompt 5 A2.3/A2.5) */}
      {accountDoc && accountDoc.role !== 'admin' && (
        <div className="bg-[#0b1329] border border-indigo-900/60 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white uppercase tracking-wider">Gia hạn sử dụng</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {accountDoc.expiresAt && accountDoc.expiresAt > Date.now()
                ? `Còn hạn tới ${formatExpiryDate(accountDoc.expiresAt)} — gia hạn cộng dồn, không mất ngày còn lại. Hạn mới dự kiến: ${formatExpiryDate(expiryPreview)}.`
                : `Đã hết hạn${accountDoc.expiresAt ? ` từ ${formatExpiryDate(accountDoc.expiresAt)}` : ''} — gia hạn tính từ hôm nay. Hạn mới dự kiến: ${formatExpiryDate(expiryPreview)}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={extendMonths}
              onChange={(e) => setExtendMonths(Number(e.target.value) || 1)}
              className="bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer min-h-[44px]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m} tháng
                </option>
              ))}
            </select>
            <button
              onClick={handleExtend}
              disabled={isExtending}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition cursor-pointer min-h-[44px]"
            >
              {isExtending ? 'Đang gia hạn...' : 'Gia hạn'}
            </button>
          </div>
        </div>
      )}

      {/* Main Tab Navigation Bar for Mobile and Desktop */}
      <div className="bg-[#0b1329] border border-blue-900/60 p-1.5 sm:p-2 rounded-2xl shadow-xl">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {/* Tab 1: Overview */}
          <button
            id="tab-user-detail-overview"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="truncate">Tổng Quan</span>
          </button>

          {/* Tab 2: Charts */}
          <button
            id="tab-user-detail-charts"
            onClick={() => setActiveTab('charts')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
              activeTab === 'charts'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="truncate">Biểu Đồ</span>
          </button>

          {/* Tab 3: History */}
          <button
            id="tab-user-detail-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span className="truncate">Lịch Sử</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono shrink-0 ${
              activeTab === 'history' ? 'bg-blue-900 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {filteredActivities.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & KEY STATS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Online Duration */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Tổng Thời Gian Online</span>
                <Clock className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-sky-400">
                  {formatDurationText(getEffectiveTotalOnline(userStat))}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>Số phiên kết nối:</span>
                  <strong className="text-slate-200">{userStat.totalSessions || 1} phiên</strong>
                </p>
              </div>
            </div>

            {/* Total Watch Duration */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Tổng Thời Lượng Xem</span>
                <Film className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-indigo-300">
                  {formatDurationText(totalWatchSec)}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>Tỷ lệ xem / online:</span>
                  <strong className="text-sky-300">
                    {getEffectiveTotalOnline(userStat) > 0 ? Math.round((totalWatchSec / getEffectiveTotalOnline(userStat)) * 100) : 100}%
                  </strong>
                </p>
              </div>
            </div>

            {/* Last Active Timestamp */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Hoạt Động Gần Nhất</span>
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm sm:text-base font-bold text-white">
                  {formatRelativeTime(userStat.lastActiveAt)}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 font-mono">
                  {formatDateTimeExact(userStat.lastActiveAt)}
                </p>
              </div>
            </div>

            {/* Total Media Items Viewed */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Tổng Lượt Xem / Đọc</span>
                <PlayCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-400">
                  {activities.length}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>Đã xem xong:</span>
                  <strong className="text-emerald-400">
                    {activities.filter((a) => a.completed).length} mục
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* Category Breakdown Cards */}
          <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-sky-400" />
                <span>Phân Bổ Thời Gian Theo Thể Loại Nội Dung</span>
              </h3>
              <button
                onClick={() => setActiveTab('charts')}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Xem biểu đồ chi tiết</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Phim */}
              <div className="bg-[#070b16] border border-sky-900/40 rounded-2xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-sky-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5" /> Phim
                    </span>
                    <span>{moviePct}%</span>
                  </div>
                  <p className="text-base font-bold text-white">{formatDurationText(movieSec)}</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div className="bg-sky-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${moviePct}%` }} />
                </div>
              </div>

              {/* Manga */}
              <div className="bg-[#070b16] border border-emerald-900/40 rounded-2xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> Manga
                    </span>
                    <span>{mangaPct}%</span>
                  </div>
                  <p className="text-base font-bold text-white">{formatDurationText(mangaSec)}</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${mangaPct}%` }} />
                </div>
              </div>

              {/* YouTube */}
              <div className="bg-[#070b16] border border-red-900/40 rounded-2xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-red-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Youtube className="w-3.5 h-3.5" /> YouTube
                    </span>
                    <span>{ytPct}%</span>
                  </div>
                  <p className="text-base font-bold text-white">{formatDurationText(ytSec)}</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div className="bg-red-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${ytPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Thiết bị đang dùng — 2 slot RTDB theo thời gian thực (Prompt 4) */}
          <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Thiết Bị Đang Dùng ({liveSessions.length}/2)</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Trực tiếp
              </span>
            </div>
            {liveSessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-2 text-center">Không có thiết bị nào đang giữ slot</p>
            ) : (
              <div className="space-y-2.5">
                {liveSessions.map((s) => (
                  <div
                    key={s.slot || s.deviceId}
                    className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        Slot {s.slot} • {s.deviceInfo}
                        {s.profileName ? ` • ${s.profileName}` : ''}
                        {s.tabs && Object.keys(s.tabs).length > 1
                          ? ` • ${Object.keys(s.tabs).length} tab`
                          : ''}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {s.title
                          ? `Đang ${s.kind === 'manga' ? 'đọc' : 'xem'}: ${s.title}`
                          : 'Trong app'}
                        {' • '}
                        {s.startedAt ? new Date(s.startedAt).toLocaleString('vi-VN') : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleKickSession((s.slot || '1') as '1' | '2', `${s.deviceInfo}${s.profileName ? ` • ${s.profileName}` : ''}`)}
                      disabled={kickingSlot === s.slot}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-800/60 text-red-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {kickingSlot === s.slot ? 'Đang ngắt...' : 'Ngắt phiên'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Recent Activities Preview */}
          <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Hoạt Động Gần Đây Nhất ({recentActivities.length})</span>
              </h3>
              <button
                onClick={() => setActiveTab('history')}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Xem toàn bộ lịch sử</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Chưa có lịch sử hoạt động nào được ghi nhận</p>
            ) : (
              <div className="space-y-2.5">
                {recentActivities.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="w-10 h-14 object-cover rounded-lg border border-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">{item.title}</p>
                        {item.subtitle && <p className="text-[11px] text-sky-400 truncate">{item.subtitle}</p>}
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {formatRelativeTime(item.lastWatchedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {item.watchedDurationSeconds ? (
                        <span className="text-xs font-semibold text-slate-300 block">
                          {formatDurationText(item.watchedDurationSeconds)}
                        </span>
                      ) : null}
                      {item.progressPercent !== undefined ? (
                        <span className="text-[10px] text-sky-400 font-mono">
                          {item.progressPercent}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CHARTS & TRENDS */}
      {/* ========================================================================= */}
      {activeTab === 'charts' && (
        <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-950/80 border border-blue-800 flex items-center justify-center text-sky-400 shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Biểu Đồ Trực Quan Hóa Hoạt Động & Thời Lượng
                </h3>
                <p className="text-xs text-slate-400">
                  Xu hướng thời gian xem và online theo ngày, tháng hoặc thể loại
                </p>
              </div>
            </div>

            {/* Chart Switcher Buttons */}
            <div className="flex items-center p-1 bg-[#070b16] rounded-2xl border border-slate-800 text-xs w-full sm:w-auto">
              <button
                onClick={() => setChartViewMode('daily')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
                  chartViewMode === 'daily'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Theo Ngày</span>
              </button>
              <button
                onClick={() => setChartViewMode('monthly')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
                  chartViewMode === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>Theo Tháng</span>
              </button>
              <button
                onClick={() => setChartViewMode('categories')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
                  chartViewMode === 'categories'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                <span>Thể Loại</span>
              </button>
            </div>
          </div>

          {/* Chart View 1: Daily Activity Trend */}
          {chartViewMode === 'daily' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-semibold text-slate-300">
                  Xu hướng thời gian xem & online theo từng ngày (Đơn vị: Phút)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Dữ liệu ghi nhận tự động</span>
              </div>
              <div className="h-64 sm:h-80 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="watchColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="onlineColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="displayDate" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [
                        `${value} phút (${(Number(value) / 60).toFixed(1)}h)`,
                        name === 'watchMinutes' ? 'Thời lượng Xem' : 'Thời gian Online',
                      ]}
                    />
                    <Legend
                      formatter={(val) => (val === 'watchMinutes' ? 'Thời Lượng Xem' : 'Thời Gian Online')}
                      wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="onlineMinutes"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#onlineColor)"
                    />
                    <Area
                      type="monotone"
                      dataKey="watchMinutes"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#watchColor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart View 2: Monthly Activity Trend */}
          {chartViewMode === 'monthly' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-semibold text-slate-300">
                  Tổng thời lượng xem theo các tháng trong năm {new Date().getFullYear()} (Đơn vị: Giờ)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">12 tháng trong năm</span>
              </div>
              <div className="h-64 sm:h-80 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="monthName" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(value: any) => [`${value} giờ`, 'Tổng Thời Lượng Xem']}
                    />
                    <Legend
                      formatter={() => 'Tổng Giờ Xem (Giờ)'}
                      wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                    />
                    <Bar dataKey="watchHours" fill="#6366f1" radius={[8, 8, 0, 0]}>
                      {monthlyChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === new Date().getMonth() ? '#38bdf8' : '#6366f1'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart View 3: Media Category Breakdown */}
          {chartViewMode === 'categories' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Pie / Donut Chart */}
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [`${value} phút`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Category Statistics Cards & Progress */}
              <div className="md:col-span-2 space-y-3">
                {/* Phim */}
                <div className="bg-[#070b16] border border-sky-900/40 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-400">
                    <span className="flex items-center gap-2">
                      <Film className="w-4 h-4" /> Phim Truyền Hình & Chiếu Rạp
                    </span>
                    <span>{moviePct}% ({formatDurationText(movieSec)})</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mt-2.5 overflow-hidden">
                    <div className="bg-sky-400 h-2 rounded-full transition-all duration-500" style={{ width: `${moviePct}%` }} />
                  </div>
                </div>

                {/* Manga */}
                <div className="bg-[#070b16] border border-emerald-900/40 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> Truyện Tranh (Manga / Manhwa)
                    </span>
                    <span>{mangaPct}% ({formatDurationText(mangaSec)})</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mt-2.5 overflow-hidden">
                    <div className="bg-emerald-400 h-2 rounded-full transition-all duration-500" style={{ width: `${mangaPct}%` }} />
                  </div>
                </div>

                {/* YouTube */}
                <div className="bg-[#070b16] border border-red-900/40 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-red-400">
                    <span className="flex items-center gap-2">
                      <Youtube className="w-4 h-4" /> Video YouTube
                    </span>
                    <span>{ytPct}% ({formatDurationText(ytSec)})</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mt-2.5 overflow-hidden">
                    <div className="bg-red-500 h-2 rounded-full transition-all duration-500" style={{ width: `${ytPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: WATCH HISTORY & ADVANCED FILTER */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Advanced Filter Bar & Search */}
          <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                <span>Bộ Lọc Nâng Cao & Khoảng Thời Gian</span>
              </h3>
              <button
                onClick={() => {
                  setFilterType('all');
                  setFilterStatus('all');
                  setSearchKeyword('');
                  setDatePreset('all');
                  setCustomFromDate('');
                  setCustomToDate('');
                  setSelectedMonth('all');
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
              >
                Đặt lại bộ lọc
              </button>
            </div>

            {/* Row 1: Search, Media Category, Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Keyword Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Tìm theo tên phim, truyện, tập, nguồn..."
                  className="w-full pl-9 pr-3 py-2 bg-[#0f172a] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Media Category Selection */}
              <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-slate-700/80 text-xs overflow-x-auto">
                <button
                  onClick={() => setFilterType('all')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterType === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setFilterType('movie')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterType === 'movie' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Phim
                </button>
                <button
                  onClick={() => setFilterType('manga')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterType === 'manga' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Manga
                </button>
                <button
                  onClick={() => setFilterType('youtube')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterType === 'youtube' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  YouTube
                </button>
              </div>

              {/* Status Selection */}
              <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-slate-700/80 text-xs">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterStatus === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mọi tiến độ
                </button>
                <button
                  onClick={() => setFilterStatus('completed')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterStatus === 'completed' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Đã xong
                </button>
                <button
                  onClick={() => setFilterStatus('in_progress')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    filterStatus === 'in_progress' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Đang dở
                </button>
              </div>
            </div>

            {/* Row 2: Date Presets & Custom Range */}
            <div className="space-y-3 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>Khoảng thời gian:</span>
                </span>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    onClick={() => { setDatePreset('all'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'all' && selectedMonth === 'all'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => { setDatePreset('today'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'today'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Hôm nay
                  </button>
                  <button
                    onClick={() => { setDatePreset('yesterday'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'yesterday'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Hôm qua
                  </button>
                  <button
                    onClick={() => { setDatePreset('7days'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === '7days'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    7 ngày qua
                  </button>
                  <button
                    onClick={() => { setDatePreset('30days'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === '30days'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    30 ngày
                  </button>
                  <button
                    onClick={() => { setDatePreset('this_month'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'this_month'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Tháng này
                  </button>
                  <button
                    onClick={() => { setDatePreset('last_month'); setSelectedMonth('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'last_month'
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Tháng trước
                  </button>
                  <button
                    onClick={() => setDatePreset('custom')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      datePreset === 'custom'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Ngày A → B
                  </button>
                </div>
              </div>

              {/* Month Selector or Custom Date Range Inputs */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 whitespace-nowrap">Chọn tháng cụ thể:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      if (e.target.value !== 'all') setDatePreset('all');
                    }}
                    className="bg-[#0f172a] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">Tất cả các tháng</option>
                    {availableMonths.map((m) => {
                      const [y, mm] = m.split('-');
                      return (
                        <option key={m} value={m}>
                          Tháng {parseInt(mm, 10)}/{y}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {datePreset === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2 bg-[#070b16] p-2 rounded-xl border border-indigo-900/60">
                    <span className="text-xs text-indigo-300 font-semibold">Từ:</span>
                    <input
                      type="date"
                      value={customFromDate}
                      onChange={(e) => setCustomFromDate(e.target.value)}
                      className="bg-[#0f172a] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-indigo-300 font-semibold">Đến:</span>
                    <input
                      type="date"
                      value={customToDate}
                      onChange={(e) => setCustomToDate(e.target.value)}
                      className="bg-[#0f172a] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Watch History Content Table & Cards */}
          <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
            {/* Table Top Header: Results count and Page Size selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>Chi Tiết Từng Lượt Xem / Đọc</span>
                  <span className="text-xs bg-blue-950 text-sky-400 border border-blue-800 px-2 py-0.5 rounded-full font-mono">
                    {filteredActivities.length} kết quả
                  </span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-[#0f172a] border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value={10}>10 mục</option>
                  <option value={20}>20 mục</option>
                  <option value={50}>50 mục</option>
                  <option value={100}>100 mục</option>
                </select>
              </div>
            </div>

            {/* List Content */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                <p className="text-xs text-slate-400">Đang tải lịch sử chi tiết từ cơ sở dữ liệu...</p>
              </div>
            ) : paginatedActivities.length === 0 ? (
              <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 mx-auto flex items-center justify-center text-slate-500">
                  <Layers className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-300">Không tìm thấy bản ghi lịch sử nào phù hợp</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Hãy thử thay đổi khoảng thời gian, từ khóa tìm kiếm hoặc chọn danh mục khác.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedActivities.map((item) => {
                  const isMovie = item.mediaType === 'movie';
                  const isManga = item.mediaType === 'manga';
                  const isYt = item.mediaType === 'youtube';

                  return (
                    <div
                      key={item.id}
                      className="bg-[#0f172a] border border-slate-800/80 hover:border-blue-800/60 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all shadow-sm"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            className="w-12 h-18 sm:w-16 sm:h-20 object-cover rounded-xl border border-slate-800 shrink-0 shadow"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-18 sm:w-16 sm:h-20 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-500 shrink-0 border border-slate-700">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                              {item.title}
                            </h4>

                            {isMovie && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1">
                                <Film className="w-2.5 h-2.5" /> Phim
                              </span>
                            )}
                            {isManga && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <BookOpen className="w-2.5 h-2.5" /> Truyện
                              </span>
                            )}
                            {isYt && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-red-950 text-red-300 border border-red-800 flex items-center gap-1">
                                <Youtube className="w-2.5 h-2.5" /> YouTube
                              </span>
                            )}

                            {item.completed && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Đã xong
                              </span>
                            )}
                          </div>

                          {item.subtitle && (
                            <p className="text-[11px] text-sky-400 font-semibold line-clamp-1">
                              {item.subtitle}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            {item.watchedDurationSeconds ? (
                              <span>
                                Xem: <strong className="text-slate-200">{formatDurationText(item.watchedDurationSeconds)}</strong>
                              </span>
                            ) : null}

                            {item.progressPercent !== undefined ? (
                              <span>
                                Tiến độ: <strong className="text-sky-300">{item.progressPercent}%</strong>
                              </span>
                            ) : null}

                            {item.apiSource && (
                              <span className="font-mono text-[9px] bg-[#131f37] px-1.5 py-0.2 rounded text-slate-300 border border-slate-800">
                                {item.apiSource.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Mini progress bar */}
                          {item.progressPercent !== undefined && (
                            <div className="w-full max-w-xs bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
                              <div
                                className={`h-1.5 rounded-full ${item.completed ? 'bg-emerald-400' : 'bg-sky-400'}`}
                                style={{ width: `${Math.min(100, item.progressPercent)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Timestamp & Action */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        <div className="text-left sm:text-right space-y-0.5">
                          <p className="text-xs font-bold text-slate-200">
                            {formatRelativeTime(item.lastWatchedAt)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatDateTimeExact(item.lastWatchedAt)}
                          </p>
                        </div>

                        <button
                          onClick={() => handleDeleteActivity(item)}
                          disabled={isDeleting === item.id}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Xóa mục lịch sử này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls Bar */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800 text-xs">
                <div className="text-slate-400">
                  Hiển thị <strong className="text-white">{(currentPage - 1) * pageSize + 1}</strong> -{' '}
                  <strong className="text-white">{Math.min(currentPage * pageSize, totalItems)}</strong> /{' '}
                  <strong className="text-white">{totalItems}</strong> mục
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Trang trước"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-xl font-bold transition cursor-pointer flex items-center justify-center text-xs ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Trang tiếp"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
