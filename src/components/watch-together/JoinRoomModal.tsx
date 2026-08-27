import React, { useState } from 'react';
import { X, Lock, Loader2, Eye, EyeOff, Users } from 'lucide-react';

interface JoinRoomModalProps {
  isOpen: boolean;
  roomId: string;
  hostName: string;
  episode: string;
  viewersCount: number;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  roomId,
  hostName,
  episode,
  viewersCount,
  onClose,
  onSubmit,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu phòng.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit(password.trim());
    } catch (err: any) {
      setError(err.message || 'Mật khẩu sai. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-700/50 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Vào phòng xem chung</h3>
              <p className="text-xs text-slate-400">Nhập mật khẩu để tham gia</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-400">Host</p>
              <span className="flex items-center gap-1 text-xs text-sky-400">
                <Users className="w-3 h-3" />
                {viewersCount} đang xem
              </span>
            </div>
            <p className="text-sm font-semibold text-white">{hostName}</p>
            <p className="text-xs text-slate-400 mt-0.5">{episode}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Lock className="w-3.5 h-3.5 inline mr-1.5" />
              Mật khẩu phòng
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Nhập mật khẩu từ host"
                className="w-full px-4 py-2.5 pr-10 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p>{error}</p>
              <p className="text-xs text-red-400/70 mt-1">Liên hệ host để lấy mật khẩu.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang kiểm tra...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Vào phòng xem chung
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Room ID: {roomId.slice(0, 8)}...
          </p>
        </form>
      </div>
    </div>
  );
};
