import React, { useEffect, useState } from 'react';
import { ActiveViewerSession, SystemApiEndpoint } from '../../types';
import { presenceService } from '../../services/presenceService';
import { systemApiService } from '../../services/systemApiService';
import {
  Users,
  Film,
  BookOpen,
  Tv,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Radio,
  Sparkles,
  Server,
  Layers,
} from 'lucide-react';

interface AdminOverviewTabProps {
  onSwitchToApisTab: () => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({ onSwitchToApisTab }) => {
  const [activeSessions, setActiveSessions] = useState<ActiveViewerSession[]>([]);
  const [apis, setApis] = useState<SystemApiEndpoint[]>([]);
  const [selectedSessionType, setSelectedSessionType] = useState<'all' | 'movie' | 'manga' | 'tv'>('all');

  useEffect(() => {
    // 1. Subscribe to real-time active sessions
    const unsubscribeSessions = presenceService.subscribeActiveSessions((data) => {
      setActiveSessions(data.sessions);
    });

    // 2. Subscribe to dynamic API endpoints
    const unsubscribeApis = systemApiService.subscribe((apiList) => {
      setApis(apiList);
    });

    return () => {
      unsubscribeSessions();
      unsubscribeApis();
    };
  }, []);

  const movieSessions = activeSessions.filter((s) => s.type === 'watching_movie');
  const mangaSessions = activeSessions.filter((s) => s.type === 'reading_manga');
  const tvSessions = activeSessions.filter((s) => s.type === 'watching_tv');

  const filteredSessions = activeSessions.filter((s) => {
    if (selectedSessionType === 'movie') return s.type === 'watching_movie';
    if (selectedSessionType === 'manga') return s.type === 'reading_manga';
    if (selectedSessionType === 'tv') return s.type === 'watching_tv';
    return true;
  });

  // API stats
  const liveApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'live').length;
  const slowApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'slow').length;
  const downApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'down').length;
  const disabledApisCount = apis.filter((a) => !a.enabled).length;

  const formatSeconds = (sec?: number) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getTimeAgo = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 10) return 'Vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    const min = Math.floor(diff / 60);
    return `${min} phút trước`;
  };

  return (
    <div className="space-y-6">
      {/* Top Stat Banner: Live Active Viewers and Real-time Pulse */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Live Viewers */}
        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đang Xem Trực Tuyến</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-white">{activeSessions.length}</h3>
                <span className="text-xs text-slate-400">người dùng</span>
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
            <span className="text-emerald-400 font-medium">Real-time Heartbeat Firestore</span>
          </div>
        </div>

        {/* Movie Viewers */}
        <div
          onClick={() => setSelectedSessionType(selectedSessionType === 'movie' ? 'all' : 'movie')}
          className={`cursor-pointer bg-[#0f172a] border rounded-2xl p-5 shadow-lg transition-all ${
            selectedSessionType === 'movie' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đang Xem Phim</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-sky-400">{movieSessions.length}</h3>
                <span className="text-xs text-slate-400">phiên</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400 shrink-0">
              <Film className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
            <span>Server HLS / Embed</span>
            <span className="text-sky-300 font-medium">Lọc theo phim →</span>
          </div>
        </div>

        {/* Manga Readers */}
        <div
          onClick={() => setSelectedSessionType(selectedSessionType === 'manga' ? 'all' : 'manga')}
          className={`cursor-pointer bg-[#0f172a] border rounded-2xl p-5 shadow-lg transition-all ${
            selectedSessionType === 'manga' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đang Đọc Manga</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-emerald-400">{mangaSessions.length}</h3>
                <span className="text-xs text-slate-400">phiên</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
            <span>OTruyen / CuuTruyen</span>
            <span className="text-emerald-300 font-medium">Lọc theo truyện →</span>
          </div>
        </div>

        {/* LiveTV Viewers */}
        <div
          onClick={() => setSelectedSessionType(selectedSessionType === 'tv' ? 'all' : 'tv')}
          className={`cursor-pointer bg-[#0f172a] border rounded-2xl p-5 shadow-lg transition-all ${
            selectedSessionType === 'tv' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đang Xem LiveTV</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-black text-amber-400">{tvSessions.length}</h3>
                <span className="text-xs text-slate-400">phiên</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
              <Tv className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
            <span>IPTV / DASH / HLS</span>
            <span className="text-amber-300 font-medium">Lọc theo TV →</span>
          </div>
        </div>
      </div>

      {/* System APIs Health Status Overview Card */}
      <div className="bg-[#0b1222] border border-blue-950/80 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-900/40 border border-blue-700/50 flex items-center justify-center text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Trạng Thái Hệ Thống API</span>
                <span className="text-xs bg-blue-950 text-sky-400 border border-blue-800 px-2 py-0.5 rounded-full font-mono">
                  {apis.length} API Tích Hợp
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Tự động điều phối endpoint động, cân bằng tải và giám sát độ trễ server
              </p>
            </div>
          </div>

          <button
            onClick={onSwitchToApisTab}
            className="flex items-center gap-2 text-xs font-semibold text-sky-400 bg-sky-950/60 border border-sky-800/60 hover:bg-sky-900/80 px-3 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>Quản Lý Danh Sách API →</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-[#0f172a] border border-emerald-900/40 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Hoạt động (Live)</p>
                <p className="text-lg font-bold text-emerald-400">{liveApisCount}</p>
              </div>
            </div>
            <span className="text-[10px] text-emerald-500/80 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 font-mono">
              &lt; 600ms
            </span>
          </div>

          <div className="bg-[#0f172a] border border-amber-900/40 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Chậm (Slow)</p>
                <p className="text-lg font-bold text-amber-400">{slowApisCount}</p>
              </div>
            </div>
            <span className="text-[10px] text-amber-500/80 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40 font-mono">
              600-2500ms
            </span>
          </div>

          <div className="bg-[#0f172a] border border-red-900/40 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Mất kết nối (Down)</p>
                <p className="text-lg font-bold text-red-400">{downApisCount}</p>
              </div>
            </div>
            <span className="text-[10px] text-red-500/80 bg-red-950/60 px-2 py-0.5 rounded border border-red-800/40 font-mono">
              Timeout / 500
            </span>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Tạm vô hiệu hóa</p>
                <p className="text-lg font-bold text-slate-400">{disabledApisCount}</p>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
              Disabled
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Live Sessions Grid & Activity Feeds */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500 animate-pulse" />
            <h3 className="text-base font-bold text-white">
              Chi Tiết Nội Dung Đang Xem Theo Thời Gian Thực
            </h3>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {filteredSessions.length} phiên
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#0f172a] border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSelectedSessionType('all')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                selectedSessionType === 'all'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất cả ({activeSessions.length})
            </button>
            <button
              onClick={() => setSelectedSessionType('movie')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                selectedSessionType === 'movie'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Phim ({movieSessions.length})
            </button>
            <button
              onClick={() => setSelectedSessionType('manga')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                selectedSessionType === 'manga'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Manga ({mangaSessions.length})
            </button>
            <button
              onClick={() => setSelectedSessionType('tv')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                selectedSessionType === 'tv'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              LiveTV ({tvSessions.length})
            </button>
          </div>
        </div>

        {/* Sessions Content */}
        {filteredSessions.length === 0 ? (
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Hiện chưa có người dùng nào đang phát nội dung</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Khi thành viên mở phát phim, đọc truyện tranh hoặc xem truyền hình LiveTV, thông tin và tiến độ sẽ tự động hiển thị trực tiếp tại đây.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map((session) => {
              const isMovie = session.type === 'watching_movie';
              const isManga = session.type === 'reading_manga';
              const isTv = session.type === 'watching_tv';

              // Calculate progress percentage
              let progress = session.progressPercent ?? 0;
              if (!progress && session.duration && session.duration > 0 && session.currentTime) {
                progress = Math.min(100, Math.round((session.currentTime / session.duration) * 100));
              }

              return (
                <div
                  key={session.sessionId}
                  className="bg-[#0f172a] border border-slate-800/80 hover:border-blue-700/50 rounded-2xl p-4 shadow-lg flex flex-col justify-between transition-all"
                >
                  <div className="space-y-3">
                    {/* Header: Viewer Profile & Type badge */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center font-bold text-sky-400 text-xs shrink-0">
                          {(session.profileName || session.accountDisplayName || 'U').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">
                            {session.profileName || session.accountDisplayName}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">@{session.accountId}</p>
                        </div>
                      </div>

                      {/* Badge Type */}
                      {isMovie && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 shrink-0 flex items-center gap-1">
                          <Film className="w-3 h-3" /> Phim
                        </span>
                      )}
                      {isManga && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> Manga
                        </span>
                      )}
                      {isTv && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 shrink-0 flex items-center gap-1">
                          <Tv className="w-3 h-3" /> LiveTV
                        </span>
                      )}
                    </div>

                    {/* Content Item Presentation */}
                    <div className="flex items-start gap-3">
                      {session.itemCover ? (
                        <img
                          src={session.itemCover}
                          alt={session.itemTitle}
                          className="w-12 h-16 object-cover rounded-lg border border-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-16 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                          <Sparkles className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                          {session.itemTitle}
                        </h4>
                        {session.itemSubtitle && (
                          <p className="text-[11px] text-sky-400 font-medium truncate mt-0.5">
                            {session.itemSubtitle}
                          </p>
                        )}
                        {session.apiSourceUsed && (
                          <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
                            Nguồn: {session.apiSourceUsed.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress details */}
                    {isMovie && session.duration && session.duration > 0 && (
                      <div className="space-y-1 bg-[#131f37]/60 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>{formatSeconds(session.currentTime)}</span>
                          <span className="font-bold text-sky-300">{progress}%</span>
                          <span>{formatSeconds(session.duration)}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-sky-400 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {isManga && (
                      <div className="bg-[#131f37]/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Trang đọc:</span>
                        <span className="font-bold text-emerald-400">
                          {session.currentTime || 1} / {session.duration || '?'} trang
                        </span>
                      </div>
                    )}

                    {isTv && (
                      <div className="bg-[#131f37]/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Trạng thái phát:</span>
                        <span className="font-bold text-amber-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          Đang phát trực tiếp
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer Heartbeat Time */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Cập nhật: {getTimeAgo(session.lastHeartbeat)}
                    </span>
                    <span className="font-mono text-slate-400">{session.deviceInfo || 'Web/Mobile'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
