import React, { useState, useEffect } from 'react';
import { SystemApiEndpoint, ApiCategory, ApiHealthStatus } from '../../types';
import { systemApiService } from '../../services/systemApiService';
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Search,
  X,
  Shuffle,
  ShieldCheck,
  HardDrive,
  Database,
  Cpu,
  Zap,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface AdminApisTabProps {
  onShowToast: (msg: string) => void;
  currentSubTab?: 'api_status' | 'fallback_routing' | 'system_info';
  onChangeSubTab?: (tab: 'api_status' | 'fallback_routing' | 'system_info') => void;
}

export const AdminApisTab: React.FC<AdminApisTabProps> = ({
  onShowToast,
  currentSubTab,
  onChangeSubTab,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<'api_status' | 'fallback_routing' | 'system_info'>('api_status');
  const subTab = currentSubTab || internalSubTab;

  const handleSetSubTab = (tab: 'api_status' | 'fallback_routing' | 'system_info') => {
    if (onChangeSubTab) {
      onChangeSubTab(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const [apis, setApis] = useState<SystemApiEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);
  const [pingingApiId, setPingingApiId] = useState<string | null>(null);

  // Fallback Configuration state
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('gau_api_smart_fallback');
      return val !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleFallback = (enabled: boolean) => {
    setFallbackEnabled(enabled);
    try {
      localStorage.setItem('gau_api_smart_fallback', enabled ? 'true' : 'false');
      onShowToast(enabled ? 'Đã kích hoạt chế độ Tự Động Dự Phòng (Smart Fallback)' : 'Đã tắt chế độ Tự Động Dự Phòng');
    } catch (e) {
      void 0;
    }
  };

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingApi, setEditingApi] = useState<SystemApiEndpoint | null>(null);

  // Form fields
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

  // Delete confirmation
  const [deletingApi, setDeletingApi] = useState<SystemApiEndpoint | null>(null);

  // Cache stats
  const [cacheClearState, setCacheClearState] = useState<boolean>(false);

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
        // Update existing API
        await systemApiService.updateEndpoint(editingApi.id, {
          name: formName.trim(),
          category: formCategory,
          baseUrl: formBaseUrl.trim(),
          testUrl: formTestUrl.trim() || formBaseUrl.trim(),
          description: formDescription.trim() || undefined,
          priority: formPriority,
          enabled: formEnabled,
        });
        onShowToast(`Đã cập nhật API "${formName}" cho toàn hệ thống!`);
      } else {
        // Create new API
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
        onShowToast(`Đã thêm API "${formName}" mới vào hệ thống!`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu cấu hình API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnabled = async (api: SystemApiEndpoint) => {
    try {
      await systemApiService.toggleEndpoint(api.id, !api.enabled);
      onShowToast(`Đã ${!api.enabled ? 'kích hoạt' : 'tạm dừng'} API "${api.name}"!`);
    } catch (e: any) {
      onShowToast(`Lỗi: ${e.message}`);
    }
  };

  const handlePingSingle = async (api: SystemApiEndpoint) => {
    setPingingApiId(api.id);
    try {
      const result = await systemApiService.checkEndpointHealth(api.id);
      const statusLabel = result.status === 'live' ? '🟢 Hoạt động tốt' : result.status === 'slow' ? '🟡 Chậm' : '🔴 Mất kết nối';
      onShowToast(`${api.name}: ${statusLabel} (${result.latencyMs}ms)`);
    } catch (e: any) {
      onShowToast(`Lỗi kiểm tra ${api.name}: ${e.message}`);
    } finally {
      setPingingApiId(null);
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    onShowToast('Đang kiểm tra độ trễ & trạng thái tất cả API song song...');
    try {
      await systemApiService.checkAllEndpointsHealth();
      onShowToast('Đã hoàn tất kiểm tra trạng thái toàn bộ hệ thống API!');
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
      onShowToast(`Đã xóa API "${deletingApi.name}" khỏi hệ thống.`);
      setDeletingApi(null);
    } catch (e: any) {
      onShowToast(`Lỗi khi xóa: ${e.message}`);
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Bạn có chắc muốn khôi phục danh sách API mặc định ban đầu không?')) {
      try {
        await systemApiService.resetToDefaults();
        onShowToast('Đã khôi phục danh sách API mặc định thành công.');
      } catch (e: any) {
        onShowToast(`Lỗi: ${e.message}`);
      }
    }
  };

  // Filtered APIs
  const filteredApis = apis.filter((api) => {
    const matchesCat = selectedCategory === 'all' || api.category === selectedCategory;
    const matchesSearch =
      api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.baseUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getStatusBadge = (status?: ApiHealthStatus, latencyMs?: number) => {
    if (status === 'live') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Live ({latencyMs || '<600'}ms)</span>
        </span>
      );
    }
    if (status === 'slow') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>Slow ({latencyMs || '800+'}ms)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-950/80 text-red-300 border border-red-700/60 shadow-sm">
        <span className="w-2 h-2 rounded-full bg-red-500"></span>
        <span>Down {latencyMs ? `(${latencyMs}ms)` : '(Lỗi)'}</span>
      </span>
    );
  };

  // API stats
  const liveApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'live').length;
  const slowApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'slow').length;
  const downApisCount = apis.filter((a) => a.enabled && a.lastStatus === 'down').length;
  const disabledApisCount = apis.filter((a) => !a.enabled).length;

  const handleClearCache = () => {
    try {
      setCacheClearState(true);
      // Clear non-critical cache keys while preserving active admin session
      const keysToPreserve = ['gau_cinema_current_account', 'gau_admin_active_tab', 'gau_admin_main_section'];
      const preserved: Record<string, string | null> = {};
      keysToPreserve.forEach((k) => {
        preserved[k] = localStorage.getItem(k);
      });
      localStorage.clear();
      sessionStorage.clear();
      keysToPreserve.forEach((k) => {
        if (preserved[k] !== null) localStorage.setItem(k, preserved[k]!);
      });
      setTimeout(() => {
        setCacheClearState(false);
        onShowToast('Đã dọn dẹp bộ nhớ tạm (Cache) thành công!');
      }, 500);
    } catch (e: any) {
      setCacheClearState(false);
      onShowToast(`Lỗi dọn cache: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0b1329] border border-blue-900/60 p-2 sm:p-2.5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[#070b16] rounded-xl border border-slate-800">
          <button
            id="subtab-api-status-btn"
            onClick={() => handleSetSubTab('api_status')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'api_status'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span>Điểm Cuối API ({apis.length})</span>
          </button>

          <button
            id="subtab-fallback-routing-btn"
            onClick={() => handleSetSubTab('fallback_routing')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'fallback_routing'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Cấu Hình Dự Phòng & Ưu Tiên</span>
          </button>

          <button
            id="subtab-system-info-btn"
            onClick={() => handleSetSubTab('system_info')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'system_info'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hạ Tầng & Dữ Liệu Cache</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-2 text-xs">
          <span className="text-[11px] font-mono text-slate-400">
            {liveApisCount} Live / {slowApisCount} Slow / {downApisCount} Down
          </span>
        </div>
      </div>

      {/* --- SUBTAB 1: API STATUS & ENDPOINTS --- */}
      {subTab === 'api_status' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Header & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a] border border-blue-900/40 p-4 sm:p-5 rounded-2xl shadow-lg">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-sky-400" />
                <span>Quản Lý Hệ Thống API & Nguồn Phát</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Cấu hình, thêm mới, sửa, xóa và kiểm tra thời gian thực trạng thái máy chủ (Xanh: Live | Vàng: Slow | Đỏ: Down).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCheckAll}
                disabled={isCheckingAll}
                className="flex items-center gap-2 text-xs font-bold text-sky-300 bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                title="Gửi ping kiểm tra đồng loạt tất cả các API"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingAll ? 'animate-spin' : ''}`} />
                <span>{isCheckingAll ? 'Đang Kiểm Tra...' : 'Kiểm Tra Tất Cả API'}</span>
              </button>

              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-transform active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Thêm API Mới</span>
              </button>

              <button
                onClick={handleResetDefaults}
                className="text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
                title="Khôi phục danh sách nguồn mặc định"
              >
                Khôi Phục Mặc Định
              </button>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 bg-[#0f172a] border border-slate-800 p-1 rounded-xl">
              {[
                { id: 'all', label: 'Tất Cả' },
                { id: 'movie', label: 'Phim Ảnh' },
                { id: 'manga', label: 'Truyện Manga' },
                { id: 'livetv', label: 'Truyền Hình TV' },
                { id: 'utility', label: 'Tiện Ích / Proxy' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === tab.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên, URL, ID..."
                className="w-full bg-[#0f172a] border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* API Cards Grid */}
          {filteredApis.length === 0 ? (
            <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
              <Server className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Không tìm thấy API nào phù hợp</p>
              <p className="text-xs text-slate-500">
                Bạn có thể thử tìm với từ khóa khác hoặc bấm "+ Thêm API Mới" để bổ sung endpoint mới.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredApis.map((api) => {
                const isPinging = pingingApiId === api.id;
                return (
                  <div
                    key={api.id}
                    className={`bg-[#0f172a] border rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between transition-all ${
                      api.enabled
                        ? 'border-blue-900/40 hover:border-blue-700/60'
                        : 'border-slate-800/60 opacity-60 bg-slate-950/40'
                    }`}
                  >
                    <div>
                      {/* Top Bar: Name, Category & Enable Toggle */}
                      <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-white truncate">{api.name}</h3>
                            <span className="text-[10px] font-mono uppercase bg-blue-950 text-sky-400 border border-blue-800/60 px-1.5 py-0.5 rounded">
                              {api.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                            ID: <span className="text-slate-300">@{api.id}</span>
                            {api.priority && <span className="text-slate-500 ml-2">Ưu tiên: #{api.priority}</span>}
                          </p>
                        </div>

                        {/* Enable / Disable Toggle Switch */}
                        <button
                          onClick={() => handleToggleEnabled(api)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            api.enabled ? 'bg-blue-600' : 'bg-slate-700'
                          }`}
                          title={api.enabled ? 'Đang kích hoạt (Bấm để tắt)' : 'Đang tắt (Bấm để bật)'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              api.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* URL presentation */}
                      <div className="space-y-2 text-xs mb-4">
                        <div className="bg-[#131f37]/60 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] break-all">
                          <span className="text-slate-500 select-none">Base URL: </span>
                          <span className="text-sky-300">{api.baseUrl}</span>
                        </div>

                        {api.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{api.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Status Indicator & Actions Footer */}
                    <div className="pt-3 border-t border-slate-800/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(api.lastStatus, api.lastLatencyMs)}
                        </div>

                        <button
                          onClick={() => handlePingSingle(api)}
                          disabled={isPinging}
                          className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                          title="Kiểm tra kết nối và đo độ trễ ms"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-sky-400' : ''}`} />
                          <span>{isPinging ? 'Đang đo...' : 'Ping Test'}</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          onClick={() => handleOpenEditModal(api)}
                          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>

                        <button
                          onClick={() => setDeletingApi(api)}
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-red-950/60 hover:bg-red-900/60 border border-red-800/60 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- SUBTAB 2: FALLBACK ROUTING & PRIORITY --- */}
      {subTab === 'fallback_routing' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Smart Fallback Toggle Card */}
          <div className="bg-[#0f172a] border border-blue-900/60 p-5 sm:p-6 rounded-3xl shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 shrink-0">
                  <Shuffle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Tự Động Chuyển Nguồn Thông Minh (Smart Auto-Fallback)</span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-900 text-indigo-200 text-[10px] font-bold">
                      ACTIVE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Khi API nguồn chính gặp sự cố (Timeout, HTTP 500, Rate limit), hệ thống tự động định tuyến sang nguồn dự phòng tiếp theo.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleFallback(!fallbackEnabled)}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  fallbackEnabled ? 'bg-blue-600' : 'bg-slate-700'
                }`}
                title="Bật/Tắt chế độ tự động dự phòng"
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    fallbackEnabled ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Explanation & Algorithm Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
              <div className="bg-[#131f37]/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>1. Phát Hiện Sự Cố Thời Gian Thực</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hệ thống liên tục theo dõi mã trạng thái HTTP và độ trễ phản hồi từ máy chủ nguồn. Nếu phát hiện lỗi hoặc timeout &gt; 6s, trình phát sẽ không bị gián đoạn.
                </p>
              </div>

              <div className="bg-[#131f37]/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                  <Layers className="w-4 h-4" />
                  <span>2. Định Tuyến Theo Thứ Tự Ưu Tiên</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Lựa chọn nguồn dự phòng tiếp theo có độ ưu tiên cao nhất (#1 → #2 → #3) và có trạng thái <code>Live</code> / <code>Slow</code> với độ trễ thấp nhất.
                </p>
              </div>

              <div className="bg-[#131f37]/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <Zap className="w-4 h-4" />
                  <span>3. Trải Nghiệm Liền Mạch Cho Người Xem</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Người xem tại rạp phim hoặc người đọc truyện không cần thao tác tải lại trang, luồng dữ liệu tự động đồng bộ hóa trong suốt và mượt mà.
                </p>
              </div>
            </div>
          </div>

          {/* Priority breakdown by category */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Thứ Tự Ưu Tiên Nguồn Phát Theo Thể Loại
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Movies priority */}
              <div className="bg-[#0f172a] border border-blue-900/40 p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-sky-400">🎬 Phim Ảnh (Movie Streaming)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {apis.filter((a) => a.category === 'movie' && a.enabled).length} nguồn hoạt động
                  </span>
                </div>

                <div className="space-y-2">
                  {apis
                    .filter((a) => a.category === 'movie')
                    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                    .map((api, idx) => (
                      <div
                        key={api.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#131f37] border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-blue-950 text-sky-400 border border-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{api.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono truncate">{api.baseUrl}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(api.lastStatus, api.lastLatencyMs)}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              api.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {api.enabled ? 'Ưu tiên ' + (api.priority || idx + 1) : 'Tắt'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Manga priority */}
              <div className="bg-[#0f172a] border border-blue-900/40 p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-indigo-400">📖 Truyện Tranh (Manga Reader)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {apis.filter((a) => a.category === 'manga' && a.enabled).length} nguồn hoạt động
                  </span>
                </div>

                <div className="space-y-2">
                  {apis
                    .filter((a) => a.category === 'manga')
                    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                    .map((api, idx) => (
                      <div
                        key={api.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#131f37] border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center font-bold text-xs shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{api.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono truncate">{api.baseUrl}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(api.lastStatus, api.lastLatencyMs)}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              api.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {api.enabled ? 'Ưu tiên ' + (api.priority || idx + 1) : 'Tắt'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUBTAB 3: SYSTEM INFO & CACHE --- */}
      {subTab === 'system_info' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Cloud Firestore Info Card */}
          <div className="bg-[#0f172a] border border-blue-900/60 p-5 sm:p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400 shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Cơ Sở Dữ Liệu Cloud Firestore</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Đồng Bộ Trực Tiếp</span>
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lưu trữ dữ liệu thời gian thực người dùng, hồ sơ, tiến trình xem phim, lịch sử và kho ảnh đại diện.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#131f37] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-[11px] text-slate-400">Database Project ID</p>
                <p className="text-xs font-mono font-bold text-sky-300 truncate">ai-studio-qtbrpphimcnhn</p>
              </div>
              <div className="bg-[#131f37] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-[11px] text-slate-400">Khu Vực Máy Chủ (Region)</p>
                <p className="text-xs font-mono font-bold text-emerald-400">asia-southeast1 (Singapore)</p>
              </div>
              <div className="bg-[#131f37] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-[11px] text-slate-400">Thời Gian Lưu Session</p>
                <p className="text-xs font-mono font-bold text-indigo-400">Heartbeat 15s (Presence)</p>
              </div>
              <div className="bg-[#131f37] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-[11px] text-slate-400">Phiên Bản Hệ Thống</p>
                <p className="text-xs font-mono font-bold text-amber-400">Gấu Cinema v2.5 Admin</p>
              </div>
            </div>
          </div>

          {/* Cache Management Card */}
          <div className="bg-[#0f172a] border border-blue-900/60 p-5 sm:p-6 rounded-3xl shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400 shrink-0">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Bộ Nhớ Tạm & Dọn Dẹp Dữ Liệu Trình Duyệt (Cache)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Xóa các bộ nhớ đệm tạm thời của tìm kiếm và lịch sử hiển thị giao diện để giải phóng dung lượng.
                  </p>
                </div>
              </div>

              <button
                onClick={handleClearCache}
                disabled={cacheClearState}
                className="flex items-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-4 py-2.5 rounded-xl shadow-lg shadow-amber-600/30 transition-transform active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>{cacheClearState ? 'Đang Dọn Dẹp...' : 'Dọn Dẹp Cache Trình Duyệt'}</span>
              </button>
            </div>

            <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2 bg-[#131f37]/50 p-3 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Bảo toàn phiên đăng nhập của Admin</span>
              </div>
              <div className="flex items-center gap-2 bg-[#131f37]/50 p-3 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Làm mới toàn bộ danh sách API trên RAM</span>
              </div>
              <div className="flex items-center gap-2 bg-[#131f37]/50 p-3 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Tối ưu hóa tốc độ tải trang cho thiết bị yếu</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit API Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0f172a] border border-blue-900/60 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center text-sky-400">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingApi ? 'Chỉnh Sửa API Endpoint' : 'Thêm API Endpoint Mới'}
                </h3>
                <p className="text-xs text-slate-400">
                  Cấu hình nguồn cung cấp dữ liệu cho toàn bộ ứng dụng Gấu Cinema
                </p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 bg-red-950/60 border border-red-800/80 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* ID & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mã API (ID) *
                  </label>
                  <input
                    type="text"
                    value={formId}
                    disabled={!!editingApi}
                    onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="kkphim, ophim, otruyen..."
                    required
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tên Hiển Thị *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ví dụ: KKPhim VIP, OTruyen CDN..."
                    required
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Danh Mục Nguồn
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ApiCategory)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="movie">Phim (Movie)</option>
                    <option value="manga">Manga (Truyện Tranh)</option>
                    <option value="livetv">Truyền Hình (LiveTV)</option>
                    <option value="utility">Tiện Ích / Proxy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mức Ưu Tiên (1 = Cao nhất)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={formPriority}
                    onChange={(e) => setFormPriority(Number(e.target.value) || 1)}
                    className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Địa Chỉ Base URL (Máy Chủ) *
                </label>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  required
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Test / Health Check URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Đường Dẫn Ping Test (Health Check URL)
                </label>
                <input
                  type="text"
                  value={formTestUrl}
                  onChange={(e) => setFormTestUrl(e.target.value)}
                  placeholder="https://api.example.com/health hoặc để trống"
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mô Tả & Ghi Chú Nguồn
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú về chất lượng máy chủ, băng thông, định dạng hỗ trợ..."
                  rows={2}
                  className="w-full bg-[#131f37] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Enabled Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="form-enabled-checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="form-enabled-checkbox" className="text-xs text-slate-300 cursor-pointer">
                  Kích hoạt API này ngay lập tức cho toàn hệ thống
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs text-slate-400 hover:text-white px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang Lưu...' : editingApi ? 'Cập Nhật Toàn Hệ Thống' : 'Thêm API Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingApi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0f172a] border border-red-900/60 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-800 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Xác Nhận Xóa API</h3>
                <p className="text-xs text-slate-400">Thao tác này sẽ xóa API khỏi Firestore của ứng dụng</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-[#131f37] p-3 rounded-xl border border-slate-800">
              Bạn có chắc chắn muốn xóa API <strong className="text-white">"{deletingApi.name}"</strong> (
              <span className="font-mono text-sky-300">{deletingApi.baseUrl}</span>)?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeletingApi(null)}
                className="text-xs text-slate-400 hover:text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="text-xs font-bold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-xl shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
