import React, { Component, ReactNode, ErrorInfo } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void 0;
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('qtb_logged_in_account_v1');
      localStorage.removeItem('qtb_current_active_profile_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  private handleSoftRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#070b16] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-red-950/80 border border-red-800 flex items-center justify-center text-red-400 mb-5 shadow-xl">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Đã có sự cố hiển thị giao diện
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Ứng dụng gặp lỗi tạm thời khi kết nối hoặc tải dữ liệu bộ nhớ đệm. Bạn có thể thử tải lại ngay hoặc đặt lại phiên làm việc.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={this.handleSoftRetry}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại giao diện</span>
            </button>
            <button
              onClick={this.handleReset}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Làm mới toàn bộ & Đăng nhập lại
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
