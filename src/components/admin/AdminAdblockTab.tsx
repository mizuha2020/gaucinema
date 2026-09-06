import React, { useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, ShieldCheck, Trash2, FlaskConical } from 'lucide-react';
import {
  adblockService,
  DEFAULT_ADBLOCK_KEYWORDS,
  DEFAULT_ADBLOCK_REGEXES,
} from '../../services/adblockService';

interface AdminAdblockTabProps {
  onShowToast: (msg: string) => void;
}

export const AdminAdblockTab: React.FC<AdminAdblockTabProps> = ({ onShowToast }) => {
  const [keywords, setKeywords] = useState<string[]>([...DEFAULT_ADBLOCK_KEYWORDS]);
  const [regexes, setRegexes] = useState<string[]>([...DEFAULT_ADBLOCK_REGEXES]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newRegex, setNewRegex] = useState('');
  const [testUri, setTestUri] = useState('/v9/abc123/segment_0001.ts');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    adblockService
      .refresh()
      .then((rules) => {
        if (!alive) return;
        setKeywords(rules.keywords);
        setRegexes(rules.regexes);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    const unsub = adblockService.subscribe((rules) => {
      if (!alive) return;
      setKeywords(rules.keywords);
      setRegexes(rules.regexes);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const handleAddKeyword = () => {
    const k = newKeyword.trim().toLowerCase();
    if (!k) return;
    if (k.length < 2) {
      onShowToast('Từ khóa phải dài ít nhất 2 ký tự');
      return;
    }
    if (keywords.includes(k)) {
      onShowToast('Từ khóa đã tồn tại');
      return;
    }
    setKeywords((prev) => [...prev, k]);
    setNewKeyword('');
  };

  const handleAddRegex = () => {
    const r = newRegex.trim();
    if (!r) return;
    try {
      // eslint-disable-next-line no-new
      new RegExp(r, 'i');
    } catch {
      onShowToast('Regex không hợp lệ');
      return;
    }
    if (regexes.includes(r)) {
      onShowToast('Regex đã tồn tại');
      return;
    }
    setRegexes((prev) => [...prev, r]);
    setNewRegex('');
  };

  const handleSave = async () => {
    if (keywords.length === 0) {
      onShowToast('Cần ít nhất 1 từ khóa');
      return;
    }
    setIsSaving(true);
    try {
      await adblockService.saveRules(keywords, regexes);
      onShowToast(`Đã lưu ${keywords.length} từ khóa + ${regexes.length} regex lên RTDB. Client/server áp dụng trong ~60s.`);
    } catch (e: any) {
      onShowToast(`Lỗi lưu: ${e?.message || 'không rõ'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Khôi phục rule mặc định?')) return;
    setIsSaving(true);
    try {
      const rules = await adblockService.resetToDefaults();
      setKeywords(rules.keywords);
      setRegexes(rules.regexes);
      onShowToast('Đã khôi phục rule mặc định.');
    } catch (e: any) {
      onShowToast(`Lỗi: ${e?.message || 'không rõ'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const testBlocked = (() => {
    if (!testUri.trim()) return null;
    try {
      return adblockService.matches(testUri.trim());
    } catch {
      return null;
    }
  })();

  if (isLoading) {
    return <div className="text-xs text-slate-400 p-4">Đang tải rules từ RTDB...</div>;
  }

  return (
    <div className="bg-[#0f172a] border border-blue-900/40 p-4 rounded-2xl shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-xs font-bold text-white">Chặn quảng cáo HLS (remote keywords)</div>
            <div className="text-[11px] text-slate-400">
              Lưu trên RTDB <span className="font-mono text-sky-300">system_cache/adblock</span> — đổi pattern không cần build lại app
            </div>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-300 bg-[#131f37] border border-slate-700 hover:text-white cursor-pointer disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Mặc định
        </button>
      </div>

      {/* Keywords */}
      <div>
        <div className="text-[11px] font-bold text-slate-300 mb-1.5">Từ khóa (substring, không phân biệt hoa thường) — {keywords.length}</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {keywords.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono bg-emerald-900/40 text-emerald-200 border border-emerald-700/50"
            >
              {k}
              <button
                onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}
                className="text-emerald-400 hover:text-red-300 cursor-pointer"
                title={`Xóa ${k}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddKeyword();
            }}
            placeholder="vd: /v9/, convertv10, seg-ad..."
            className="flex-1 px-3 py-2 rounded-xl text-xs bg-[#131f37] border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleAddKeyword}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </div>
      </div>

      {/* Regexes */}
      <div>
        <div className="text-[11px] font-bold text-slate-300 mb-1.5">Regex nâng cao (vd {"\\/v\\d+\\/"}) — {regexes.length}</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {regexes.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono bg-indigo-900/40 text-indigo-200 border border-indigo-700/50"
            >
              {r}
              <button
                onClick={() => setRegexes((prev) => prev.filter((x) => x !== r))}
                className="text-indigo-400 hover:text-red-300 cursor-pointer"
                title={`Xóa ${r}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={newRegex}
            onChange={(e) => setNewRegex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddRegex();
            }}
            placeholder="vd: \/v\d+\/, seg[_-]ad"
            className="flex-1 px-3 py-2 rounded-xl text-xs font-mono bg-[#131f37] border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleAddRegex}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </div>
      </div>

      {/* Test */}
      <div className="p-3 rounded-xl bg-[#131f37] border border-slate-800">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 mb-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-amber-300" />
          Kiểm tra 1 segment URI có bị chặn không
        </div>
        <div className="flex gap-1.5">
          <input
            value={testUri}
            onChange={(e) => setTestUri(e.target.value)}
            placeholder="/v7/abc/segment_0001.ts"
            className="flex-1 px-3 py-2 rounded-xl text-xs font-mono bg-[#0b1329] border border-slate-700 text-white placeholder:text-slate-500 outline-none focus:border-amber-500"
          />
          <span
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
              testBlocked ? 'bg-red-600/20 text-red-300 border border-red-600/50' : 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/50'
            }`}
          >
            {testBlocked == null ? '...' : testBlocked ? 'BỊ CHẶN' : 'GIỮ LẠI'}
          </span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving || keywords.length === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {isSaving ? 'Đang lưu lên RTDB...' : `Lưu ${keywords.length} từ khóa + ${regexes.length} regex`}
      </button>
    </div>
  );
};
