import React, { useEffect, useState } from 'react';
import { Account, CustomAvatar } from '../types';
import { authService, DEFAULT_AVATARS } from '../services/authService';
import { firestoreStorage } from '../services/firestoreStorage';
import { AdminConfirmModal } from './AdminConfirmModal';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminApisTab } from './admin/AdminApisTab';
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
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  X,
  RefreshCw,
  User,
  Shield,
  Check,
  Server,
  Activity,
} from 'lucide-react';
import { motion } from 'motion/react';

interface AdminDashboardProps {
  currentAccount: Account;
  onBackToCinema: () => void;
  onShowToast: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentAccount,
  onBackToCinema,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'apis' | 'accounts' | 'avatars'>('overview');
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
      console.error('Error loading admin data', e);
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
    setModalError(null);

    // Open password confirmation
    setConfirmModalConfig({
      isOpen: true,
      title: 'Xác Nhận Tạo Tài Khoản Mới',
      description: `Bạn đang chuẩn bị tạo tài khoản người dùng @${newUsername.toLowerCase().trim()} kèm 1 hồ sơ chính mặc định. Vui lòng nhập mật khẩu Admin để hoàn tất.`,
      actionButtonText: 'Xác Nhận Tạo',
      isDestructive: false,
      onExecute: async () => {
        setIsSubmitting(true);
        try {
          await authService.createAccount(newUsername, newPassword, newDisplayName);
          onShowToast(`Đã tạo thành công tài khoản "@${newUsername.toLowerCase().trim()}"`);
          setNewUsername('');
          setNewPassword('');
          setNewDisplayName('');
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

  // 2. UPDATE / RESET PASSWORD WITH ADMIN CONFIRMATION
  const handleSaveAccountEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    setConfirmModalConfig({
      isOpen: true,
      title: `Cập Nhật Tài Khoản @${editingAccount.username}`,
      description: `Bạn đang thực hiện cập nhật thông tin / đổi mật khẩu cho tài khoản @${editingAccount.username}. Vui lòng nhập mật khẩu Admin để áp dụng.`,
      actionButtonText: 'Lưu Thay Đổi',
      isDestructive: false,
      onExecute: async () => {
        setIsSubmitting(true);
        try {
          const updates: any = {
            displayName: editDisplayName.trim() || editingAccount.username,
            status: editStatus,
          };
          if (editPassword.trim()) {
            updates.password = editPassword.trim();
          }
          await authService.updateAccount(editingAccount.id, updates);
          onShowToast(`Đã cập nhật thành công tài khoản "@${editingAccount.username}"`);
          setEditingAccount(null);
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

  // 3. TOGGLE LOCK / UNLOCK WITH ADMIN CONFIRMATION
  const handleToggleStatusClick = (account: Account) => {
    if (account.username === 'admin') return;
    const isLocking = account.status === 'active';

    setConfirmModalConfig({
      isOpen: true,
      title: isLocking ? `Tạm Khóa Tài Khoản @${account.username}` : `Mở Khóa Tài Khoản @${account.username}`,
      description: isLocking
        ? `Tài khoản @${account.username} sẽ tạm thời không thể đăng nhập vào rạp phim. Vui lòng nhập mật khẩu Admin để khóa.`
        : `Tài khoản @${account.username} sẽ được khôi phục quyền đăng nhập và xem phim bình thường. Vui lòng nhập mật khẩu Admin để mở khóa.`,
      actionButtonText: isLocking ? 'Xác Nhận Khóa' : 'Xác Nhận Mở Khóa',
      isDestructive: isLocking,
      onExecute: async () => {
        const nextStatus = isLocking ? 'blocked' : 'active';
        await authService.updateAccount(account.id, { status: nextStatus });
        onShowToast(nextStatus === 'blocked' ? `Đã tạm khóa tài khoản @${account.username}` : `Đã mở khóa tài khoản @${account.username}`);
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        await loadData();
      },
    });
  };

  // 4. DELETE ACCOUNT WITH ADMIN CONFIRMATION
  const handleDeleteAccountClick = (account: Account) => {
    if (account.username === 'admin') {
      onShowToast('Không thể xóa tài khoản Admin mặc định!');
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
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
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
      alert('Vui lòng tải lên ảnh hoặc nhập đường dẫn ảnh hợp lệ.');
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
      className="min-h-screen w-full bg-[#070b16] text-white pt-6 sm:pt-10 pb-32 px-3 sm:px-6 lg:px-8 overflow-y-auto overflow-x-hidden"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
    >
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        {/* Top Bar Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0b1329]/95 border border-blue-900/60 p-4 sm:p-5 rounded-3xl backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <button
              id="admin-back-btn"
              onClick={onBackToCinema}
              className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700 shrink-0"
              title="Quay lại rạp phim"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 truncate">
                  Bảng Quản Trị Hệ Thống
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] uppercase font-bold shrink-0">
                  Admin Portal
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                Quản lý người dùng, cấp quyền bảo mật và kho ảnh đại diện
              </p>
            </div>
          </div>

          {/* Tab Selector & Refresh */}
          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer border border-slate-700 shrink-0"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center p-1 bg-[#131f37] rounded-2xl border border-slate-800 flex-1 sm:flex-initial overflow-x-auto">
              <button
                id="admin-tab-overview-btn"
                onClick={() => setActiveTab('overview')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Thống Kê & Đang Xem</span>
              </button>
              <button
                id="admin-tab-apis-btn"
                onClick={() => setActiveTab('apis')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'apis'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Quản Lý API</span>
              </button>
              <button
                id="admin-tab-accounts-btn"
                onClick={() => setActiveTab('accounts')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'accounts'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Tài Khoản ({accounts.length})</span>
              </button>
              <button
                id="admin-tab-avatars-btn"
                onClick={() => setActiveTab('avatars')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'avatars'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Kho Avatar ({customAvatars.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* --- TAB 0: OVERVIEW & REAL-TIME STATS --- */}
        {activeTab === 'overview' && (
          <div className="animate-in fade-in duration-200">
            <AdminOverviewTab onSwitchToApisTab={() => setActiveTab('apis')} />
          </div>
        )}

        {/* --- TAB 0.5: API MANAGEMENT --- */}
        {activeTab === 'apis' && (
          <div className="animate-in fade-in duration-200">
            <AdminApisTab onShowToast={onShowToast} />
          </div>
        )}

        {/* --- TAB 1: ACCOUNTS MANAGEMENT --- */}
        {activeTab === 'accounts' && (
          <div className="space-y-4 animate-in fade-in duration-200">
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

                      {/* Info details (Password HIDDEN as requested) */}
                      <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-[#131f37]/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between items-center">
                          <span>Quyền hạn:</span>
                          <span className="font-semibold text-slate-200">
                            {isAdmin ? 'Quản trị viên (Admin)' : 'Người dùng rạp phim'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Số hồ sơ:</span>
                          <span className="font-bold text-sky-300">{acc.profilesCount || 1} / 5 hồ sơ</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Ngày khởi tạo:</span>
                          <span className="text-slate-300">
                            {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('vi-VN') : 'Mặc định'}
                          </span>
                        </div>
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

        {/* --- TAB 2: AVATAR GALLERY MANAGEMENT --- */}
        {activeTab === 'avatars' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Upload New Avatar Card */}
            <div className="bg-[#0f172a] border border-blue-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl">
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

            {/* Custom Avatars Display */}
            <div>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
                Avatar do Admin đã thêm ({customAvatars.length})
              </h3>
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
                  Chưa có avatar tải lên nào. Admin có thể tải ảnh lên ở khung phía trên.
                </div>
              )}
            </div>

            {/* Default Avatar Presets */}
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                Avatar mặc định có sẵn của hệ thống
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2.5 opacity-80">
                {DEFAULT_AVATARS.map((av, idx) => (
                  <div key={idx} className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-slate-800 shadow">
                    <img src={av} alt="Default" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
                    placeholder="Tối thiểu 4 ký tự"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
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

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Đặt lại mật khẩu mới cho user:
                  </label>
                  <input
                    type="password"
                    placeholder="Để trống nếu giữ nguyên mật khẩu cũ"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
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
    </div>
  );
};
