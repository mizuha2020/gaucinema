import React, { useState, useEffect } from 'react';
import { Account, AdminNotification } from '../../types';
import { firestoreStorage } from '../../services/firestoreStorage';
import { authService } from '../../services/authService';
import {
  Bell,
  Send,
  Users,
  User,
  CheckSquare,
  Square,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Clock,
  Radio,
} from 'lucide-react';

interface AdminNotificationsTabProps {
  currentAccount: Account;
  onShowToast: (msg: string) => void;
}

export const AdminNotificationsTab: React.FC<AdminNotificationsTabProps> = ({
  currentAccount,
  onShowToast,
}) => {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [repeatCount, setRepeatCount] = useState<number>(3);
  const [speedSeconds, setSpeedSeconds] = useState<number>(15);

  // Live Preview Key to force re-animation
  const [previewKey, setPreviewKey] = useState(0);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [notifs, accs] = await Promise.all([
        firestoreStorage.getNotifications(),
        authService.getAllAccounts(),
      ]);
      setNotifications(notifs);
      setAccounts(accs);
    } catch (e) {
      console.error('Error loading notification data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to real-time updates
    const unsub = firestoreStorage.subscribeNotifications((updated) => {
      setNotifications(updated);
    });
    return () => unsub();
  }, []);

  const handleToggleAccount = (accId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    );
  };

  const handleSelectAllAccounts = () => {
    const allIds = accounts.map((a) => a.id || a.username);
    setSelectedAccountIds(allIds);
  };

  const handleDeselectAllAccounts = () => {
    setSelectedAccountIds([]);
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      onShowToast('Vui lòng nhập nội dung thông báo!');
      return;
    }
    if (targetType === 'specific' && selectedAccountIds.length === 0) {
      onShowToast('Vui lòng chọn ít nhất một người dùng nhận thông báo!');
      return;
    }

    setIsSubmitting(true);
    try {
      await firestoreStorage.addNotification({
        message: message.trim(),
        targetType,
        targetAccountIds: targetType === 'specific' ? selectedAccountIds : [],
        position,
        repeatCount: Math.max(1, Number(repeatCount) || 1),
        speedSeconds: Math.max(5, Number(speedSeconds) || 15),
        active: true,
        createdBy: currentAccount.username,
      });

      onShowToast('Đã gửi thông báo chữ chạy đến người dùng thành công!');
      setMessage('');
      setSelectedAccountIds([]);
      await loadData();
    } catch (err: any) {
      onShowToast(`Lỗi gửi thông báo: ${err?.message || 'Không thể gửi'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (notif: AdminNotification) => {
    try {
      const nextActive = !notif.active;
      await firestoreStorage.updateNotification(notif.id, { active: nextActive });
      onShowToast(nextActive ? 'Đã bật thông báo' : 'Đã tạm tắt thông báo');
    } catch (err: any) {
      onShowToast(`Lỗi: ${err?.message || 'Không thể cập nhật'}`);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa thông báo này không?')) return;
    try {
      await firestoreStorage.deleteNotification(id);
      onShowToast('Đã xóa thông báo thành công');
    } catch (err: any) {
      onShowToast(`Lỗi: ${err?.message || 'Không thể xóa'}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header card */}
      <div className="bg-[#0b1329] border border-blue-900/60 p-4 sm:p-6 rounded-3xl shadow-xl space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400 shrink-0">
            <Bell className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Gửi Thông Báo Chữ Chạy (Marquee Ticker)</span>
              <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded-full font-bold">
                Cucumber Banner
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Gửi tin nhắn thông báo dạng thanh chữ chạy tinh tế ở đỉnh hoặc đáy màn hình hiện tại của người dùng mà không làm phiền trải nghiệm xem phim
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT FORM: CREATE & SEND NOTIFICATION (7 COLS) */}
        <div className="lg:col-span-7 bg-[#0f172a] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-800">
            <Send className="w-4 h-4 text-sky-400" />
            <span>Tạo Thông Báo Mới</span>
          </h3>

          <form onSubmit={handleSendNotification} className="space-y-4">
            {/* Message Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nội dung thông báo <span className="text-red-400">*</span>:
              </label>
              <textarea
                rows={3}
                required
                placeholder="Nhập nội dung tin nhắn sẽ chạy qua màn hình... Ví dụ: Chúc quý khách xem phim vui vẻ! Hệ thống vừa cập nhật Server KKPhim siêu mượt."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-[#131f37] border border-slate-700 rounded-2xl p-3.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder-slate-500 transition-colors"
              />
            </div>

            {/* Target selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Đối tượng nhận thông báo:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetType('all')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    targetType === 'all'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-md shadow-blue-600/20'
                      : 'bg-[#131f37] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4 text-sky-400" />
                  <span>Tất cả người dùng ({accounts.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('specific')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    targetType === 'specific'
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md shadow-indigo-600/20'
                      : 'bg-[#131f37] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Chọn người dùng cụ thể</span>
                </button>
              </div>

              {/* Specific user selection list */}
              {targetType === 'specific' && (
                <div className="mt-3 p-3 bg-[#131f37] rounded-2xl border border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                    <span className="text-slate-400">
                      Đã chọn <strong className="text-sky-300">{selectedAccountIds.length}</strong> / {accounts.length} tài khoản
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllAccounts}
                        className="text-sky-400 hover:underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllAccounts}
                        className="text-slate-400 hover:underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-none">
                    {accounts.map((acc) => {
                      const accKey = acc.id || acc.username;
                      const isSelected = selectedAccountIds.includes(accKey);
                      return (
                        <div
                          key={accKey}
                          onClick={() => handleToggleAccount(accKey)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition-colors ${
                            isSelected
                              ? 'bg-indigo-950/80 border-indigo-600 text-white'
                              : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            <span className="font-semibold truncate">{acc.displayName || acc.username}</span>
                            <span className="text-[10px] text-slate-400 font-mono">@{acc.username}</span>
                          </div>
                          {acc.username === 'admin' && (
                            <span className="text-[9px] bg-red-950 text-red-300 px-1.5 py-0.2 rounded font-bold">
                              ADMIN
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Position & Repeat Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Position */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Vị trí hiển thị:
                </label>
                <div className="flex items-center gap-2 bg-[#131f37] p-1 rounded-2xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPosition('top')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      position === 'top'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>Phía trên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPosition('bottom')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      position === 'bottom'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>Phía dưới</span>
                  </button>
                </div>
              </div>

              {/* Repeat count */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Số lần chữ chạy (Lần):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-2xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                    vòng lặp
                  </span>
                </div>
              </div>

              {/* Speed duration */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tốc độ chạy chữ:
                </label>
                <select
                  value={speedSeconds}
                  onChange={(e) => setSpeedSeconds(Number(e.target.value))}
                  className="w-full bg-[#131f37] border border-slate-700 rounded-2xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                >
                  <option value={10}>Nhanh (10 giây / lượt)</option>
                  <option value={15}>Vừa phải (15 giây / lượt)</option>
                  <option value={22}>Chậm nhẹ nhàng (22 giây / lượt)</option>
                </select>
              </div>
            </div>

            {/* LIVE MARQUEE PREVIEW BOX */}
            <div className="bg-[#0b1329] border border-amber-500/30 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xem trước hiệu ứng chữ chạy ({position === 'top' ? 'Trên' : 'Dưới'})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  title="Chạy lại xem trước"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xem lại</span>
                </button>
              </div>

              <div className="relative overflow-hidden bg-black/80 border border-amber-500/40 rounded-xl py-1.5 px-3 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold uppercase shrink-0 border border-amber-500/30">
                  THÔNG BÁO
                </span>
                <div className="overflow-hidden flex-1 relative h-5 flex items-center">
                  <div
                    key={previewKey}
                    className="animate-cucumber-marquee text-xs font-semibold text-amber-200"
                    style={{
                      animationDuration: `${speedSeconds}s`,
                      animationIterationCount: repeatCount,
                    }}
                  >
                    {message.trim() || 'Nội dung thông báo mẫu chữ chạy cucumber hiển thị trực tiếp ở đây...'}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="w-full py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-transform active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    <span>Đang phát thông báo...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 fill-slate-950" />
                    <span>Gửi Thông Báo Ngay</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT LIST: SENT NOTIFICATIONS HISTORY (5 COLS) */}
        <div className="lg:col-span-5 bg-[#0f172a] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Danh Sách Đã Gửi ({notifications.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              {notifications.filter((n) => n.active).length} đang bật
            </span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Đang tải lịch sử thông báo...</span>
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 scrollbar-none">
              {notifications.map((notif) => {
                const createdDate = new Date(notif.createdAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                });

                return (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      notif.active
                        ? 'bg-[#131f37] border-blue-800/80 shadow-md'
                        : 'bg-[#0b1329]/60 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            notif.active
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-slate-900 text-slate-400 border-slate-700'
                          }`}
                        >
                          {notif.active ? 'Đang hoạt động' : 'Đã ẩn'}
                        </span>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-sky-300 border border-blue-800 flex items-center gap-1">
                          {notif.position === 'top' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                          <span>{notif.position === 'top' ? 'Trên' : 'Dưới'}</span>
                        </span>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/80">
                          {notif.repeatCount} lần
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleActive(notif)}
                          className={`p-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                            notif.active
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                          title={notif.active ? 'Tắt thông báo này' : 'Bật lại thông báo này'}
                        >
                          {notif.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteNotification(notif.id)}
                          className="p-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded-xl cursor-pointer border border-red-800 transition-colors"
                          title="Xóa thông báo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-white font-medium line-clamp-2 mb-2 bg-[#070b16]/60 p-2 rounded-xl border border-slate-800">
                      "{notif.message}"
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-sky-400" />
                        <span>
                          {notif.targetType === 'all'
                            ? 'Gửi tất cả'
                            : `Cho ${notif.targetAccountIds?.length || 0} tài khoản`}
                        </span>
                      </span>
                      <span>{createdDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#131f37]/40 rounded-2xl border border-slate-800 text-slate-400 text-xs space-y-2">
              <Bell className="w-8 h-8 text-slate-600 mx-auto" />
              <p>Chưa có thông báo chữ chạy nào được gửi. Hãy tạo tin nhắn đầu tiên ở cột bên trái!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
