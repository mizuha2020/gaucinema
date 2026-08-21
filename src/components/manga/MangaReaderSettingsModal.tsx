import React from 'react';
import {
  X,
  Eye,
  Sun,
  Palette,
  ArrowLeftRight,
  Keyboard,
  RotateCcw,
  Sliders,
  Check,
  BookOpen,
  Zap,
  Sparkles,
} from 'lucide-react';

export interface MangaReaderSettings {
  colorFilter: 'normal' | 'sepia' | 'dark-invert' | 'high-contrast';
  brightness: number; // 40 to 120 (%)
  readingDirection: 'ltr' | 'rtl'; // For single page mode
  backgroundColor: 'black' | 'dark-gray' | 'warm-paper' | 'navy';
  autoScrollSpeed: number; // 0 (off), 1 (slow), 2 (medium), 3 (fast)
  imageQuality: 'data-saver' | 'original'; // Fast data-saver vs full original HD
}

export const DEFAULT_READER_SETTINGS: MangaReaderSettings = {
  colorFilter: 'normal',
  brightness: 100,
  readingDirection: 'ltr',
  backgroundColor: 'black',
  autoScrollSpeed: 0,
  imageQuality: 'data-saver',
};

interface MangaReaderSettingsModalProps {
  settings: MangaReaderSettings;
  onChangeSettings: (newSettings: MangaReaderSettings) => void;
  onClose: () => void;
  onOpenShortcuts: () => void;
}

