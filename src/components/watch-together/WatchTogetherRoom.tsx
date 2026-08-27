import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Copy,
  Check,
  LogOut,
  Users,
  Send,
  MessageSquare,
  Crown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Volume2,
  VolumeX,
  Loader2,
  AlertCircle,
  X,
  Radio,
  UserX,
  Ban,
  Trash2,
  PictureInPicture2,
} from 'lucide-react';
import { WatchRoom, WatchRoomMember, PlaybackState, RoomChatMessage } from '../../types';
import { watchTogetherService } from '../../services/watchTogetherService';

interface WatchTogetherRoomProps {
  room: WatchRoom;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  onLeave: () => void;
  onEndRoom: () => Promise<void>;
}

function getMirrorUrls(originalUrl: string): string[] {
  if (!originalUrl) return [];
  const mirrors = [
    'vip.opstream15.com',
    'vip.opstream16.com',
    'vip.opstream17.com',
    's1.phim1280.tv',
  ];
  const list: string[] = [originalUrl];
  try {
    const url = new URL(originalUrl);
    const host = url.host;
    if (host.includes('opstream') || host.includes('phim1280')) {
      for (const m of mirrors) {
        if (m !== host) {
          const copy = new URL(originalUrl);
          copy.host = m;
          list.push(copy.toString());
        }
      }
    }
  } catch {}
  return list;
}

