import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Music,
  CloudRain,
  Trees,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
  Check,
  Sparkles,
  Info,
} from 'lucide-react';
import { mangaBgmService, BGM_TRACKS, MangaBgmState } from '../../services/mangaBgmService';

interface MangaBgmModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MangaBgmModal: React.FC<MangaBgmModalProps> = ({ isOpen, onClose }) => {
  const [bgmState, setBgmState] = useState<MangaBgmState>(() => mangaBgmService.getState());

  useEffect(() => {
    const unsub = mangaBgmService.subscribe(setBgmState);
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleTogglePlay = async () => {
    await mangaBgmService.toggle();
  };

  const handleSelectTrack = async (trackId: string) => {
    await mangaBgmService.setTrack(trackId);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    mangaBgmService.setVolume(val);
  };

  const renderTrackIcon = (iconType: string, isSelected: boolean) => {
    const className = `w-5 h-5 ${isSelected ? 'text-fuchsia-400' : 'text-slate-400'}`;
    switch (iconType) {
      case 'cloud-rain':
        return <CloudRain className={className} />;
      case 'trees':
        return <Trees className={className} />;
      case 'music':
      default:
        return <Music className={className} />;
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-[#0f111e] border border-purple-500/30 rounded-3xl shadow-2xl overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-[#14172a] border-b border-purple-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
                <Music className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Nhạc Nền Đọc Truyện</span>
                  {bgmState.isPlaying && (
                    <span className="flex items-center gap-0.5 h-3">
                      <span className="w-1 h-3 bg-fuchsia-400 rounded-full animate-pulse" />
                      <span className="w-1 h-2 bg-purple-400 rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-3.5 bg-pink-400 rounded-full animate-pulse delay-150" />
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">Tạo không gian đọc thư giãn & tập trung</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-slate-700"
              title="Đóng cửa sổ (nhạc vẫn tiếp tục phát)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5">
            {/* Master Toggle Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-purple-950/40 border border-purple-800/50">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleTogglePlay}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shadow-md cursor-pointer ${
                    bgmState.isPlaying
                      ? 'bg-gradient-to-tr from-fuchsia-600 to-purple-600 text-white shadow-purple-600/40 scale-105'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={bgmState.isPlaying ? 'Tạm dừng' : 'Bật nhạc'}
                >
                  {bgmState.isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>
                <div>
                  <span className="text-sm font-bold text-white block">
                    {bgmState.isPlaying ? 'Đang phát nhạc nền' : 'Đang tắt nhạc nền'}
                  </span>
                  <span className="text-xs text-purple-300">
                    {bgmState.isPlaying ? 'Tự động lặp lại khi đọc' : 'Nhấn nút để bật âm thanh'}
                  </span>
                </div>
              </div>

              {/* Quick Toggle Switch */}
              <button
                onClick={handleTogglePlay}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  bgmState.isPlaying ? 'bg-purple-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    bgmState.isPlaying ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Track Selection List */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block px-1">
                Chọn giai điệu
              </span>
              <div className="space-y-2">
                {BGM_TRACKS.map((track) => {
                  const isSelected = bgmState.selectedTrackId === track.id;
                  const isCurrentlyPlayingThis = isSelected && bgmState.isPlaying;

                  return (
                    <button
                      key={track.id}
                      onClick={() => handleSelectTrack(track.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-purple-900/40 border-purple-500/70 text-white shadow-lg shadow-purple-950/50'
                          : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-purple-600/30 border-purple-500/50 text-fuchsia-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {renderTrackIcon(track.iconType, isSelected)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold truncate flex items-center gap-2">
                            <span>{track.title}</span>
                            {isCurrentlyPlayingThis && (
                              <span className="text-[10px] bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 px-1.5 py-0.2 rounded-full font-bold">
                                Đang phát
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">{track.description}</p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-fuchsia-600 text-white flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-slate-700" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Volume Slider */}
            <div className="space-y-2 bg-[#14172a] p-3.5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-300 flex items-center gap-1.5">
                  {bgmState.volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-purple-400" />
                  )}
                  <span>Âm lượng nhạc nền</span>
                </span>
                <span className="font-mono font-bold text-fuchsia-300">
                  {Math.round(bgmState.volume * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={bgmState.volume}
                  onChange={handleVolumeChange}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                />
              </div>
            </div>

            {/* Notice Footer */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-200 text-xs leading-relaxed">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                Nhạc nền sẽ <strong>tiếp tục phát liên tục</strong> trong lúc bạn lướt đọc các chương truyện. Đóng cửa sổ này không làm tắt nhạc.
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
