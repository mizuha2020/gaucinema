import React, { useEffect, useState } from 'react';
import { Film, Clapperboard, Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface InitialLoaderProps {
  isLoading: boolean;
}

export const InitialLoader: React.FC<InitialLoaderProps> = ({ isLoading }) => {
  const [progress, setProgress] = useState(15);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [shouldRender, setShouldRender] = useState(isLoading);

  const loadingMessages = [
    'Đang kết nối máy chủ phim chất lượng cao...',
    'Đang tải kho phim 4K Vietsub & Thuyết minh...',
    'Khởi tạo rạp chiếu 100% không quảng cáo...',
    'Sẵn sàng trải nghiệm rạp phim đỉnh cao...',
  ];

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.floor(Math.random() * 15 + 8);
        });
      }, 250);

      const textInterval = setInterval(() => {
        setLoadingTextIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 700);

      return () => {
        clearInterval(progressInterval);
        clearInterval(textInterval);
      };
    } else {
      setProgress(100);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      id="app-initial-loader"
      className={`fixed inset-0 z-[100] bg-[#070b16] flex flex-col items-center justify-center p-4 select-none transition-opacity duration-350 ${
        !isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background cinematic aura glow */}
      <div className="absolute w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute w-64 h-64 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Main Loader Card */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full">
        {/* Animated Brand Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-400 p-0.5 shadow-2xl shadow-blue-500/30">
            <div className="w-full h-full bg-[#0b1329] rounded-[14px] flex items-center justify-center relative overflow-hidden">
              <Film className="w-10 h-10 text-cyan-400 animate-spin-slow" style={{ animationDuration: '8s' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-transparent" />
            </div>
          </div>
          {/* Pulsing ring */}
          <div className="absolute -inset-2 rounded-3xl border border-blue-500/40 animate-ping opacity-40 pointer-events-none" />
        </div>

        {/* Title */}
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-sky-400">
            QTB CINEMA
          </h1>
          <p className="text-xs text-sky-400/90 font-semibold tracking-wide">
            RẠP PHIM TRỰC TUYẾN CAO CẤP
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800/80 rounded-full h-1.5 p-0.5 overflow-hidden border border-blue-900/50 mb-3 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-300 rounded-full transition-all duration-300 ease-out shadow-lg shadow-cyan-500/50"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Dynamic Status Text */}
        <div className="h-6 flex items-center justify-center">
          <p className="text-xs text-slate-300 font-medium animate-pulse">
            {loadingMessages[loadingTextIndex]}
          </p>
        </div>

        {/* Feature Badges */}
        <div className="mt-8 flex items-center justify-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            0% Quảng Cáo
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Full HD / 4K
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Tốc Độ Cao
          </span>
        </div>
      </div>
    </div>
  );
};
