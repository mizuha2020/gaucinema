import type { NavigateFunction, NavigateOptions, To } from 'react-router';

/**
 * Navigator dùng chung cho các handler trong App (vốn nằm ngoài <Routes>).
 * RouteSync sẽ đăng ký navigate thật khi mount; trước đó rớt về pushState cùng URL
 * để không vỡ logic back-button cũ.
 */
let appNav: NavigateFunction | null = null;

export function setAppNavigator(nav: NavigateFunction | null) {
  appNav = nav;
}

export function appNavigate(to: To, opts?: NavigateOptions) {
  if (appNav) {
    appNav(to, opts);
    return;
  }
  if (typeof window !== 'undefined' && typeof to === 'string') {
    window.history.pushState({}, '', to);
  }
}
