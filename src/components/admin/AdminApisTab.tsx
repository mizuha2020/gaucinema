import React, { useState, useEffect } from 'react';
import { SystemApiEndpoint, ApiCategory, ApiHealthStatus } from '../../types';
import { systemApiService } from '../../services/systemApiService';
import { getFullApiUrl, apiFetch, isNativeApp } from '../../services/apiConfig';
import { AdminHeroAssetsTab } from './AdminHeroAssetsTab';
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  AlertTriangle,
  XCircle,
  Search,
  X,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AdminApisTabProps {
  onShowToast: (msg: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  movie: 'Phim',
  manga: 'Truyện',
  utility: 'Tiện ích',
};

export const AdminApisTab: React.FC<AdminApisTabProps> = ({ onShowToast }) => {
  const [apis, setApis] = useState<SystemApiEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);
  const [pingingApiId, setPingingApiId] = useState<string | null>(null);

  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gau_api_smart_fallback') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleFallback = (enabled: boolean) => {
    setFallbackEnabled(enabled);
    try {
      localStorage.setItem('gau_api_smart_fallback', enabled ? 'true' : 'false');
      onShowToast(enabled ? 'Đã bật tự động chuyển nguồn dự phòng' : 'Đã tắt tự động chuyển nguồn');
    } catch {
      void 0;
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingApi, setEditingApi] = useState<SystemApiEndpoint | null>(null);

  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<ApiCategory>('movie');
  const [formBaseUrl, setFormBaseUrl] = useState<string>('');
  const [formTestUrl, setFormTestUrl] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formPriority, setFormPriority] = useState<number>(1);
  const [formEnabled, setFormEnabled] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [deletingApi, setDeletingApi] = useState<SystemApiEndpoint | null>(null);

  // Batch worker state
  const [batchStats, setBatchStats] = useState<any>(null);
  const [isSyncingBatch, setIsSyncingBatch] = useState<boolean>(false);
  const [showHeroAssets, setShowHeroAssets] = useState<boolean>(false);

  const fetchBatchStatus = async () => {
    try {
      // APK (Capacitor https://localhost) không có server local -> phải dùng absolute backend URL
      const res = await apiFetch('/api/system/batch-status');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setBatchStats(json.stats);
        }
      }
    } catch {}
  };

  const handleForceBatchSync = async () => {
    setIsSyncingBatch(true);
    onShowToast('🚀 Đang chạy Batch & cập nhật Banner vào database...');
    try {
      // Dùng getFullApiUrl để APK gọi đúng backend cloud thay vì https://localhost/...
      // Batch crawl TMDB + PhimAPI khá lâu -> timeout 120s
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      let res: Response;
      try {
        res = await apiFetch('/api/system/batch-sync', {
          method: 'POST',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setBatchStats(json.stats);
          onShowToast('✅ Đồng bộ Banner & Top 10 thành công!');
        } else {
          onShowToast(`⚠️ ${json.error || 'Lỗi đồng bộ'}`);
        }
      } else {
        let detail = '';
        try {
          const errJson = await res.json();
          if (errJson?.error) detail = `: ${errJson.error}`;
        } catch {}
        onShowToast(`⚠️ Máy chủ lỗi ${res.status}${detail}.`);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        onShowToast('⚠️ Batch chạy quá 120s, kiểm tra lại trạng thái sau ít phút.');
      } else {
        onShowToast(
          isNativeApp()
            ? '⚠️ APK không kết nối được máy chủ Batch. Kiểm tra backend URL.'
            : '⚠️ Không thể kết nối đến máy chủ Batch.'
        );
      }
    } finally {
      setIsSyncingBatch(false);
    }
  };

  useEffect(() => {
    fetchBatchStatus();
    const interval = setInterval(fetchBatchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = systemApiService.subscribe((updated) => {
      setApis(updated);
      setIsLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenAddModal = () => {
    setEditingApi(null);
    setFormId(`api_${Date.now()}`);
    setFormName('');
    setFormCategory('movie');
    setFormBaseUrl('https://phimapi.com');
    setFormTestUrl('https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1');
    setFormDescription('');
    setFormPriority(apis.length + 1);
    setFormEnabled(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (api: SystemApiEndpoint) => {
    setEditingApi(api);
    setFormId(api.id);
    setFormName(api.name);
    setFormCategory(api.category);
    setFormBaseUrl(api.baseUrl);
    setFormTestUrl(api.testUrl || systemApiService.getSmartTestUrl(api));
    setFormDescription(api.description || '');
    setFormPriority(api.priority || 1);
    setFormEnabled(api.enabled);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Vui lòng nhập tên API.');
      return;
    }
    if (!formBaseUrl.trim().startsWith('http://') && !formBaseUrl.trim().startsWith('https://') && !formBaseUrl.trim().startsWith('/api/')) {
      setFormError('Base URL phải bắt đầu bằng http://, https:// hoặc /api/');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingApi) {
        await systemApiService.updateEndpoint(editingApi.id, {
          name: formName.trim(),
          category: formCategory,
          baseUrl: formBaseUrl.trim(),
          testUrl: formTestUrl.trim() || formBaseUrl.trim(),
          description: formDescription.trim() || undefined,
          priority: formPriority,
          enabled: formEnabled,
        });
        onShowToast(`Đã cập nhật "${formName}"!`);
      } else {
        await systemApiService.addEndpoint({
          id: formId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || `api_${Date.now()}`,
          name: formName.trim(),
          category: formCategory,
          baseUrl: formBaseUrl.trim(),
          testUrl: formTestUrl.trim() || formBaseUrl.trim(),
          description: formDescription.trim() || undefined,
          enabled: formEnabled,
          priority: formPriority,
          isDefault: false,
        });
        onShowToast(`Đã thêm "${formName}"!`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnabled = async (api: SystemApiEndpoint) => {
    try {
      await systemApiService.toggleEndpoint(api.id, !api.enabled);
      onShowToast(`Đã ${!api.enabled ? 'bật' : 'tắt'} "${api.name}"!`);
    } catch (e: any) {
      onShowToast(`Lỗi: ${e.message}`);
    }
  };

  const handlePingSingle = async (api: SystemApiEndpoint) => {
    setPingingApiId(api.id);
    try {
      const result = await systemApiService.checkEndpointHealth(api.id);
      const label = result.status === 'live' ? '🟢 Tốt' : result.status === 'slow' ? '🟡 Chậm' : '🔴 Lỗi';
      onShowToast(`${api.name}: ${label} (${result.latencyMs}ms)`);
    } catch (e: any) {
      onShowToast(`Lỗi kiểm tra ${api.name}: ${e.message}`);
    } finally {
      setPingingApiId(null);
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    onShowToast('Đang kiểm tra tất cả nguồn...');
    try {
      await systemApiService.checkAllEndpointsHealth();
      onShowToast('Đã kiểm tra xong tất cả nguồn!');
    } catch (e: any) {
      onShowToast(`Lỗi: ${e.message}`);
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingApi) return;
    try {
      await systemApiService.deleteEndpoint(deletingApi.id);
      onShowToast(`Đã xóa "${deletingApi.name}".`);
      setDeletingApi(null);
    } catch (e: any) {
      onShowToast(`Lỗi khi xóa: ${e.message}`);
    }
  };

  const filteredApis = apis
    .filter((api) => {
      const matchesCat = selectedCategory === 'all' || api.category === selectedCategory;
      const matchesSearch =
        api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        api.baseUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        api.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    })
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const statusDot = (status?: ApiHealthStatus) =>
    status === 'live' ? 'bg-emerald-400' : status === 'slow' ? 'bg-amber-400' : 'bg-red-500';

  const liveCount = apis.filter((a) => a.enabled && a.lastStatus === 'live').length;
  const downCount = apis.filter((a) => a.enabled && a.lastStatus === 'down').length;

  return (
    <div className="space-y-4">
      {/* --- Banner & đồng bộ --- */}
      <div className="bg-[#0f172a] border border-blue-900/60 p-4 rounded-2xl shadow-lg space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">Banner & Top 10</h3>
              <p className="text-[11px] text-slate-400 truncate">
                {batchStats?.heroCount || 10}/10 banner • {batchStats?.netflixMoviesCount || 10} phim + {batchStats?.netflixTvCount || 10} bộ Top 10
                {batchStats?.lastRun ? ` • ${new Date(batchStats.lastRun).toLocaleTimeString('vi-VN')}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHeroAssets((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-sky-300 bg-sky-950/80 hover:bg-sky-900 px-3 py-2 rounded-xl border border-sky-800 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ảnh Banner</span>
              {showHeroAssets ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleForceBatchSync}
              disabled={isSyncingBatch || (batchStats && batchStats.isRunning)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-2 rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBatch || (batchStats && batchStats.isRunning) ? 'animate-spin' : ''}`} />
              <span>{isSyncingBatch || (batchStats && batchStats.isRunning) ? 'Đang chạy...' : 'Đồng bộ ngay'}</span>
            </button>
          </div>
        </div>
        {showHeroAssets && (
          <div className="pt-1">
            <AdminHeroAssetsTab
              onShowToast={onShowToast}
              onRefreshBatch={handleForceBatchSync}
              isSyncingBatch={isSyncingBatch}
            />
          </div>
        )}
      </div>

      {/* --- Nguồn phim --- */}
      <div className="bg-[#0f172a] border border-blue-900/40 p-4 rounded-2xl shadow-lg space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Nguồn phim ({apis.length})</h3>
            <span className="text-[11px] text-slate-400">🟢 {liveCount} • 🔴 {downCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckAll}
              disabled={isCheckingAll}
              className="flex items-center gap-1.5 text-xs font-bold text-sky-300 bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 px-3 py-2 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
              <span>{isCheckingAll ? 'Đang check...' : 'Check tất cả'}</span>
            </button>
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-2 rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm</span>
            </button>
          </div>
        </div>

        {/* Tìm kiếm + lọc */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, URL..."
              className="w-full bg-[#131f37] border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['all', 'movie', 'manga', 'utility'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat ? 'bg-blue-600 text-white' : 'text-slate-400 bg-[#131f37] hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Tất cả' : CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Tự động chuyển nguồn */}
        <button
          onClick={() => handleToggleFallback(!fallbackEnabled)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#131f37] border border-slate-800 cursor-pointer"
        >
          <span className="text-xs text-slate-300 font-medium">Tự động chuyển nguồn dự phòng khi lỗi</span>
          <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${fallbackEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${fallbackEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
          </span>
        </button>

        {/* Danh sách nguồn gọn */}
        {isLoading ? (
          <p className="text-xs text-slate-500 text-center py-6">Đang tải danh sách nguồn...</p>
        ) : filteredApis.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Không có nguồn nào. Bấm "Thêm" để bổ sung.</p>
        ) : (
          <div className="space-y-2">
            {filteredApis.map((api) => {
              const isPinging = pingingApiId === api.id;
              return (
                <div
                  key={api.id}
                  className={`rounded-xl border p-3 transition-all ${api.enabled ? 'bg-[#131f37] border-slate-800' : 'bg-slate-950/40 border-slate-800/60 opacity-60'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(api.lastStatus)} ${api.lastStatus === 'live' ? 'animate-pulse' : ''}`} />
                    <p className="font-bold text-xs text-white truncate flex-1">{api.name}</p>
                    <span className="text-[10px] uppercase bg-blue-950 text-sky-400 border border-blue-800/60 px-1.5 py-0.5 rounded shrink-0">
                      {CATEGORY_LABELS[api.category] || api.category}
                    </span>
                    {api.lastLatencyMs ? (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{api.lastLatencyMs}ms</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate mt-1 pl-4">{api.baseUrl}</p>
                  <div className="flex items-center justify-between mt-2 pl-4">
                    <button
                      onClick={() => handleToggleEnabled(api)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${api.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                      title={api.enabled ? 'Đang bật (bấm để tắt)' : 'Đang tắt (bấm để bật)'}
                    >
                      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${api.enabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handlePingSingle(api)}
                        disabled={isPinging}
                        className="text-[11px] text-slate-300 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer disabled:opacity-50"
                      >
                        {isPinging ? '...' : 'Ping'}
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(api)}
                        className="flex items-center gap-1 text-[11px] text-sky-400 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 px-2.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Sửa</span>
                      </button>
                      <button
                        onClick={() => setDeletingApi(api)}
                        className="p-1.5 text-red-400 bg-red-950/60 hover:bg-red-900/60 border border-red-800/60 rounded-lg cursor-pointer"
                        title="Xóa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-blue-900/60 rounded-2xl w-full max-w-lg shadow-2xl p-5 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-bold text-white mb-1">{editingApi ? 'Sửa nguồn' : 'Thêm nguồn mới'}</h3>
            <p className="text-[11px] text-slate-400 mb-4">Cấu hình nguồn dữ liệu cho toàn app</p>

            {formError && (
              <div className="mb-4 bg-red-950/60 border border-red-800/80 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mã nguồn (ID) *</label>
                  <input
                    type="text"
                    value={formId}
                    disabled={!!editingApi}
                    onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="kkphim, ophim..."
                    required
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tên hiển thị *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: KKPhim VIP"
                    required
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Loại</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ApiCategory)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="movie">Phim</option>
                    <option value="manga">Truyện</option>
                    <option value="utility">Tiện ích</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ưu tiên (1 = cao nhất)</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={formPriority}
                    onChange={(e) => setFormPriority(Number(e.target.value) || 1)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Base URL *</label>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  required
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">URL kiểm tra (để trống = dùng Base URL)</label>
                <input
                  type="text"
                  value={formTestUrl}
                  onChange={(e) => setFormTestUrl(e.target.value)}
                  placeholder="https://api.example.com/health"
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ghi chú</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú về nguồn này..."
                  rows={2}
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="form-enabled-checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="form-enabled-checkbox" className="text-xs text-slate-300 cursor-pointer">
                  Bật ngay cho toàn hệ thống
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-xs text-slate-400 hover:text-white px-4 py-2.5 rounded-xl cursor-pointer">
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingApi ? 'Lưu thay đổi' : 'Thêm nguồn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingApi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-red-900/60 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-800 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Xóa nguồn "{deletingApi.name}"?</h3>
                <p className="text-[11px] text-slate-400 font-mono truncate max-w-[260px]">{deletingApi.baseUrl}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button onClick={() => setDeletingApi(null)} className="text-xs text-slate-400 hover:text-white px-4 py-2 rounded-xl cursor-pointer">
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="text-xs font-bold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-xl shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
