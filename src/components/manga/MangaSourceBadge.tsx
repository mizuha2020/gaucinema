import React from 'react';
import { MangaSource } from '../../services/mangaApi';

const SOURCE_CONFIG: Record<MangaSource, { label: string; className: string }> = {
  mangadex: { label: 'MangaDex', className: 'bg-indigo-600 text-white border-indigo-400/50 shadow-indigo-600/20' },
  truyenqq: { label: 'TruyenQQ', className: 'bg-emerald-600 text-white border-emerald-400/50 shadow-emerald-600/20' },
  otruyen: { label: 'OTruyen', className: 'bg-amber-600 text-white border-amber-400/50 shadow-amber-600/20' },
  cuutruyen: { label: 'Cứu Truyện', className: 'bg-rose-600 text-white border-rose-400/50 shadow-rose-600/20' },
};

export const MangaSourceBadge: React.FC<{ source: MangaSource; size?: 'xs' | 'sm'; className?: string }> = ({ source, size = 'xs', className = '' }) => {
  const cfg = SOURCE_CONFIG[source] || { label: source.toUpperCase(), className: 'bg-slate-700 text-white border-white/20' };
  const sizeCls = size === 'sm' ? 'text-[11px] px-2.5 py-1' : 'text-[9px] px-1.5 py-0.5';
  return (
    <span className={`inline-flex items-center font-black tracking-wider uppercase rounded-full border shadow-md backdrop-blur ${sizeCls} ${cfg.className} ${className}`}>
      {cfg.label}
    </span>
  );
};

export const getSourceBadgeConfig = (source: MangaSource) => SOURCE_CONFIG[source];
