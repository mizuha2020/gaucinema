import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Tv, X, Loader2, CheckCircle2 } from 'lucide-react';
import { tvPairService, normalizePairCode } from '../services/tvPairService';
import type { Account } from '../types';

interface TvPairApproveModalProps {
  account: Account;
  onClose: () => void;
}

/** Modal trên thiết bị đã login: nhập mã 6 ký tự đang hiện trên TV. */
export const TvPairApproveModal: React.FC<TvPairApproveModalProps> = ({ account, onClose }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || done) return;
    setError(null);
    const normalized = normalizePairCode(code);
    if (normalized.length !== 6) {
      setError('Mã gồm 6 ký tự (chữ + số, không lẫn 0/O, 1/I).');
      return;
    }
    setIsLoading(true);
    try {
      await tvPairService.approveCode(normalized, account);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Duyệt mã thất bại, thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-[#0f172a] border border-blue-900/80 rounded-3xl p-5 sm:p-6 text-white text-center shadow-2xl relative"
      >
        <div className="w-14 h-14 rounded-2xl bg-sky-950/80 border border-sky-800/60 flex items-center justify-center mx-auto mb-3">
          <Tv className="w-7 h-7 text-sky-400" />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-sky-200">Ghép đôi TV</h3>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Nhập mã 6 ký tự đang hiện trên màn hình TV để đăng nhập tài khoản
          <strong className="text-slate-200"> @{account.username}</strong> trên TV đó.
        </p>

        {done ? (
          <div className="space-y-4 py-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-emerald-300 font-semibold">TV đã đăng nhập thành công!</p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-sm font-bold cursor-pointer"
            >
              Xong
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(normalizePairCode(e.target.value));
                setError(null);
              }}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ fontSize: '16px' }}
              className="w-48 mx-auto block text-center tracking-[0.4em] text-2xl font-mono font-bold bg-[#131f37] border border-slate-700 rounded-xl px-3 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 uppercase"
            />
            {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl text-white shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isLoading ? 'Đang duyệt...' : 'Duyệt đăng nhập'}</span>
              </button>
            </div>
          </form>
        )}

        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute top-3 right-3 text-slate-500 hover:text-white p-1 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
    </div>
  );
};
