import React, { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, X } from 'lucide-react';
import { motion } from 'motion/react';
import { authService } from '../services/authService';

interface AdminConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  actionButtonText?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const AdminConfirmModal: React.FC<AdminConfirmModalProps> = ({
  isOpen,
  title,
  description,
  actionButtonText = 'Xác nhận thực hiện',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setError('Vui lòng nhập mật khẩu tài khoản Admin để xác thực.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Re-authenticate admin credentials against authService / Firestore
      await authService.login('admin', adminPassword);
      await onConfirm();
      setAdminPassword('');
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Mật khẩu Admin không chính xác. Thao tác bị từ chối.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setAdminPassword('');
    setError(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0f172a] border border-blue-900/80 rounded-3xl p-5 sm:p-6 text-white shadow-2xl relative"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-2xl border ${isDestructive ? 'bg-red-950/80 border-red-800 text-red-400' : 'bg-blue-950/80 border-blue-800 text-sky-400'}`}>
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Xác thực quyền quản trị viên</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action description */}
        <div className="mb-4 p-3 rounded-2xl bg-[#131f37]/70 border border-slate-800 text-xs text-slate-300 leading-relaxed">
          {description}
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Nhập mật khẩu Admin để xác nhận:
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                autoFocus
                placeholder="Mật khẩu tài khoản admin..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                style={{ fontSize: '15px' }}
                className="w-full bg-[#131f37] border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl text-white shadow-lg transition-transform active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
                isDestructive
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <span>{actionButtonText}</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
