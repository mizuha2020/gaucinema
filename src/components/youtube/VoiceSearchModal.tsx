import React, { useState, useEffect } from 'react';
import { Mic, X, Loader2, Sparkles } from 'lucide-react';

interface VoiceSearchModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSearchSubmit?: (transcript: string) => void;
  onSearchResult?: (transcript: string) => void;
}

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  isOpen = true,
  onClose,
  onSearchSubmit,
  onSearchResult,
}) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleTriggerSearch = (text: string) => {
    if (onSearchSubmit) onSearchSubmit(text);
    if (onSearchResult) onSearchResult(text);
  };

  useEffect(() => {
    if (!isOpen) {
      setListening(false);
      setTranscript('');
      setErrorMsg('');
      return;
    }

    setListening(true);
    setTranscript('');
    setErrorMsg('');

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          const current = event.resultIndex;
          const text = event.results[current][0].transcript;
          setTranscript(text);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorMsg('Chưa cấp quyền micrô. Vui lòng bật mic trong cài đặt trình duyệt.');
          } else {
            setErrorMsg('Hãy thử nói lại câu từ tìm kiếm...');
          }
          setListening(false);
        };

        recognition.onend = () => {
          setListening(false);
        };

        recognition.start();

        return () => {
          try {
            recognition.stop();
          } catch {}
        };
      } catch {}
    }

    const timer = setTimeout(() => {
      if (!transcript) {
        setTranscript('Nhạc trẻ vpop mới nhất');
      }
      setListening(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#272727] border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl space-y-6 text-white relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1 pt-2">
          <h3 className="text-lg font-bold text-white flex items-center justify-center gap-1.5">
            <span>Tìm kiếm bằng giọng nói</span>
            <Sparkles className="w-4 h-4 text-red-500" />
          </h3>
          <p className="text-xs text-[#AAAAAA]">Nói từ khóa hoặc tên bài hát, kênh YouTube...</p>
        </div>

        {/* Big Mic Button with Pulse Ripple Effect */}
        <div className="relative py-4 flex items-center justify-center">
          {listening && (
            <div className="absolute w-28 h-28 rounded-full bg-red-600/20 animate-ping" />
          )}
          <button
            onClick={() => {
              if (transcript) {
                handleTriggerSearch(transcript);
                onClose();
              }
            }}
            className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              listening
                ? 'bg-red-600 text-white shadow-2xl shadow-red-600/80 scale-110'
                : 'bg-[#3F3F3F] text-slate-200 hover:bg-red-600 hover:text-white'
            }`}
          >
            <Mic className="w-10 h-10" />
          </button>
        </div>

        {/* Speech Feedback Text */}
        <div className="min-h-[3rem] flex flex-col items-center justify-center">
          {listening ? (
            <div className="flex items-center gap-2 text-xs text-red-400 font-semibold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span>Đang lắng nghe giọng nói của bạn...</span>
            </div>
          ) : transcript ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-white bg-[#121212] px-4 py-2 rounded-2xl border border-white/10">
                &ldquo;{transcript}&rdquo;
              </p>
              <button
                onClick={() => {
                  handleTriggerSearch(transcript);
                  onClose();
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-full text-xs font-bold transition-all shadow-lg shadow-red-600/30 cursor-pointer"
              >
                Tìm kiếm ngay
              </button>
            </div>
          ) : errorMsg ? (
            <p className="text-xs text-red-400">{errorMsg}</p>
          ) : (
            <p className="text-xs text-[#AAAAAA]">Nhấn micrô để nói lại</p>
          )}
        </div>
      </div>
    </div>
  );
};
