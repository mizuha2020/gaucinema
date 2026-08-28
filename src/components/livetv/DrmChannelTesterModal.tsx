import React, { useState } from 'react';
import { X, Play, Key, Globe, Shield, Sparkles, FileText, Check } from 'lucide-react';
import { Channel } from '../../types';
import { parseClearkeyToHexMap, parseM3uWithDrmAndUA } from '../../utils/drmParser';

interface DrmChannelTesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayCustomChannel: (channel: Channel) => void;
}

export const DrmChannelTesterModal: React.FC<DrmChannelTesterModalProps> = ({
  isOpen,
  onClose,
  onPlayCustomChannel,
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'm3u'>('quick');

  // Quick form
  const [streamName, setStreamName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [drmKey, setDrmKey] = useState('');
  const [userAgent, setUserAgent] = useState('');

  // M3U paste form
  const [m3uText, setM3uText] = useState(
`#EXTINF:-1 tvg-id="HBO.vn" tvg-name="HBO HD" tvg-logo="https://i.pinimg.com/originals/8b/02/00/8b020050690f955ccb306cdf51324aea.png" group-title="HBO",HBO HD ClearKey
#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey
#KODIPROP:inputstream.adaptive.license_key=Cd3+PWOGPK+ut50FRrCYqw:PeDzjc8BSCff1b7Dh0PGog
#EXTVLCOPT:http-user-agent=Dalvik/2.1.0
https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/hbo.smil/manifest.mpd`
  );

  const [parsedPreview, setParsedPreview] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleQuickPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamUrl.trim()) return;

    const channel: Channel = {
      name: streamName.trim() || 'Kênh tùy chỉnh',
      logo: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60',
      group: '⭐ Kênh Tùy Chỉnh',
      url: streamUrl.trim(),
      drmKey: drmKey.trim() || undefined,
      licenseType: drmKey.trim() ? 'org.w3.clearkey' : undefined,
      userAgent: userAgent.trim() || undefined,
    };

    onPlayCustomChannel(channel);
    onClose();
  };

  const handleM3uPlay = () => {
    const parsed = parseM3uWithDrmAndUA(m3uText);
    if (parsed.length > 0) {
      onPlayCustomChannel(parsed[0]);
      onClose();
    }
  };

  const previewKeys = (keyStr: string) => {
    try {
      const map = parseClearkeyToHexMap(keyStr);
      setParsedPreview(map);
    } catch {
      setParsedPreview({});
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div
        className="bg-[#0c1427] border border-orange-500/30 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-950/80 via-[#0f1a30] to-[#0c1427] border-b border-orange-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Phát Kênh DRM ClearKey (.mpd / .m3u8)
              </h2>
              <p className="text-xs text-slate-400">
                Thử nghiệm luồng phát có mã hóa bản quyền ClearKey & User-Agent
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800 bg-[#090e1c]">
          <button
            onClick={() => setActiveTab('quick')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'quick'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Nhập nhanh (URL + Key + UA)
          </button>
          <button
            onClick={() => setActiveTab('m3u')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'm3u'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Dán M3U / #KODIPROP
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'quick' ? (
            <form onSubmit={handleQuickPlay} className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tên kênh</label>
                <input
                  type="text"
                  value={streamName}
                  onChange={(e) => setStreamName(e.target.value)}
                  placeholder="Ví dụ: HBO HD, Cinemax..."
                  className="w-full bg-[#070c18] border border-slate-700/80 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Đường dẫn luồng (.mpd hoặc .m3u8)
                </label>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://.../manifest.mpd"
                  required
                  className="w-full bg-[#070c18] border border-slate-700/80 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold">
                    ClearKey License Key (KID:KEY hoặc JSON)
                  </label>
                  <span className="text-[10px] text-amber-400">Hỗ trợ Hex, Base64 & JWK</span>
                </div>
                <input
                  type="text"
                  value={drmKey}
                  onChange={(e) => {
                    setDrmKey(e.target.value);
                    previewKeys(e.target.value);
                  }}
                  placeholder="Ví dụ: e39a06709a3c9e65...:128be38dcf014827... hoặc Cd3+PWOG...:PeDzjc8..."
                  className="w-full bg-[#070c18] border border-slate-700/80 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  User-Agent (Mặc định: Dalvik/2.1.0)
                </label>
                <input
                  type="text"
                  value={userAgent}
                  onChange={(e) => setUserAgent(e.target.value)}
                  placeholder="Dalvik/2.1.0"
                  className="w-full bg-[#070c18] border border-slate-700/80 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              {/* Sample Presets */}
              <div className="pt-2">
                <div className="text-[11px] text-slate-400 mb-1.5 font-semibold">Mẫu thử nhanh:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStreamName('HBO HD (Base64 Key)');
                      setStreamUrl('https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/hbo.smil/manifest.mpd');
                      setDrmKey('Cd3+PWOGPK+ut50FRrCYqw:PeDzjc8BSCff1b7Dh0PGog');
                      setUserAgent('Dalvik/2.1.0');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] transition-colors"
                  >
                    HBO HD (Base64)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStreamName('Cinemax HD (Hex Key)');
                      setStreamUrl('https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/max.smil/manifest.mpd');
                      setDrmKey('acb4c23471063327adc732e283c0847f:e9868f5f473d0fd8699ede48d531c2b0');
                      setUserAgent('Dalvik/2.1.0');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] transition-colors"
                  >
                    Cinemax HD (Hex)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStreamName('Cinema World (JSON Key)');
                      setStreamUrl('https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/cinemaworld.smil/manifest.mpd');
                      setDrmKey('{"keys":[{"kty":"oct","k":"s14Sp1pCpvkYRyOpD/QtnA","kid":"7nkVVk10OdCb01Vv/MyHpA"}]}');
                      setUserAgent('Dalvik/2.1.0');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] transition-colors"
                  >
                    Cinema World (JSON)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStreamName('Sự Kiện FPT PLAY (AutoKey Server)');
                      setStreamUrl('https://vips-livecdn.fptplay.net/live/media/EPL_HN_01_4K_H265/dash_h_drm/index.mpd');
                      setDrmKey('https://vmttv.dpdns.org/AutoKey/');
                      setUserAgent('Dalvik/2.1.0');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-orange-950/60 hover:bg-orange-900/80 text-orange-300 hover:text-orange-200 border border-orange-700/60 text-[11px] transition-colors"
                  >
                    FPT Play (AutoKey)
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Bắt đầu phát bằng Shaka Player
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <label className="block text-slate-300 font-semibold">
                Dán nội dung danh sách kênh M3U chứa thẻ DRM / Kodi / User-Agent:
              </label>
              <textarea
                value={m3uText}
                onChange={(e) => setM3uText(e.target.value)}
                rows={8}
                className="w-full bg-[#070c18] border border-slate-700/80 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px] leading-relaxed"
              />

              <button
                onClick={handleM3uPlay}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                Phân tích M3U và phát ngay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
