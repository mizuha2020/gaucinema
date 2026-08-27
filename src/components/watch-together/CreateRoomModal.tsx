import React, { useState } from 'react';
import { X, Lock, Globe, Users, Loader2 } from 'lucide-react';
import { RoomVisibility } from '../../types';

interface CreateRoomModalProps {
  isOpen: boolean;
  filmName: string;
  episode: string;
  onClose: () => void;
  onSubmit: (password: string, visibility: RoomVisibility) => Promise<void>;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  filmName,
  episode,
  onClose,
  onSubmit,
}) => {
  const [password, setPassword] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('private');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (visibility === 'private') {
      if (!password.trim()) {
        setError('Vui lòng nhập mật khẩu phòng.');
        return;
      }
      if (password.length < 4) {
        setError('Mật khẩu phải có ít nhất 4 ký tự.');
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit(password.trim(), visibility);
    } catch (err: any) {
      setError(err.message || 'Không thể tạo phòng. Thử lại sau.');
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
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Tạo phòng xem chung</h3>
              <p className="text-xs text-slate-400">Mời bạn bè一起 xem phim</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
            <p className="text-xs text-slate-400 mb-1">Phim</p>
            <p className="text-sm font-semibold text-white">{filmName}</p>
            <p className="text-xs text-sky-400 mt-0.5">{episode}</p>
          </div>

          {visibility === 'private' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                <Lock className="w-3.5 h-3.5 inline mr-1.5" />
                Mật khẩu phòng
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Nhập mật khẩu (tối thiểu 4 ký tự)"
                className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Hiển thị</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  visibility === 'private'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800/50 border-slate-700/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Lock className="w-4 h-4" />
                Riêng tư
              </button>
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  visibility === 'public'
                    ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
                    : 'bg-slate-800/50 border-slate-700/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                Công khai
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tạo phòng...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Tạo phòng xem chung
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