export const MangaReaderSettingsModal: React.FC<MangaReaderSettingsModalProps> = ({
  settings,
  onChangeSettings,
  onClose,
  onOpenShortcuts,
}) => {
  const updateSetting = <K extends keyof MangaReaderSettings>(
    key: K,
    value: MangaReaderSettings[K]
  ) => {
    onChangeSettings({
      ...settings,
      [key]: value,
    });
  };

  const handleReset = () => {
    onChangeSettings(DEFAULT_READER_SETTINGS);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#18181b] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Tùy biến hiển thị & Mắt đọc</h3>
              <p className="text-xs text-gray-400">Bảo vệ mắt và tùy chỉnh trải nghiệm đọc</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Presets */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-2">
            <Palette className="w-3.5 h-3.5 text-blue-400" />
            <span>Bộ lọc màu truyện</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('colorFilter', 'normal')}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                settings.colorFilter === 'normal'
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Màu gốc</span>
                {settings.colorFilter === 'normal' && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </div>
              <span className="text-[11px] text-gray-400">Ảnh gốc sắc nét</span>
            </button>

            <button
              onClick={() => updateSetting('colorFilter', 'sepia')}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                settings.colorFilter === 'sepia'
                  ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Giấy vàng (Sepia)</span>
                {settings.colorFilter === 'sepia' && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </div>
              <span className="text-[11px] text-amber-300/70">Chống mỏi mắt ban đêm</span>
            </button>

            <button
              onClick={() => updateSetting('colorFilter', 'dark-invert')}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                settings.colorFilter === 'dark-invert'
                  ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Đêm sâu (Âm bản)</span>
                {settings.colorFilter === 'dark-invert' && <Check className="w-3.5 h-3.5 text-purple-400" />}
              </div>
              <span className="text-[11px] text-purple-300/70">Đảo màu nền tối</span>
            </button>

            <button
              onClick={() => updateSetting('colorFilter', 'high-contrast')}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                settings.colorFilter === 'high-contrast'
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Nét đậm rõ chữ</span>
                {settings.colorFilter === 'high-contrast' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
              <span className="text-[11px] text-emerald-300/70">Tăng tương phản</span>
            </button>
          </div>
        </div>

        {/* Brightness Adjustment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <label className="text-gray-400 flex items-center space-x-2 uppercase tracking-wider">
              <Sun className="w-3.5 h-3.5 text-yellow-400" />
              <span>Độ sáng màn đọc</span>
            </label>
            <span className="font-mono text-yellow-400">{settings.brightness}%</span>
          </div>
          <input
            type="range"
            min="40"
            max="120"
            step="5"
            value={settings.brightness}
            onChange={(e) => updateSetting('brightness', Number(e.target.value))}
            className="w-full accent-yellow-400 cursor-pointer h-2 bg-white/10 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[11px] text-gray-500 font-medium">
            <span>Dịu mắt (40%)</span>
            <span>Mặc định (100%)</span>
            <span>Rực rỡ (120%)</span>
          </div>
        </div>

        {/* Background Color Themes */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-2">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Màu nền khung đọc</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'black', label: 'Đen tuyền', color: '#09090b', border: 'border-zinc-700' },
              { id: 'dark-gray', label: 'Xám tối', color: '#18181b', border: 'border-zinc-600' },
              { id: 'navy', label: 'Xanh đậm', color: '#0f172a', border: 'border-blue-900' },
              { id: 'warm-paper', label: 'Nâu ấm', color: '#1c1917', border: 'border-amber-900' },
            ].map((bg) => (
              <button
                key={bg.id}
                onClick={() => updateSetting('backgroundColor', bg.id as MangaReaderSettings['backgroundColor'])}
                className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center space-y-1 ${
                  settings.backgroundColor === bg.id
                    ? 'border-blue-500 ring-2 ring-blue-500/40 bg-white/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full border border-white/20 shadow-inner"
                  style={{ backgroundColor: bg.color }}
                />
                <span className="text-[11px] font-medium text-gray-300">{bg.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reading Direction (Single mode) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-2">
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
            <span>Hướng lật trang (Chế độ Từng trang)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('readingDirection', 'ltr')}
              className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.readingDirection === 'ltr'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div>
                <p className="text-xs font-bold">Trái sang Phải (LTR)</p>
                <p className="text-[10px] text-gray-400">Manhwa / Webtoon</p>
              </div>
              {settings.readingDirection === 'ltr' && <Check className="w-4 h-4 text-indigo-400" />}
            </button>

            <button
              onClick={() => updateSetting('readingDirection', 'rtl')}
              className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.readingDirection === 'rtl'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div>
                <p className="text-xs font-bold">Phải sang Trái (RTL)</p>
                <p className="text-[10px] text-gray-400">Manga Nhật Bản</p>
              </div>
              {settings.readingDirection === 'rtl' && <Check className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </div>

        {/* Image Quality & Loading Speed */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Tốc độ tải & Chất lượng ảnh</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('imageQuality', 'data-saver')}
              className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.imageQuality === 'data-saver' || !settings.imageQuality
                  ? 'bg-amber-600/20 border-amber-500 text-white ring-1 ring-amber-500/30'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div>
                <div className="flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <p className="text-xs font-bold text-amber-300">Siêu Tốc (Nén Data-Saver)</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Tải nhanh gấp 3 lần, tiết kiệm mạng</p>
              </div>
              {(settings.imageQuality === 'data-saver' || !settings.imageQuality) && (
                <Check className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
              )}
            </button>

            <button
              onClick={() => updateSetting('imageQuality', 'original')}
              className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.imageQuality === 'original'
                  ? 'bg-blue-600/20 border-blue-500 text-white ring-1 ring-blue-500/30'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div>
                <div className="flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  <p className="text-xs font-bold text-blue-300">Gốc (Độ Phân Giải Cao)</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Nét tối đa chuẩn MangaDex</p>
              </div>
              {settings.imageQuality === 'original' && (
                <Check className="w-4 h-4 text-blue-400 shrink-0 ml-1" />
              )}
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onOpenShortcuts();
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-gray-200 transition"
              title="Phím tắt trên máy tính"
            >
              <Keyboard className="w-3.5 h-3.5 text-blue-400" />
              <span>Phím tắt PC</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow-lg shadow-blue-600/30"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  const shortcuts = [
    { key: '→ / D', desc: 'Trang tiếp theo / Lật trang tới' },
    { key: '← / A', desc: 'Trang trước / Lật trang lùi' },
    { key: '↓ / S / Space', desc: 'Cuộn xuống mượt mà (Webtoon)' },
    { key: '↑ / W', desc: 'Cuộn lên mượt mà (Webtoon)' },
    { key: 'PageUp / PageDn', desc: 'Cuộn nhanh một màn hình' },
    { key: 'M', desc: 'Đổi chế độ Cuộn dọc ⟷ Từng trang' },
    { key: 'C / L', desc: 'Mở danh sách các chương' },
    { key: 'F', desc: 'Bật / Tắt chế độ Toàn màn hình (Fullscreen)' },
    { key: '+ / Z', desc: 'Phóng to ảnh (Zoom In)' },
    { key: '- / X', desc: 'Thu nhỏ ảnh (Zoom Out)' },
    { key: '0 / R', desc: 'Đặt lại kích thước chuẩn 100%' },
    { key: 'Esc', desc: 'Đóng trình đọc / Đóng menu' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#18181b] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Phím tắt bàn phím (PC / Laptop)</h3>
              <p className="text-xs text-gray-400">Điều hướng đọc manga nhanh không cần chạm chuột</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs"
            >
              <span className="text-gray-300 font-medium">{sc.desc}</span>
              <kbd className="px-2 py-1 bg-black/60 border border-white/20 rounded-lg font-mono font-bold text-blue-400 text-[11px] shadow">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow-lg shadow-blue-600/30"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