export const WatchTogetherRoom: React.FC<WatchTogetherRoomProps> = ({
  room,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onLeave,
  onEndRoom,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHost = room.hostId === currentUserId;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [screeningStarted, setScreeningStarted] = useState(false);

  const [members, setMembers] = useState<WatchRoomMember[]>([]);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const controlsTimer = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubMembers = watchTogetherService.subscribeMembers(room.roomId, setMembers);
    const unsubChat = watchTogetherService.subscribeChat(room.roomId, setChatMessages);
    return () => { unsubMembers(); unsubChat(); };
  }, [room.roomId]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (isHost) return;
    const unsub = watchTogetherService.subscribePlayback(room.roomId, (state: PlaybackState) => {
      const video = videoRef.current;
      if (!video) return;
      setIsSyncing(true);
      const diff = Math.abs(video.currentTime - state.position);
      if (diff > 2) video.currentTime = state.position;
      if (state.isPlaying && video.paused) video.play().catch(() => {});
      else if (!state.isPlaying && !video.paused) video.pause();
      if (state.isPlaying) setScreeningStarted(true);
      setTimeout(() => setIsSyncing(false), 500);
    });
    return () => unsub();
  }, [room.roomId, isHost]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !room.linkM3u8) return;
    setIsLoading(true);
    setErrorMsg(null);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const candidates = getMirrorUrls(room.linkM3u8);
    let candidateIndex = 0;
    const tryNext = (hls: Hls) => {
      candidateIndex++;
      if (candidateIndex < candidates.length) { hls.loadSource(candidates[candidateIndex]); hls.startLoad(); return; }
      setErrorMsg('Không thể tải luồng phát.'); setIsLoading(false);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000, startLevel: -1, capLevelToPlayerSize: true });
      hlsRef.current = hls;
      hls.loadSource(candidates[0]);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setIsLoading(false); });
      let errorCount = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          errorCount++;
          if (errorCount <= 2) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else tryNext(hls);
          } else tryNext(hls);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = room.linkM3u8;
      video.addEventListener('loadedmetadata', () => { setIsLoading(false); }, { once: true });
    } else {
      setErrorMsg('Trình duyệt không hỗ trợ phát HLS.'); setIsLoading(false);
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [room.linkM3u8, room.roomId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      if (isHost) {
        const now = Date.now();
        if (now - ((watchTogetherService as any)._lastSync || 0) > 2000) {
          (watchTogetherService as any)._lastSync = now;
          watchTogetherService.updatePlayback(room.roomId, currentUserId, { position: video.currentTime, isPlaying: !video.paused });
        }
      }
    };
    const onPlay = () => { setIsPlaying(true); if (isHost) watchTogetherService.updatePlayback(room.roomId, currentUserId, { isPlaying: true, position: video.currentTime }); };
    const onPause = () => { setIsPlaying(false); if (isHost) watchTogetherService.updatePlayback(room.roomId, currentUserId, { isPlaying: false, position: video.currentTime }); };
    const onSeeked = () => { if (isHost) watchTogetherService.updatePlayback(room.roomId, currentUserId, { position: video.currentTime, isPlaying: !video.paused }); };
    const onEnded = () => { setIsPlaying(false); };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onEnded);
    };
  }, [room.roomId, currentUserId, isHost]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const togglePlay = () => {
    if (!isHost) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const skip = (seconds: number) => {
    if (!isHost) return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    } catch {}
  };

  const handleStartScreening = async () => {
    await watchTogetherService.sendChat(room.roomId, {
      senderId: 'system',
      senderName: 'Hệ thống',
      text: `${currentUserName} đã bắt đầu công chiếu!`,
      type: 'system',
    });
    setScreeningStarted(true);
    const video = videoRef.current;
    if (video) video.play().catch(() => {});
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(watchTogetherService.copyRoomLink(room.roomId)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    await watchTogetherService.sendChat(room.roomId, { senderId: currentUserId, senderName: currentUserName, senderAvatar: currentUserAvatar, text, type: 'user' });
  };

  const handleEndRoom = async () => {
    if (!window.confirm('Kết thúc phòng xem chung?')) return;
    await onEndRoom();
  };

  const handleLeave = () => {
    if (!window.confirm('Rời khỏi phòng xem chung?')) return;
    onLeave();
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Xóa thành viên này khỏi phòng?')) return;
    await watchTogetherService.removeMember(room.roomId, memberId);
  };

  const handleBanChat = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Cấm chat ${memberName}?`)) return;
    await watchTogetherService.banChat(room.roomId, memberId);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (room.status === 'closed') {
    return (
      <div className="fixed inset-0 z-[80] bg-[#060a14] flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-600/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Phòng đã kết thúc</h2>
          <p className="text-slate-400">Host đã đóng phòng xem chung.</p>
          <button onClick={onLeave} className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors">
            Quay về trang phim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[#060a14] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 bg-[#0b1329] border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={handleLeave} className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{room.filmName}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{room.episode}</span>
              {isHost && <span className="px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 text-[10px] font-bold">HOST</span>}
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {members.length}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopyLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-xs font-medium transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Đã copy' : 'Copy link'}</span>
          </button>
          {isHost ? (
            <button onClick={handleEndRoom} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 text-xs font-medium transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kết thúc</span>
            </button>
          ) : (
            <button onClick={handleLeave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-white text-xs font-medium transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rời phòng</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Player Area */}
        <div className={`flex-1 flex flex-col min-w-0 ${showChat ? 'hidden md:flex' : 'flex'}`}>
          <div
            ref={containerRef}
            className="relative flex-1 bg-black min-h-0 cursor-pointer"
            onMouseMove={resetControlsTimer}
            onClick={isHost ? togglePlay : undefined}
          >
            <video ref={videoRef} className="w-full h-full object-contain" playsInline onClick={(e) => e.stopPropagation()} />

            {/* LIVE Badge for viewers */}
            {!isHost && screeningStarted && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-red-600/90 text-white text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <Radio className="w-3 h-3" />
                LIVE
              </div>
            )}

            {/* Start Screening overlay for host */}
            {isHost && !screeningStarted && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={handleStartScreening}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-lg shadow-2xl shadow-emerald-600/40 transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="w-6 h-6 fill-white" />
                  Bắt đầu công chiếu
                </button>
              </div>
            )}

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center space-y-2">
                  <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
                  <p className="text-sm text-slate-300">Đang tải...</p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center space-y-3 p-6">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                  <p className="text-sm text-red-300">{errorMsg}</p>
                </div>
              </div>
            )}

            {isSyncing && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-sky-600/80 text-white text-xs font-medium flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Đang đồng bộ...
              </div>
            )}

            {/* Controls */}
            {showControls && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" onClick={(e) => e.stopPropagation()}>
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 space-y-2 pointer-events-auto">
                  {isHost && (
                    <div className="group/progress cursor-pointer h-1 hover:h-1.5 bg-slate-600/50 rounded-full transition-all relative">
                      <div className="absolute inset-y-0 left-0 bg-sky-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-sky-400 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow" style={{ left: `calc(${progress}% - 6px)` }} />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isHost ? (
                        <>
                          <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                            {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                          </button>
                          <button onClick={() => skip(-10)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
                            <SkipBack className="w-4 h-4 text-white" />
                          </button>
                          <button onClick={() => skip(10)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
                            <SkipForward className="w-4 h-4 text-white" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 px-2">
                          {isPlaying ? 'Đang phát' : 'Tạm dừng'}
                        </span>
                      )}
                      <button onClick={toggleMute} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                        {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                      </button>
                      {isHost && (
                        <span className="text-xs text-slate-300 hidden sm:inline">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 hidden sm:inline">
                        {isHost ? 'Bạn là host' : `${room.hostName} đang điều khiển`}
                      </span>
                      <button onClick={togglePiP} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="Picture in Picture">
                        <PictureInPicture2 className="w-4 h-4 text-white" />
                      </button>
                      <button onClick={toggleFullscreen} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                        <Maximize className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowChat(!showChat)}
            className="md:hidden flex items-center justify-center gap-2 py-2.5 bg-[#0b1329] border-t border-slate-700/50 text-sky-400 text-sm font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            {showChat ? 'Ẩn chat' : `Chat (${chatMessages.length})`}
          </button>
        </div>

        {/* Chat Sidebar */}
        <div className={`${showChat ? 'flex' : 'hidden md:flex'} w-full md:w-80 lg:w-96 flex-col bg-[#0b1329] border-l border-slate-700/50 ${showChat ? 'absolute inset-0 md:relative md:w-80 lg:w-96' : ''}`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 shrink-0">
            <button onClick={() => setShowMembers(!showMembers)} className="flex items-center gap-2 text-sm font-semibold text-white hover:text-sky-300 transition-colors">
              {showMembers ? <Crown className="w-4 h-4 text-amber-400" /> : <MessageSquare className="w-4 h-4 text-sky-400" />}
              {showMembers ? `Thành viên (${members.length})` : `Chat (${chatMessages.length})`}
            </button>
            <button onClick={() => setShowChat(false)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {showMembers ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {m.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white truncate">{m.userName}</span>
                        {m.role === 'host' && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                        {m.userId === currentUserId && <span className="text-[10px] text-sky-400">(bạn)</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        Tham gia {new Date(m.joinedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {isHost && m.userId !== currentUserId && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleBanChat(m.userId, m.userName)} className="p-1.5 rounded-lg hover:bg-amber-600/20 text-slate-500 hover:text-amber-400 transition-colors" title="Cấm chat">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleRemoveMember(m.userId)} className="p-1.5 rounded-lg hover:bg-red-600/20 text-slate-500 hover:text-red-400 transition-colors" title="Xóa khỏi phòng">
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.map((msg) => (
                  <div key={msg.messageId} className={msg.type === 'system' ? 'text-center' : ''}>
                    {msg.type === 'system' ? (
                      <p className="text-[11px] text-slate-500 italic py-1">{msg.text}</p>
                    ) : (
                      <div className={`flex gap-2 ${msg.senderId === currentUserId ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                          {msg.senderName.charAt(0).toUpperCase()}
                        </div>
                        <div className={`max-w-[75%] ${msg.senderId === currentUserId ? 'text-right' : ''}`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {msg.senderId !== currentUserId && <span className="text-[11px] font-semibold text-sky-400">{msg.senderName}</span>}
                            <span className="text-[10px] text-slate-600">
                              {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={`inline-block px-3 py-1.5 rounded-2xl text-sm ${
                            msg.senderId === currentUserId ? 'bg-sky-600 text-white rounded-br-md' : 'bg-slate-800 text-slate-200 rounded-bl-md'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendChat} className="p-3 border-t border-slate-700/50 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 px-3 py-2 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500/60 transition-all"
                    maxLength={500}
                  />
                  <button type="submit" disabled={!chatInput.trim()} className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
