import React, { useState, useEffect, useCallback } from 'react';
import { ActiveApp, AppConfig, Account } from '../../types';
import { appConfigService } from '../../services/appConfigService';
import {
  Film,
  BookOpen,
  Youtube,
  Clapperboard,
  Power,
  PowerOff,
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface AdminEcoSystemTabProps {
  currentAccount: Account | null;
  onShowToast?: (msg: string) => void;
}

const APP_ICONS: Record<ActiveApp, React.ReactNode> = {
  cinema: <Film className="w-5 h-5" />,
  manga: <BookOpen className="w-5 h-5" />,
};

const APP_COLORS: Record<ActiveApp, { bg: string; border: string; text: string; glow: string }> = {
  cinema: { bg: 'bg-sky-950/60', border: 'border-sky-700/60', text: 'text-sky-400', glow: 'shadow-sky-500/20' },
  manga: { bg: 'bg-purple-950/60', border: 'border-purple-700/60', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
};

export const AdminEcoSystemTab: React.FC<AdminEcoSystemTabProps> = ({
  currentAccount,
  onShowToast,
}) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingApp, setTogglingApp] = useState<ActiveApp | null>(null);

  useEffect(() => {
    setIsLoading(true);
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    // Fallback: if RTDB never responds, use default config after 3s
    fallbackTimer = setTimeout(() => {
      setConfig(appConfigService.getConfig());
      setIsLoading(false);
    }, 3000);

    const unsub = appConfigService.subscribe((cfg) => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      setConfig(cfg);
      setIsLoading(false);
    });

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  const handleToggle = useCallback(async (app: ActiveApp) => {
    if (app === 'cinema' || !config || togglingApp) return;

    const currentEnabled = config[app]?.enabled ?? true;
    const newEnabled = !currentEnabled;

    if (!newEnabled) {
      const confirmed = window.confirm(
        `Ẩn "${config[app]?.label || app}" sẽ gửi thông báo đến tất cả người dùng đang dùng app này.\n\nHọ sẽ bị đá ra Cinema sau 5 phút.\n\nBạn chắc chắn?`
      );
      if (!confirmed) return;
    }

    setTogglingApp(app);
    try {
      await appConfigService.toggleApp(app, newEnabled, currentAccount?.id);
      onShowToast?.(
        newEnabled
          ? `Đã hiển thị "${config[app]?.label || app}" cho tất cả người dùng`
          : `Đã ẩn "${config[app]?.label || app}" — người dùng sẽ nhận thông báo bảo trì`
      );
    } catch (e: any) {
      onShowToast?.(`Lỗi: ${e?.message || 'Không thể thay đổi'}`);
    } finally {
      setTogglingApp(null);
    }
  }, [config, togglingApp, currentAccount, onShowToast]);

  const handleInitDefault = useCallback(async () => {
    try {
      await appConfigService.initDefaultConfig();
      onShowToast?.('Đã khởi tạo lại cấu hình mặc định');
    } catch (e: any) {
      onShowToast?.(`Lỗi: ${e?.message || 'Không thể khởi tạo'}`);
    }
  }, [onShowToast]);

  const apps: ActiveApp[] = ['cinema', 'manga'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0b1329] border border-blue-900/60 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Power className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Quản Lý Hệ Sinh Thái</h3>
              <p className="text-xs text-slate-400">Ẩn/hiện các app trong hệ sinh thái Gấu</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleInitDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer border border-slate-700"
          >
            <RefreshCw className="w-3 h-3" />
            Khôi phục mặc định
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl p-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-200">
          <strong>Cảnh báo:</strong> Khi ẩn app, tất cả người dùng đang sử dụng app đó sẽ nhận thông báo bảo trì và bị chuyển về Cinema sau 5 phút.
          <strong> Gấu Cinema HD</strong> luôn được bật (là home mặc định).
        </div>
      </div>

      {/* Apps Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 animate-pulse">
              <div className="h-6 bg-slate-800 rounded w-1/3 mb-3" />
              <div className="h-4 bg-slate-800 rounded w-2/3 mb-4" />
              <div className="h-8 bg-slate-800 rounded-full w-24" />
            </div>
          ))}
        </div>
      ) : config ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {apps.map((app) => {
            const appConfig = config[app];
            const isEnabled = appConfig?.enabled ?? true;
            const isCinema = app === 'cinema';
            const isToggling = togglingApp === app;
            const colors = APP_COLORS[app];

            return (
              <div
                key={app}
                className={`bg-[#0f172a] border rounded-2xl p-5 shadow-lg transition-all ${
                  isEnabled ? `border-slate-700/80 hover:${colors.border}` : 'border-red-900/60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center ${colors.text}`}>
                      {APP_ICONS[app]}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{appConfig?.label || app}</h4>
                      <p className="text-[11px] text-slate-400">{appConfig?.description || ''}</p>
                    </div>
                  </div>
                  {isCinema && (
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-sky-950 text-sky-300 border border-sky-700/60 rounded-full flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      ALWAYS ON
                    </span>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {isEnabled ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400">Đang hiển thị</span>
                      </>
                    ) : (
                      <>
                        <PowerOff className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-bold text-red-400">Đã ẩn</span>
                        {appConfig?.disabledAt && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5 ml-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(appConfig.disabledAt).toLocaleString('vi-VN')}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Toggle Button */}
                  {!isCinema && (
                    <button
                      onClick={() => handleToggle(app)}
                      disabled={isToggling}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                        isEnabled ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                      }`}
                      title={isEnabled ? `Ẩn ${appConfig?.label}` : `Hiện ${appConfig?.label}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
