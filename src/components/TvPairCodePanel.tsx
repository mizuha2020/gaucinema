import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, RefreshCw, X, CheckCircle2, Loader2 } from 'lucide-react';
import { tvPairService, TV_PAIR_TTL_MS, type TvPairDoc } from '../services/tvPairService';
import type { Account } from '../types';

interface TvPairCodePanelProps {
  onPaired: (account: Account) => void;
  onBackToPassword: () => void;
}

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Panel TV: hiện mã 6 ký tự to, chờ duyệt trên điện thoại. */
export const TvPairCodePanel: React.FC<TvPairCodePanelProps> = ({ onPaired, onBackToPassword }) => {
  const [pair, setPair] = useState<TvPairDoc | null>(null);
  const [leftMs, setLeftMs] = useState(TV_PAIR_TTL_MS);
  const [phase, setPhase] = useState<'creating' | 'waiting' | 'fetching' | 'expired' | 'error'>('creating');
  const [error, setError] = useState<string | null>(null);
  const pairRef = useRef<TvPairDoc | null>(null);
  pairRef.current = pair;
  const doneRef = useRef(false);

  const create = async () => {
    setPhase('creating');
    setError(null);
    doneRef.current = false;
    try {
      const p = await tvPairService.createCode();
      setPair(p);
      setLeftMs(p.expiresAt - Date.now());
      setPhase('waiting');
    } catch (e: any) {
      // Offline / quota: rớt về đăng nhập mật khẩu
      setError(e?.message || 'Không tạo được mã. Kiểm tra mạng rồi thử lại.');
      setPhase('error');
    }
  };

  useEffect(() => {
    create();
    return () => {
      // Đổi màn hình mà chưa pair xong -> thu hồi mã
      if (!doneRef.current && pairRef.current) {
        tvPairService.revoke(pairRef.current.code).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown + hết hạn
  useEffect(() => {
    if (phase !== 'waiting' || !pair) return;
    const id = window.setInterval(() => {
      const left = pair.expiresAt - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        setPhase('expired');
        tvPairService.revoke(pair.code).catch(() => {});
      } else {
        setLeftMs(left);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [phase, pair]);

  // Nghe duyệt từ điện thoại
  useEffect(() => {
    if (phase !== 'waiting' || !pair) return;
    const unsub = tvPairService.subscribeCode(pair.code, async (d) => {
      if (!d || doneRef.current) return;
      if (d.status === 'approved') {
        doneRef.current = true;
        setPhase('fetching');
        try {
          const acc = await tvPairService.consumeApproved(pair.code);
          onPaired(acc);
        } catch (e: any) {
          doneRef.current = false;
          setError(e?.message || 'Không lấy được tài khoản đã duyệt.');
          setPhase('error');
        }
      }
    });
    return unsub;
  }, [phase, pair, onPaired]);

  return (
    <div className="space-y-4 text-center" id="tv-pair-panel">
      <div className="flex items-center justify-center gap-2 text-sky-300">
        <Smartphone className="w-5 h-5" />
        <h2 className="text-lg sm:text-xl font-bold text-white">Đăng nhập bằng điện thoại</h2>
      </div>

      {phase === 'creating' && (
        <div className="py-8 flex flex-col items-center gap-3 text-slate-400 text-sm">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span>Đang tạo mã ghép đôi...</span>
        </div>
      )}

      {phase === 'fetching' && (
        <div className="py-8 flex flex-col items-center gap-3 text-slate-300 text-sm">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <span className="font-semibold text-white">Đã duyệt! Đang đăng nhập...</span>
        </div>
      )}

      {(phase === 'waiting' && pair) && (
        <>
          <p className="text-xs sm:text-sm text-slate-400">
            Trên điện thoại đã đăng nhập, mở <strong className="text-slate-200">menu tài khoản → Ghép đôi TV</strong> rồi nhập mã:
          </p>
          <div
            className="mx-auto font-mono font-black tracking-[0.35em] text-4xl sm:text-5xl text-white bg-[#131f37] border-2 border-sky-500/50 rounded-2xl py-4 pl-6 select-all"
            aria-live="polite"
          >
            {pair.code}
          </div>
          <p className="text-xs text-slate-400">
            Mã hết hạn sau <strong className="text-amber-300 tabular-nums">{fmtLeft(leftMs)}</strong>
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Đang chờ duyệt trên điện thoại...</span>
          </div>
        </>
      )}

      {phase === 'expired' && (
        <div className="py-4 space-y-3">
          <p className="text-sm text-amber-300 font-semibold">Mã đã hết hạn (5 phút).</p>
          <button
            onClick={create}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tạo mã mới</span>
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="py-2 space-y-3">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={create}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      <div className="pt-1 flex items-center justify-center gap-2">
        <button
          onClick={() => {
            if (pair && !doneRef.current) tvPairService.revoke(pair.code).catch(() => {});
            onBackToPassword();
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Nhập mật khẩu thay thế</span>
        </button>
      </div>
    </div>
  );
};
