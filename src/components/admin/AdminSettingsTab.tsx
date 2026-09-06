import React, { useState } from 'react';
import { Account } from '../../types';
import { systemApiService } from '../../services/systemApiService';
import { AdminNotificationsTab } from './AdminNotificationsTab';
import { AdminEcoSystemTab } from './AdminEcoSystemTab';
import { AdminAdblockTab } from './AdminAdblockTab';
import { Bell, LayoutGrid, Wrench, Trash2, ShieldCheck } from 'lucide-react';

interface AdminSettingsTabProps {
  currentAccount: Account;
  onShowToast: (msg: string) => void;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({
  currentAccount,
  onShowToast,
}) => {
  const [openSection, setOpenSection] = useState<'notifications' | 'ecosystem' | 'adblock' | 'maintenance'>('notifications');
  const [cacheClearState, setCacheClearState] = useState<boolean>(false);

  const handleClearCache = async () => {
    try {
      setCacheClearState(true);
      // Giữ lại phiên đăng nhập + backend URL (APK cần để gọi API)
      const keysToPreserve = [
        'gau_cinema_current_account',
        'gau_admin_active_tab',
        'gau_admin_main_section',
        'qtb_custom_backend_url',
        'gau_api_smart_fallback',
      ];
      const preserved: Record<string, string | null> = {};
      keysToPreserve.forEach((k) => {
        try {
          preserved[k] = localStorage.getItem(k);
        } catch {
          preserved[k] = null;
        }
      });
      const firebaseAuthKeys: Record<string, string> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('firebase:')) {
            const v = localStorage.getItem(k);
            if (v !== null) firebaseAuthKeys[k] = v;
          }
        }
      } catch {}
      try {
        localStorage.clear();
      } catch {}
      try {
        sessionStorage.clear();
      } catch {}
      keysToPreserve.forEach((k) => {
        try {
          if (preserved[k] !== null && preserved[k] !== undefined) localStorage.setItem(k, preserved[k]!);
        } catch {}
      });
      Object.entries(firebaseAuthKeys).forEach(([k, v]) => {
        try {
          localStorage.setItem(k, v);
        } catch {}
      });
      try {
        if (typeof caches !== 'undefined' && (caches as any)?.keys) {
          const names = await (caches as any).keys();
          await Promise.all((names as string[]).map((n) => (caches as any).delete(n).catch(() => false)));
        }
      } catch {}
      onShowToast('Đã dọn dẹp bộ nhớ tạm thành công!');
    } catch (e: any) {
      onShowToast(`Lỗi dọn cache: ${e.message}`);
    } finally {
      setTimeout(() => setCacheClearState(false), 500);
    }
  };

  const handleResetApis = async () => {
    if (window.confirm('Khôi phục danh sách nguồn mặc định?')) {
      try {
        await systemApiService.resetToDefaults();
        onShowToast('Đã khôi phục nguồn mặc định.');
      } catch (e: any) {
        onShowToast(`Lỗi: ${e.message}`);
      }
    }
  };

  const sections = [
    { id: 'notifications' as const, label: 'Thông báo', icon: <Bell className="w-4 h-4 text-amber-400" /> },
    { id: 'ecosystem' as const, label: 'Ứng dụng', icon: <LayoutGrid className="w-4 h-4 text-indigo-400" /> },
    { id: 'adblock' as const, label: 'Chặn QC', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" /> },
    { id: 'maintenance' as const, label: 'Bảo trì', icon: <Wrench className="w-4 h-4 text-slate-300" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[#0b1329] border border-blue-900/60 rounded-2xl">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpenSection(s.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex-1 justify-center ${
              openSection === s.id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {s.icon}
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {openSection === 'notifications' && (
        <AdminNotificationsTab currentAccount={currentAccount} onShowToast={onShowToast} />
      )}

      {openSection === 'ecosystem' && (
        <AdminEcoSystemTab currentAccount={currentAccount} onShowToast={onShowToast} />
      )}

      {openSection === 'adblock' && <AdminAdblockTab onShowToast={onShowToast} />}

      {openSection === 'maintenance' && (
        <div className="bg-[#0f172a] border border-blue-900/40 p-4 rounded-2xl shadow-lg space-y-2">
          <button
            onClick={handleClearCache}
            disabled={cacheClearState}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#131f37] border border-slate-800 active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            <span className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 text-amber-400" />
              <span className="text-left">
                <span className="block text-xs font-bold text-white">Dọn bộ nhớ tạm</span>
                <span className="block text-[11px] text-slate-400">Giữ nguyên tài khoản đăng nhập</span>
              </span>
            </span>
            <span className="text-[11px] font-bold text-amber-300">
              {cacheClearState ? 'Đang dọn...' : 'Dọn ngay'}
            </span>
          </button>

          <button
            onClick={handleResetApis}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#131f37] border border-slate-800 active:scale-[0.99] cursor-pointer"
          >
            <span className="text-left">
              <span className="block text-xs font-bold text-white">Khôi phục nguồn mặc định</span>
              <span className="block text-[11px] text-slate-400">Đặt lại danh sách nguồn phim ban đầu</span>
            </span>
            <span className="text-[11px] font-bold text-sky-300">Khôi phục</span>
          </button>
        </div>
      )}
    </div>
  );
};
