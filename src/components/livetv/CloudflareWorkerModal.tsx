import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Terminal, ExternalLink, Globe } from 'lucide-react';

interface CloudflareWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudflareWorkerModal: React.FC<CloudflareWorkerModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'worker' | 'guide'>('worker');

  if (!isOpen) return null;

  const CLOUDFLARE_WORKER_CODE = `/**
 * Cloudflare Worker: Gấu TV DRM ClearKey & User-Agent (Dalvik/2.1.0) Reverse Proxy
 * - Tự động ghi đè User-Agent: Dalvik/2.1.0 cho các luồng MPD / HLS / M4S / TS
 * - Hỗ trợ CORS Headers toàn diện cho trình duyệt & Shaka Player
 * - Hỗ trợ Range Requests (HTTP 206 Partial Content) cho DASH segments
 * - Tự động rewrite URL trong playlist M3U8
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Xử lý preflight CORS OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range, User-Agent, X-Custom-UA, Authorization",
          "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    const customUA = url.searchParams.get("ua") || "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)";

    if (!targetUrl || !targetUrl.startsWith("http")) {
      return new Response("Missing or invalid target 'url' parameter. Example: /?url=https://domain.com/live.mpd&ua=Dalvik/2.1.0", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. Chuẩn bị Headers chuyển tiếp sang máy chủ gốc
    const forwardHeaders = new Headers();
    forwardHeaders.set("User-Agent", customUA);
    forwardHeaders.set("Accept", "*/*");
    forwardHeaders.set("Referer", targetUrl);

    // Chuyển tiếp Range Header (Rất quan trọng cho DASH / MP4 byte range chunks)
    const range = request.headers.get("Range");
    if (range) {
      forwardHeaders.set("Range", range);
    }

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        redirect: "follow",
      });

      // 3. Chuẩn bị Response Headers trả về client
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS");
      responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
      
      const contentType = upstreamResponse.headers.get("content-type") || "";

      // 4. Nếu là M3U8 Playlist, rewrite các đường link segment bên trong
      if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8")) {
        const text = await upstreamResponse.text();
        const base = new URL(targetUrl);
        const lines = text.split(/\\r?\\n/);
        
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            try {
              const absUrl = new URL(trimmed, base.href).href;
              return \`\${url.origin}/?url=\${encodeURIComponent(absUrl)}&ua=\${encodeURIComponent(customUA)}\`;
            } catch (e) {
              return line;
            }
          }
          return line;
        });

        return new Response(rewritten.join("\\n"), {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      }

      // 5. Trả về stream binary (.m4s, .mpd, .ts, .mp4, audio)
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });

    } catch (err) {
      return new Response("Upstream Fetch Error: " + err.message, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" },
      });
    }
  },
};`;

  const copyCode = () => {
    navigator.clipboard.writeText(CLOUDFLARE_WORKER_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div
        className="bg-[#0b1222] border border-orange-500/30 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-950/80 via-[#0f1a30] to-[#0b1222] border-b border-orange-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Cloudflare Worker Proxy (Dalvik/2.1.0 & ClearKey)
              </h2>
              <p className="text-xs text-slate-400">
                Giải pháp User-Agent & CORS chuẩn cho kênh DRM MPD trên toàn cầu
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
            onClick={() => setActiveTab('worker')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'worker'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Mã nguồn Cloudflare Worker
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Hướng dẫn cài đặt (30s)
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'worker' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300">
                  <Terminal className="w-3.5 h-3.5" /> worker.js (Ready to deploy)
                </span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Đã sao chép!' : 'Sao chép mã'}</span>
                </button>
              </div>

              <pre className="bg-[#050914] text-slate-200 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800/80 max-h-[400px]">
                {CLOUDFLARE_WORKER_CODE}
              </pre>
            </div>
          ) : (
            <div className="space-y-4 text-slate-300">
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3.5">
                <h4 className="font-bold text-amber-300 mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-orange-400" />
                  Tại sao cần Proxy cho User-Agent "Dalvik/2.1.0"?
                </h4>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Theo chuẩn bảo mật W3C của mọi trình duyệt (Chrome, Safari, Firefox), mã JavaScript trên trang web không được phép ghi đè tiêu đề <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">User-Agent</code> trực tiếp trong các yêu cầu tải luồng. Do đó, app sử dụng máy chủ nội bộ hoặc Cloudflare Worker làm trung gian để gửi User-Agent <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">Dalvik/2.1.0</code> đến đài truyền hình.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">Các bước tạo Cloudflare Worker miễn phí:</h4>
                <ol className="list-decimal list-inside space-y-2 pl-2 text-slate-300 leading-relaxed">
                  <li>
                    Đăng nhập vào <span className="text-orange-400 font-semibold">dash.cloudflare.com</span> &rarr; vào mục <strong>Workers & Pages</strong>.
                  </li>
                  <li>
                    Nhấn <strong>Create application</strong> &rarr; chọn <strong>Create Worker</strong> &rarr; đặt tên (ví dụ: <code className="text-amber-300 bg-slate-900 px-1">gautv-proxy</code>).
                  </li>
                  <li>
                    Nhấn <strong>Deploy</strong> &rarr; chọn <strong>Edit code</strong> &rarr; dán toàn bộ đoạn code ở tab <strong>Mã nguồn Cloudflare Worker</strong> vào file <code className="text-amber-300 bg-slate-900 px-1">worker.js</code>.
                  </li>
                  <li>
                    Nhấn <strong>Save and Deploy</strong>. Đường dẫn Worker của bạn sẽ có dạng:
                    <div className="mt-1 p-2 rounded bg-slate-950 font-mono text-[11px] text-emerald-400 border border-slate-800">
                      https://gautv-proxy.your-subdomain.workers.dev/?url=https://domain.com/live.mpd&ua=Dalvik/2.1.0
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#090e1c] border-t border-slate-800 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Máy chủ Gấu TV nội bộ đã tích hợp sẵn proxy tại <code className="text-orange-400">/api/tv/stream-proxy</code>.
          </p>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
