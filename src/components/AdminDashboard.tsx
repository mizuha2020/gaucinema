import React, { useEffect, useState } from 'react';
import { Account, CustomAvatar } from '../types';
import { authService, DEFAULT_AVATARS, formatExpiryDate } from '../services/authService';
import { firestoreStorage } from '../services/firestoreStorage';
import { AdminConfirmModal } from './AdminConfirmModal';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminApisTab } from './admin/AdminApisTab';
import { AdminSettingsTab } from './admin/AdminSettingsTab';
import {
  Users,
  Image as ImageIcon,
  UserPlus,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  Upload,
  ArrowLeft,
  Shield,
  Search,
  X,
  RefreshCw,
  User,
  Check,
  Sparkles,
  Server,
  Activity,
  Settings,
} from 'lucide-react';
import { motion } from 'motion/react';

interface AdminDashboardProps {
  currentAccount: Account;
  onBackToCinema: () => void;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

/** Số hồ sơ trong modal sửa (Prompt 6 PHẦN E: chỉ đếm khi mở chi tiết 1 user). */
const EditProfilesCount: React.FC<{ accountId: string }> = ({ accountId }) => {
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    let alive = true;
    setCount(null);
    authService
      .getProfilesCount(accountId)
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accountId]);
  return (
    <p className="text-xs text-slate-400">
      Số hồ sơ: <strong className="text-sky-300">{count === null ? '…' : `${count} / 2 hồ sơ`}</strong>
    </p>
  );
};

