import React, { useState } from 'react';
import { authService } from '../services/authService';
import { Account } from '../types';
import { Lock, User, KeyRound, ShieldAlert, Sparkles, ShieldCheck, CheckCircle2, Film } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginScreenProps {
  onLoginSuccess: (account: Account) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Ensure admin exists in firestore
      await authService.bootstrapAdminAccount().catch((err) => console.warn(err));
      const account = await authService.login(username, password);
      onLoginSuccess(account);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="qtb-login-screen"
      className="fixed inset-0 z-50 bg-[#070b16] flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Background Ambience Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Brand Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center mb-8 text-center"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 tracking-tight drop-shadow-[0_2px_14px_rgba(59,130,246,0.6)]">
            QTB
          </span>
          <span className="text-xs sm:text-sm uppercase font-extrabold tracking-widest px-2.5 py-0.5 rounded-md bg-blue-950/90 text-sky-300 border border-blue-800/80 shadow-lg">
            CINEMA HD
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 font-medium">
          Rạp Chiếu Phim Cá Nhân & Gia Đình • Riêng Tư & Bảo Mật
        </p>
      </motion.div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-[#0f172a]/95 border border-blue-900/60 rounded-3xl p-6 sm:p-8 text-white shadow-2xl backdrop-blur-xl relative"
      >
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Đăng Nhập</h1>
            <p className="text-xs text-slate-400 mt-0.5">Sử dụng tài khoản được cấp để truy cập</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-sky-400">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 rounded-2xl bg-red-950/80 border border-red-800/80 flex items-start gap-3 text-red-200 text-xs shadow-lg"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">{errorMessage}</span>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Tên đăng nhập
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username-input"
                type="text"
                required
                autoComplete="username"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ fontSize: '15px' }}
                className="w-full bg-[#131f37] border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-2xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Mật khẩu
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="login-password-input"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ fontSize: '15px' }}
                className="w-full bg-[#131f37] border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-2xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang xác thực tài khoản...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Vào Xem Phim</span>
              </>
            )}
          </button>
        </form>

        {/* Private Policy Note */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Hệ thống chỉ cho phép đăng nhập, không mở đăng ký tự do.</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
