import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeftRight, Sparkles, RefreshCw } from 'lucide-react';
import { UserProfile } from '../types';
import appLogo from '../assets/images/app_logo.jpg';

interface ProfileSwitchLoaderProps {
  isOpen: boolean;
  profileA: UserProfile | null; // Null means switching from no-profile/login or using guest
  profileB: UserProfile | null;
  isDataReady: boolean;
  onComplete: () => void;
  minDurationMs?: number; // Minimum bounce phase duration, defaults to 1500ms
}

export const ProfileSwitchLoader: React.FC<ProfileSwitchLoaderProps> = ({
  isOpen,
  profileA,
  profileB,
  isDataReady,
  onComplete,
  minDurationMs = 1500,
}) => {
  const [phase, setPhase] = useState<'bounce' | 'swap' | 'fadeOut'>('bounce');
  const [isMobile, setIsMobile] = useState(false);

  // Check responsiveness on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Manage animation phases based on timing and data readiness
  useEffect(() => {
    if (!isOpen) {
      setPhase('bounce');
      return;
    }

    let isSubscribed = true;
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (isDataReady && elapsed >= minDurationMs) {
        clearInterval(checkInterval);
        if (isSubscribed) {
          // Transition to swap phase
          setPhase('swap');
        }
      }
    }, 100);

    return () => {
      isSubscribed = false;
      clearInterval(checkInterval);
    };
  }, [isOpen, isDataReady, minDurationMs]);

  // Handle completion of the swap phase
  useEffect(() => {
    if (phase === 'swap') {
      // The swap swoop takes 1000ms. After it finishes, transition to fadeOut
      const swapTimer = setTimeout(() => {
        setPhase('fadeOut');
      }, 1000);

      return () => clearTimeout(swapTimer);
    }
  }, [phase]);

  // When fadeOut completes, trigger the callback to dismiss and update parent state
  useEffect(() => {
    if (phase === 'fadeOut') {
      const fadeTimer = setTimeout(() => {
        onComplete();
      }, 400); // Duration matches the fadeOut animation

      return () => clearTimeout(fadeTimer);
    }
  }, [phase, onComplete]);

  if (!isOpen) return null;

  // Resolve avatars and names
  const avatarA = profileA?.avatar || appLogo;
  const avatarB = profileB?.avatar || appLogo;
  const colorA = profileA?.color || '#2563EB';
  const colorB = profileB?.color || '#38BDF8';
  const nameA = profileA?.name || 'Hệ Thống';
  const nameB = profileB?.name || 'Người xem';

  // Math-based parameters for precise responsive layout
  const avatarSize = isMobile ? 80 : 112; // w-20 to w-28
  const gapSize = isMobile ? 54 : 120; // Increased spacing significantly for user visibility
  const swapDistance = avatarSize + gapSize;

  // Render main loading component
  return (
    <AnimatePresence>
      {phase !== 'fadeOut' && (
        <motion.div
          id="profile-switch-loader-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] bg-[#070b16]/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 select-none overflow-hidden"
        >
          {/* Ambient Glowing Background Elements */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-20 blur-3xl transition-all duration-1000"
              style={{ backgroundColor: phase === 'swap' ? colorB : colorA }}
            />
            <div
              className="absolute top-1/2 right-1/3 translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-20 blur-3xl transition-all duration-1000"
              style={{ backgroundColor: phase === 'swap' ? colorA : colorB }}
            />
          </div>

          <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full">
            {/* Header Sparkles */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-sky-400 text-xs font-bold tracking-wide mb-8 shadow-sm shadow-blue-900/10"
            >
              <Sparkles className="w-4 h-4 animate-pulse text-amber-400" />
              <span className="uppercase font-semibold text-[10px]">Đang đồng bộ hồ sơ cá nhân</span>
            </motion.div>

            {/* Trading/Swapping Stage */}
            <div className="relative flex items-center justify-center h-48 w-full mb-8">
              {/* Profile A (Left) */}
              <motion.div
                id="avatar-a-container"
                animate={
                  phase === 'bounce'
                    ? {
                        y: [0, -18, 0],
                      }
                    : {
                        x: swapDistance,
                        y: [0, 40, 0], // Swoop downward
                        scale: [1, 0.9, 1.05],
                        zIndex: 20,
                      }
                }
                transition={
                  phase === 'bounce'
                    ? {
                        repeat: Infinity,
                        duration: 0.7,
                        ease: 'easeInOut',
                      }
                    : {
                        duration: 0.9,
                        ease: [0.34, 1.56, 0.64, 1], // Custom overshoot spring-like feel
                      }
                }
                className="relative rounded-full border-4 shadow-xl overflow-hidden shrink-0 bg-[#0f172a]"
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderColor: colorA,
                }}
              >
                <img
                  src={avatarA}
                  alt={nameA}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </motion.div>

              {/* Central Switch Icon Container */}
              <div className="relative flex items-center justify-center shrink-0" style={{ width: gapSize }}>
                {/* Visual pulse line */}
                <div className="absolute w-44 h-0.5 bg-gradient-to-r from-blue-500/20 via-sky-400/50 to-indigo-500/20 blur-xs" />

                <motion.div
                  animate={
                    phase === 'swap'
                      ? {
                          rotate: 360,
                          scale: [1, 1.4, 1],
                        }
                      : {
                          rotate: 0,
                          scale: 1,
                        }
                  }
                  transition={{
                    duration: phase === 'swap' ? 0.8 : 1.5,
                    ease: phase === 'swap' ? 'easeInOut' : 'linear',
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-300 relative z-10 ${
                    phase === 'swap'
                      ? 'bg-sky-500 border-sky-300 text-white shadow-lg shadow-sky-500/50'
                      : 'bg-slate-900/90 border-slate-700/80 text-slate-400'
                  }`}
                >
                  {phase === 'swap' ? (
                    <RefreshCw className="w-5 h-5 animate-spin duration-300" />
                  ) : (
                    <ArrowLeftRight className="w-5 h-5" />
                  )}
                </motion.div>

                {/* Ring wave overlay during swap */}
                {phase === 'swap' && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute w-12 h-12 rounded-full border-2 border-sky-400 pointer-events-none"
                  />
                )}
              </div>

              {/* Profile B (Right) */}
              <motion.div
                id="avatar-b-container"
                animate={
                  phase === 'bounce'
                    ? {
                        y: [0, -18, 0],
                      }
                    : {
                        x: -swapDistance,
                        y: [0, -40, 0], // Swoop upward (opposite path)
                        scale: [1, 0.9, 1.05],
                        zIndex: 20,
                      }
                }
                transition={
                  phase === 'bounce'
                    ? {
                        repeat: Infinity,
                        duration: 0.7,
                        ease: 'easeInOut',
                        delay: 0.35, // Offset to alternate bouncing
                      }
                    : {
                        duration: 0.9,
                        ease: [0.34, 1.56, 0.64, 1],
                      }
                }
                className="relative rounded-full border-4 shadow-xl overflow-hidden shrink-0 bg-[#0f172a]"
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderColor: colorB,
                }}
              >
                <img
                  src={avatarB}
                  alt={nameB}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </motion.div>
            </div>

            {/* Display labels below the swap */}
            <div className="flex justify-between w-full max-w-[214px] sm:max-w-[344px] mb-8 text-xs text-slate-500 font-bold tracking-wider px-2">
              <span style={{ color: phase === 'swap' ? colorB : colorA }} className="transition-colors duration-500 truncate max-w-[90px] sm:max-w-[130px]">
                {phase === 'swap' ? nameB : nameA}
              </span>
              <span style={{ color: phase === 'swap' ? colorA : colorB }} className="transition-colors duration-500 truncate max-w-[90px] sm:max-w-[130px]">
                {phase === 'swap' ? nameA : nameB}
              </span>
            </div>

            {/* Status Messages */}
            <div className="space-y-2 px-4 h-16">
              <AnimatePresence mode="wait">
                <motion.h3
                  key={phase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="text-base sm:text-lg font-bold text-white tracking-tight"
                >
                  {phase === 'bounce' ? (
                    <span className="flex items-center justify-center gap-2">
                      Đang kết nối dữ liệu người xem...
                    </span>
                  ) : (
                    <span>Đang chuyển sang hồ sơ {nameB}!</span>
                  )}
                </motion.h3>
              </AnimatePresence>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">
                Vui lòng đợi trong giây lát khi hệ thống thiết lập không gian của bạn.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