/** Dòng hạn dùng + gia hạn nhanh ngay trên card tài khoản (Prompt 5 A2.5). */
const AccountExpiryRow: React.FC<{
  account: Account;
  onExtended: (expiresAt: number) => void;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}> = ({ account, onExtended, onShowToast }) => {
  const [months, setMonths] = React.useState<number>(1);
  const [busy, setBusy] = React.useState(false);
  const expired = !!account.expiresAt && account.expiresAt < Date.now();
  const expiringSoon =
    !!account.expiresAt &&
    account.expiresAt >= Date.now() &&
    account.expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000;
  const color = expired ? 'text-red-400' : expiringSoon ? 'text-amber-400' : 'text-emerald-400';

  const handleExtend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { apiFetch } = await import('../services/apiConfig');
      const res = await apiFetch(`/api/admin/users/${account.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.expiresAt) {
        onExtended(data.expiresAt);
        onShowToast(`Đã gia hạn ${months} tháng cho @${account.username} (tới ${formatExpiryDate(data.expiresAt)})`);
      } else {
        onShowToast(`Không gia hạn được: ${(data as any)?.error || res.status}`, 'error');
      }
    } catch {
      onShowToast('Không gia hạn được. Thử lại sau.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-1.5 mt-1.5 border-t border-slate-800 space-y-2">
      <div className="flex justify-between items-center">
        <span>Hạn dùng:</span>
        <span className={`font-bold ${color}`}>
          {account.expiresAt
            ? `${formatExpiryDate(account.expiresAt)}${expired ? ' (hết hạn)' : ''}`
            : 'Không thời hạn'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) || 1)}
          className="flex-1 min-w-0 bg-[#131f37] border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={m}>
              +{m} tháng
            </option>
          ))}
        </select>
        <button
          onClick={handleExtend}
          disabled={busy}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow cursor-pointer"
        >
          {busy ? '...' : 'Gia hạn'}
        </button>
      </div>
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentAccount,
  onBackToCinema,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'media' | 'accounts' | 'settings'>(() => {
    try {
      const saved = localStorage.getItem('gau_admin_active_tab');
      // Migrate tab cũ sang cấu trúc 4 mục mới
      const migrate: Record<string, 'overview' | 'media' | 'accounts' | 'settings'> = {
        overview: 'overview',
        apis: 'media',
        accounts: 'accounts',
        avatars: 'accounts',
        notifications: 'settings',
        ecosystem: 'settings',
        settings: 'settings',
        media: 'media',
      };
      if (saved && migrate[saved]) {
        return migrate[saved];
      }
    } catch (e) {
      void 0;
    }
    return 'overview';
  });

  // Sub-tab states for each major section
  const [overviewSubTab, setOverviewSubTab] = useState<'live' | 'users_stats' | 'watch_history'>('live');
  const [accountsSubTab, setAccountsSubTab] = useState<'accounts_list' | 'avatars'>('accounts_list');
  const [avatarsSubTab, setAvatarsSubTab] = useState<'avatar_gallery' | 'avatar_upload' | 'default_presets'>('avatar_gallery');

  useEffect(() => {
    try {
      localStorage.setItem('gau_admin_active_tab', activeTab);
    } catch (e) {
      void 0;
    }
  }, [activeTab]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customAvatars, setCustomAvatars] = useState<CustomAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state: Add Account
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newMonths, setNewMonths] = useState<number>(1);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals state: Edit Account (Display Name / Password / Status)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'blocked'>('active');

  // Avatar Upload state
  const [avatarName, setAvatarName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFilePreview, setAvatarFilePreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Admin confirmation action modal
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionButtonText?: string;
    isDestructive?: boolean;
    onExecute: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onExecute: async () => {},
  });

  // Load initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [accs, avs] = await Promise.all([
        authService.getAllAccounts(),
        firestoreStorage.getCustomAvatars(),
      ]);
      setAccounts(accs);
      setCustomAvatars(avs);
    } catch (e) {
      void 0;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. CREATE ACCOUNT WITH ADMIN CONFIRMATION
  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      setModalError('Vui lòng nhập đầy đủ Username và Mật khẩu khởi tạo.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setModalError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    setModalError(null);

    // Open password confirmation
    setConfirmModalConfig({
      isOpen: true,
      title: 'Xác Nhận Tạo Tài Khoản Mới',
      description: `Bạn đang chuẩn bị tạo tài khoản người dùng @${newUsername.toLowerCase().trim()} (hạn dùng ${newMonths} tháng) kèm 1 hồ sơ chính mặc định. Vui lòng nhập mật khẩu Admin để hoàn tất.`,
      actionButtonText: 'Xác Nhận Tạo',
      isDestructive: false,
      onExecute: async () => {
        setIsSubmitting(true);
        try {
          await authService.createAccount(newUsername, newPassword, newDisplayName, newMonths);
          onShowToast(`Đã tạo thành công tài khoản "@${newUsername.toLowerCase().trim()}"`);
          setNewUsername('');
          setNewPassword('');
          setNewDisplayName('');
          setNewMonths(1);
          setIsAddAccountOpen(false);
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          await loadData();
        } catch (err: any) {
          setModalError(err?.message || 'Không thể tạo tài khoản');
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  // 2. UPDATE WITH ADMIN CONFIRMATION (Prompt 5: admin đổi được pass user khác)
  const handleSaveAccountEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    setConfirmModalConfig({
      isOpen: true,
      title: `Cập Nhật Tài Khoản @${editingAccount.username}`,
      description: `Bạn đang thực hiện cập nhật thông tin / đổi trạng thái cho tài khoản @${editingAccount.username}. Vui lòng nhập mật khẩu Admin để áp dụng.`,
      actionButtonText: 'Lưu Thay Đổi',
      isDestructive: false,
      onExecute: async () => {
        setIsSubmitting(true);
        try {
          // Đổi trạng thái qua endpoint block/unblock để có hiệu lực ngay
          // (thu hồi phiên + nhả slot), không update Firestore trực tiếp.
          if (editStatus !== editingAccount.status) {
            const { apiFetch } = await import('../services/apiConfig');
            const action = editStatus === 'blocked' ? 'block' : 'unblock';
            const res = await apiFetch(`/api/admin/users/${editingAccount.id}/${action}`, {
              method: 'POST',
            });
            if (!res.ok) {
              throw new Error('Không thể đổi trạng thái. Vui lòng thử lại.');
            }
          }
          const updates: any = {
            displayName: editDisplayName.trim() || editingAccount.username,
          };
          if (editPassword.trim()) {
            if (editPassword.trim().length < 8) {
              throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
            }
            const isSelf = currentAccount && editingAccount.id === currentAccount.id;
            if (isSelf) {
              await authService.changeOwnPassword(editPassword.trim());
            } else {
              // Admin đặt lại mật khẩu cho user khác (đá mọi phiên cũ)
              const { apiFetch } = await import('../services/apiConfig');
              const res = await apiFetch(`/api/admin/users/${editingAccount.id}/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: editPassword.trim() }),
              });
              if (!res.ok) {
                throw new Error('Không đặt lại được mật khẩu. Vui lòng thử lại.');
              }
              // Copy mật khẩu mới để gửi cho user (hiện 1 lần trong toast)
              try {
                await navigator.clipboard.writeText(editPassword.trim());
              } catch {
                // ignore
              }
            }
          }
          await authService.updateAccount(editingAccount.id, updates);
          onShowToast(`Đã cập nhật thành công tài khoản "@${editingAccount.username}"`);
          setEditingAccount(null);
          setEditPassword('');
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          await loadData();
        } catch (err: any) {
          onShowToast(`Lỗi: ${err?.message || 'Không thể cập nhật'}`);
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  // Sinh mật khẩu ngẫu nhiên mạnh cho ô đặt lại (admin copy gửi user)
  const handleGeneratePassword = () => {
    try {
      const arr = new Uint32Array(12);
      crypto.getRandomValues(arr);
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      let out = '';
      for (const n of arr) {
        out += alphabet[n % alphabet.length];
      }
      setEditPassword(out);
    } catch {
      setEditPassword(`Gau${Math.floor(100000 + Math.random() * 900000)}!`);
    }
  };

  // 3. TOGGLE LOCK / UNLOCK WITH ADMIN CONFIRMATION (hiệu lực ngay: thu hồi
  // phiên + nhả slot, không chỉ đổi cờ trong Firestore)
  const handleToggleStatusClick = (account: Account) => {
    if (account.username === 'admin') return;
    const isLocking = account.status === 'active';

    setConfirmModalConfig({
      isOpen: true,
      title: isLocking ? `Tạm Khóa Tài Khoản @${account.username}` : `Mở Khóa Tài Khoản @${account.username}`,
      description: isLocking
        ? `Tài khoản @${account.username} sẽ bị đá khỏi mọi thiết bị NGAY LẬP TỨC và không thể đăng nhập lại. Vui lòng nhập mật khẩu Admin để khóa.`
        : `Tài khoản @${account.username} sẽ được khôi phục quyền đăng nhập và xem phim bình thường. Vui lòng nhập mật khẩu Admin để mở khóa.`,
      actionButtonText: isLocking ? 'Xác Nhận Khóa' : 'Xác Nhận Mở Khóa',
      isDestructive: isLocking,
      onExecute: async () => {
        const { apiFetch } = await import('../services/apiConfig');
        const action = isLocking ? 'block' : 'unblock';
        const res = await apiFetch(`/api/admin/users/${account.id}/${action}`, {
          method: 'POST',
        });
        if (!res.ok) {
          throw new Error('Không thực hiện được. Vui lòng thử lại.');
        }
        onShowToast(isLocking ? `Đã tạm khóa tài khoản @${account.username}` : `Đã mở khóa tài khoản @${account.username}`);
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        await loadData();
      },
    });
  };

  // 4. DELETE ACCOUNT WITH ADMIN CONFIRMATION (Prompt 5: xóa hẳn Auth user.
  // Bắt gõ đúng username trước, rồi xác thực mật khẩu Admin như thường.)
  const handleDeleteAccountClick = (account: Account) => {
    if (account.username === 'admin') {
      onShowToast('Không thể xóa tài khoản Admin mặc định!');
      return;
    }

    let typed: string | null = null;
    try {
      typed = window.prompt(
        `XÓA VĨNH VIỄN @${account.username} (kèm hồ sơ, Auth user, slot)?\nGõ đúng username để tiếp tục:`,
        ''
      );
    } catch {
      typed = null;
    }
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== account.username.toLowerCase()) {
      onShowToast('Tên nhập không khớp. Đã hủy xóa.', 'error');
      return;
    }
    setConfirmModalConfig({
      isOpen: true,
      title: `Xóa Vĩnh Viễn Tài Khoản @${account.username}`,
      description: `Hành động này sẽ XÓA VĨNH VIỄN tài khoản @${account.username}, cùng toàn bộ hồ sơ người xem, danh sách yêu thích và lịch sử xem phim liên quan. Dữ liệu không thể khôi phục.`,
      actionButtonText: 'Xác Nhận Xóa Vĩnh Viễn',
      isDestructive: true,
      onExecute: async () => {
        await authService.deleteAccount(account.id);
        onShowToast(`Đã xóa vĩnh viễn tài khoản @${account.username}`);
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        await loadData();
      },
    });
  };

  // Handle Avatar file selection with client-side compression
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarFilePreview(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle Add Custom Avatar
  const handleAddAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = avatarFilePreview || avatarUrl.trim();
    if (!finalUrl) {
      onShowToast('Vui lòng tải lên ảnh hoặc nhập đường dẫn ảnh hợp lệ.', 'error');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await firestoreStorage.addCustomAvatar(
        finalUrl,
        avatarName.trim() || 'Avatar tùy chỉnh',
        currentAccount.username
      );
      onShowToast('Đã thêm ảnh đại diện mới vào kho avatar cho người dùng!');
      setAvatarName('');
      setAvatarUrl('');
      setAvatarFilePreview(null);
      await loadData();
    } catch (err: any) {
      onShowToast(`Lỗi: ${err?.message || 'Không thể lưu avatar'}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Delete Custom Avatar with Admin Confirmation
  const handleDeleteAvatar = (avatar: CustomAvatar) => {
    setConfirmModalConfig({
      isOpen: true,
      title: `Xóa Ảnh Đại Diện "${avatar.name}"`,
      description: `Bạn có chắc muốn xóa ảnh đại diện này khỏi kho avatar dùng chung không?`,
      actionButtonText: 'Xác Nhận Xóa',
      isDestructive: true,
      onExecute: async () => {
        await firestoreStorage.deleteCustomAvatar(avatar.id);
        onShowToast('Đã xóa avatar');
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        await loadData();
      },
    });
  };

  const filteredAccounts = accounts.filter(
    (a) =>
      a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      id="qtb-admin-dashboard"
      className="min-h-screen w-full bg-[#070b16] text-white overflow-y-auto overflow-x-hidden flex"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
    >
      {/* --- DESKTOP SIDEBAR (Visible on md and lg screens) --- */}
      <aside
        id="admin-desktop-sidebar"
        className="hidden md:flex md:w-64 lg:w-72 md:fixed md:top-0 md:bottom-0 md:left-0 md:z-30 bg-[#091122]/95 border-r border-blue-900/60 p-4 sm:p-5 flex-col justify-between shadow-2xl backdrop-blur-xl"
      >
        <div className="space-y-6">
          {/* Sidebar Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/30 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 truncate">
                Bảng Quản Trị
              </h1>
              <span className="text-[10px] text-indigo-300 bg-indigo-950/80 border border-indigo-700/60 px-1.5 py-0.2 rounded font-mono uppercase font-bold">
                Admin Portal
              </span>
            </div>
          </div>

          {/* Logged in admin info */}
          <div className="p-3 bg-[#0d172e] rounded-2xl border border-blue-900/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                {currentAccount.displayName ? currentAccount.displayName.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentAccount.displayName || currentAccount.username}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">@{currentAccount.username}</p>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Online" />
          </div>

          {/* Sidebar Navigation Links */}
          <nav className="space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Danh Mục Quản Lý
            </div>

            {/* Item 1: Overview */}
            <button
              id="sidebar-nav-overview-btn"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4" />
                <span>Tổng Quan</span>
              </div>
            </button>

            {/* Item 2: Nguồn phim & Banner */}
            <button
              id="sidebar-nav-apis-btn"
              onClick={() => setActiveTab('media')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'media'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Server className="w-4 h-4" />
                <span>Nguồn Phim</span>
              </div>
            </button>

            {/* Item 3: Tài khoản & Avatar */}
            <button
              id="sidebar-nav-accounts-btn"
              onClick={() => setActiveTab('accounts')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                <span>Tài Khoản</span>
              </div>
              <span className="px-2 py-0.5 text-[10px] bg-slate-800 rounded-full text-slate-300 font-mono">
                {accounts.length}
              </span>
            </button>

            {/* Item 4: Cài đặt */}
            <button
              id="sidebar-nav-settings-btn"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4" />
                <span>Cài Đặt</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Actions */}
        <div className="space-y-2 pt-4 border-t border-slate-800">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer border border-slate-700 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Đang làm mới...' : 'Làm mới dữ liệu'}</span>
          </button>

          <button
            onClick={onBackToCinema}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-900/60 text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại rạp phim</span>
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 md:pl-64 lg:pl-72 w-full min-h-screen admin-mobile-safe-pt pb-28 md:pb-10 px-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
          {/* Top Bar Header (Visible on Mobile or as breadcrumb header) */}
          <div className="flex items-center justify-between gap-3 bg-[#0b1329]/95 border border-blue-900/60 p-3 sm:p-4 rounded-3xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                id="admin-back-btn"
                onClick={onBackToCinema}
                className="md:hidden min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700 shrink-0 flex items-center justify-center active:scale-95"
                title="Quay lại rạp phim"
              >
                <ArrowLeft className="w-5 h-5 text-sky-400" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 truncate">
                    Bảng Quản Trị Hệ Thống
                  </span>
                  <span className="px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[9px] sm:text-[10px] uppercase font-bold shrink-0">
                    Admin Portal
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                  Tài khoản, nguồn phim, banner và cài đặt hệ thống
                </p>
              </div>
            </div>

            {/* Refresh Icon Button */}
            <button
              id="admin-refresh-data-btn"
              onClick={loadData}
              disabled={isLoading}
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700 shadow-sm active:scale-95 disabled:opacity-50 shrink-0 flex items-center justify-center"
              title={isLoading ? 'Đang đồng bộ dữ liệu...' : 'Làm mới dữ liệu'}
            >
              <RefreshCw className={`w-4 h-4 text-sky-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        {/* --- TAB 0: OVERVIEW & REAL-TIME STATS --- */}
        {activeTab === 'overview' && (
          <div className="animate-in fade-in duration-200">
            <AdminOverviewTab
              currentSubTab={overviewSubTab}
              onChangeSubTab={setOverviewSubTab}
              onSwitchToApisTab={() => {
                setActiveTab('media');
              }}
              onShowToast={onShowToast}
            />
          </div>
        )}

        {/* --- TAB: NGUỒN PHIM & BANNER --- */}
        {activeTab === 'media' && (
          <div className="animate-in fade-in duration-200">
            <AdminApisTab onShowToast={onShowToast} />
          </div>
        )}

        {/* --- TAB: CÀI ĐẶT (Thông báo / Ứng dụng / Bảo trì) --- */}
        {activeTab === 'settings' && (
          <div className="animate-in fade-in duration-200">
            <AdminSettingsTab
              currentAccount={currentAccount}
              onShowToast={onShowToast}
            />
          </div>
        )}

        {/* --- TAB 1: ACCOUNTS & SECURITY MANAGEMENT --- */}
        {activeTab === 'accounts' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Accounts Sub-Navigation Tabs Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0b1329] border border-blue-900/60 p-2 sm:p-2.5 rounded-2xl shadow-xl">
              <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[#070b16] rounded-xl border border-slate-800">
                <button
                  id="subtab-accounts-list-btn"
                  onClick={() => setAccountsSubTab('accounts_list')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    accountsSubTab === 'accounts_list'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  <span>Tài Khoản ({accounts.length})</span>
                </button>

                <button
                  id="subtab-avatars-btn"
                  onClick={() => setAccountsSubTab('avatars')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    accountsSubTab === 'avatars'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Avatar ({customAvatars.length})</span>
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 px-2 text-xs">
                <span className="text-[11px] font-mono text-slate-400">
                  {accounts.filter((a) => a.status !== 'blocked').length} Hoạt động /{' '}
                  {accounts.filter((a) => a.status === 'blocked').length} Đã khóa
                </span>
              </div>
            </div>

            {/* Sub-tab 1: Accounts List */}
            {accountsSubTab === 'accounts_list' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0f172a] p-3.5 sm:p-4 rounded-2xl border border-slate-800">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Tìm theo tên user hoặc tên hiển thị..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-[#131f37] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    id="admin-add-account-btn"
                    onClick={() => {
                      setNewUsername('');
                      setNewPassword('');
                      setNewDisplayName('');
                      setModalError(null);
                      setIsAddAccountOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-transform active:scale-95 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Tạo Tài Khoản Mới</span>
                  </button>
                </div>

                {/* Accounts List Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAccounts.map((acc) => {
                    const isAdmin = acc.username === 'admin';
                    return (
                      <div
                        key={acc.id}
                        id={`account-card-${acc.username}`}
                        className="bg-[#0f172a] border border-blue-900/40 hover:border-blue-700/60 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800/80 flex items-center justify-center font-bold text-sky-400 text-sm shrink-0">
                                {acc.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
                                  <span className="truncate">{acc.displayName || acc.username}</span>
                                  {isAdmin && (
                                    <span className="text-[10px] bg-red-950 text-red-300 border border-red-800/60 px-1.5 py-0.2 rounded font-bold shrink-0">
                                      ADMIN
                                    </span>
                                  )}
                                </h3>
                                <p className="text-xs text-sky-400 font-mono truncate">@{acc.username}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                  acc.status === 'blocked'
                                    ? 'bg-red-950/80 text-red-300 border-red-800'
                                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                }`}
                              >
                                {acc.status === 'blocked' ? 'Đã khóa' : 'Hoạt động'}
                              </span>
                            </div>
                          </div>

                          {/* Info details */}
                          <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-[#131f37]/60 p-3 rounded-xl border border-slate-800">
                            <div className="flex justify-between items-center">
                              <span>Quyền hạn:</span>
                              <span className="font-semibold text-slate-200">
                                {isAdmin ? 'Quản trị viên (Admin)' : 'Người dùng rạp phim'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Ngày khởi tạo:</span>
                              <span className="text-slate-300">
                                {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('vi-VN') : 'Mặc định'}
                              </span>
                            </div>
                            {!isAdmin && (
                              <AccountExpiryRow
                                account={acc}
                                onExtended={(expiresAt) => {
                                  setAccounts((prev) =>
                                    prev.map((a) => (a.id === acc.id ? { ...a, expiresAt } : a))
                                  );
                                }}
                                onShowToast={onShowToast}
                              />
                            )}
                          </div>
                        </div>

                        {/* Actions bar */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                          {!isAdmin && (
                            <button
                              onClick={() => handleToggleStatusClick(acc)}
                              className={`p-2 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                                acc.status === 'blocked'
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/80'
                                  : 'bg-amber-950/60 text-amber-300 border-amber-800 hover:bg-amber-900/80'
                              }`}
                              title={acc.status === 'blocked' ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản'}
                            >
                              {acc.status === 'blocked' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingAccount(acc);
                              setEditDisplayName(acc.displayName || acc.username);
                              setEditPassword('');
                              setEditStatus(acc.status || 'active');
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 rounded-xl cursor-pointer border border-slate-700 flex items-center gap-1.5 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Sửa / Đổi MK</span>
                          </button>

                          {!isAdmin && (
                            <button
                              onClick={() => handleDeleteAccountClick(acc)}
                              className="p-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 rounded-xl cursor-pointer border border-red-800 transition-colors"
                              title="Xóa vĩnh viễn tài khoản"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* --- TAB: AVATAR (gộp trong Tài Khoản) --- */}
        {activeTab === 'accounts' && accountsSubTab === 'avatars' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Avatars Sub-Navigation Tabs Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0b1329] border border-blue-900/60 p-2 sm:p-2.5 rounded-2xl shadow-xl">
              <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[#070b16] rounded-xl border border-slate-800">
                <button
                  id="subtab-avatar-gallery-btn"
                  onClick={() => setAvatarsSubTab('avatar_gallery')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    avatarsSubTab === 'avatar_gallery'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>Kho Avatar Tải Lên ({customAvatars.length})</span>
                </button>

                <button
                  id="subtab-avatar-upload-btn"
                  onClick={() => setAvatarsSubTab('avatar_upload')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    avatarsSubTab === 'avatar_upload'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Tải Lên Avatar Mới</span>
                </button>

                <button
                  id="subtab-default-presets-btn"
                  onClick={() => setAvatarsSubTab('default_presets')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    avatarsSubTab === 'default_presets'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Bộ Mặc Định Có Sẵn ({DEFAULT_AVATARS.length})</span>
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 px-2 text-xs">
                <span className="text-[11px] font-mono text-slate-400">
                  Tổng {customAvatars.length + DEFAULT_AVATARS.length} ảnh đại diện
                </span>
              </div>
            </div>

            {/* Sub-tab 1: Upload New Avatar */}
            {avatarsSubTab === 'avatar_upload' && (
              <div className="bg-[#0f172a] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl animate-in fade-in duration-150">
                <h2 className="text-base sm:text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sky-400" />
                  <span>Thêm Ảnh Đại Diện Mới (Upload Ảnh / URL)</span>
                </h2>
                <p className="text-xs text-slate-400 mb-5">
                  Các avatar thêm vào đây sẽ hiển thị ngay trong danh sách lựa chọn avatar khi người dùng chỉnh sửa hồ sơ.
                </p>

                <form onSubmit={handleAddAvatar} className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Upload from device */}
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-4 bg-[#131f37]/50 text-center relative group cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    {avatarFilePreview ? (
                      <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-sky-400 shadow-lg">
                        <img src={avatarFilePreview} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white">
                          Đổi ảnh
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-blue-950/80 border border-blue-800 flex items-center justify-center text-sky-400 mb-2">
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-slate-200">Tải ảnh từ máy tính / điện thoại</span>
                        <span className="text-[10px] text-slate-400 mt-1">PNG, JPG, WEBP (Tự động nén HD)</span>
                      </>
                    )}
                  </div>

                  {/* Direct URL & Name */}
                  <div className="md:col-span-2 space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Tên / Nhãn đại diện:
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Người Nhện, Iron Man, Anime Chibi..."
                        value={avatarName}
                        onChange={(e) => setAvatarName(e.target.value)}
                        className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Hoặc nhập trực tiếp đường dẫn URL hình ảnh:
                      </label>
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/..."
                        value={avatarUrl}
                        onChange={(e) => {
                          setAvatarUrl(e.target.value);
                          if (e.target.value) setAvatarFilePreview(null);
                        }}
                        className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isUploadingAvatar || (!avatarFilePreview && !avatarUrl.trim())}
                        className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isUploadingAvatar ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            <span>Đang lưu...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Lưu Vào Kho Avatar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Sub-tab 2: Custom Avatars Display */}
            {avatarsSubTab === 'avatar_gallery' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Avatar do Admin đã thêm ({customAvatars.length})
                  </h3>
                  <button
                    onClick={() => setAvatarsSubTab('avatar_upload')}
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>+ Tải lên thêm</span>
                  </button>
                </div>

                {customAvatars.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
                    {customAvatars.map((av) => (
                      <div
                        key={av.id}
                        className="group relative bg-[#0f172a] border border-slate-800 hover:border-sky-500/80 rounded-2xl p-2 sm:p-2.5 flex flex-col items-center text-center transition-all shadow-md"
                      >
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-700 mb-1.5 relative">
                          <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                          <button
                            onClick={() => handleDeleteAvatar(av)}
                            className="absolute inset-0 bg-red-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-200 transition-opacity cursor-pointer"
                            title="Xóa avatar này"
                          >
                            <Trash2 className="w-5 h-5 text-red-400" />
                          </button>
                        </div>
                        <span className="text-[11px] sm:text-xs font-medium text-slate-300 truncate w-full">{av.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-[#0f172a]/50 rounded-2xl border border-slate-800 text-slate-400 text-xs">
                    Chưa có avatar tải lên nào. Admin có thể bấm vào tab "Tải Lên Avatar Mới" ở trên để bổ sung.
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 3: Default Avatar Presets */}
            {avatarsSubTab === 'default_presets' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                  Avatar mặc định có sẵn của hệ thống ({DEFAULT_AVATARS.length})
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
                  {DEFAULT_AVATARS.map((av, idx) => (
                    <div key={idx} className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden border border-slate-800 shadow bg-[#0f172a] p-1">
                      <img src={av} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover rounded-xl" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- BOTTOM NAVIGATION BAR (VISIBLE ONLY ON MOBILE) --- */}
        <div
          id="admin-bottom-nav"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070b16]/95 backdrop-blur-xl border-t border-blue-900/60 py-2 sm:py-2.5 px-3 sm:px-8 shadow-2xl transition-all admin-mobile-safe-pb"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-around gap-1 sm:gap-2">
            {/* Nav item 1: Overview */}
            <button
              id="bottom-nav-overview-btn"
              onClick={() => setActiveTab('overview')}
              className={`flex flex-col items-center justify-center py-1 px-3 sm:px-6 rounded-2xl transition-all cursor-pointer relative ${
                activeTab === 'overview'
                  ? 'text-sky-400 bg-blue-950/80 border border-blue-700/60 shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span className="text-[11px] sm:text-xs font-bold mt-1">Tổng Quan</span>
              {activeTab === 'overview' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 absolute -bottom-1" />
              )}
            </button>

            {/* Nav item 2: Nguồn phim */}
            <button
              id="bottom-nav-apis-btn"
              onClick={() => setActiveTab('media')}
              className={`flex flex-col items-center justify-center py-1 px-3 sm:px-6 rounded-2xl transition-all cursor-pointer relative ${
                activeTab === 'media'
                  ? 'text-sky-400 bg-blue-950/80 border border-blue-700/60 shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Server className="w-5 h-5" />
              <span className="text-[11px] sm:text-xs font-bold mt-1">Nguồn Phim</span>
              {activeTab === 'media' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 absolute -bottom-1" />
              )}
            </button>

            {/* Nav item 3: Tài khoản */}
            <button
              id="bottom-nav-accounts-btn"
              onClick={() => setActiveTab('accounts')}
              className={`flex flex-col items-center justify-center py-1 px-3 sm:px-6 rounded-2xl transition-all cursor-pointer relative ${
                activeTab === 'accounts'
                  ? 'text-sky-400 bg-blue-950/80 border border-blue-700/60 shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <div className="relative">
                <Users className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-3 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                  {accounts.length}
                </span>
              </div>
              <span className="text-[11px] sm:text-xs font-bold mt-1">Tài Khoản</span>
              {activeTab === 'accounts' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 absolute -bottom-1" />
              )}
            </button>

            {/* Nav item 4: Cài đặt */}
            <button
              id="bottom-nav-settings-btn"
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center justify-center py-1 px-3 sm:px-6 rounded-2xl transition-all cursor-pointer relative ${
                activeTab === 'settings'
                  ? 'text-sky-400 bg-blue-950/80 border border-blue-700/60 shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-[11px] sm:text-xs font-bold mt-1">Cài Đặt</span>
              {activeTab === 'settings' && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 absolute -bottom-1" />
              )}
            </button>
          </div>
        </div>

        {/* --- MODAL 1: ADD ACCOUNT --- */}
        {isAddAccountOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0f172a] border border-blue-900/80 rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-sky-400" />
                  <span>Tạo Tài Khoản Mới Cho User</span>
                </h3>
                <button
                  onClick={() => setIsAddAccountOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modalError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tên đăng nhập (Username):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: user1, ba_me, em_gai..."
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    * Tự động sinh 1 hồ sơ chính mang tên trùng với username này (không thể xóa).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mật khẩu khởi tạo:
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Tối thiểu 8 ký tự"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Thời hạn sử dụng:
                  </label>
                  <select
                    value={newMonths}
                    onChange={(e) => setNewMonths(Number(e.target.value) || 1)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        {m} tháng
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    * Tính theo tháng lịch. Tài khoản admin không có thời hạn.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tên hiển thị (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Gia Đình Anh Nam"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddAccountOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold rounded-xl text-white shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Đang tạo...' : 'Tiếp Tục Xác Thực →'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* --- MODAL 2: EDIT / RESET PASSWORD --- */}
        {editingAccount && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0f172a] border border-blue-900/80 rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-400" />
                  <span>Chỉnh Sửa Tài Khoản: @{editingAccount.username}</span>
                </h3>
                <button
                  onClick={() => setEditingAccount(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAccountEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tên hiển thị:
                  </label>
                  <input
                    type="text"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <EditProfilesCount accountId={editingAccount.id} />

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Đặt lại mật khẩu mới cho user:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Để trống nếu giữ nguyên (tối thiểu 8 ký tự)"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="flex-1 min-w-0 bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="shrink-0 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl text-sky-300 border border-slate-700 cursor-pointer"
                      title="Sinh mật khẩu ngẫu nhiên mạnh"
                    >
                      Ngẫu nhiên
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Đổi cho user khác sẽ đá mọi phiên cũ của họ. Mật khẩu mới đã copy sẵn, gửi cho user.
                  </p>
                </div>

                {editingAccount.username !== 'admin' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Trạng thái hoạt động:
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'active' | 'blocked')}
                      className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="active">Đang hoạt động bình thường</option>
                      <option value="blocked">Tạm khóa tài khoản</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingAccount(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold rounded-xl text-white shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Đang lưu...' : 'Tiếp Tục Xác Thực →'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* --- MODAL 3: ADMIN PASSWORD CONFIRMATION MODAL --- */}
        <AdminConfirmModal
          isOpen={confirmModalConfig.isOpen}
          title={confirmModalConfig.title}
          description={confirmModalConfig.description}
          actionButtonText={confirmModalConfig.actionButtonText}
          isDestructive={confirmModalConfig.isDestructive}
          onConfirm={confirmModalConfig.onExecute}
          onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        />
        </div>
      </main>
    </div>
  );
};
