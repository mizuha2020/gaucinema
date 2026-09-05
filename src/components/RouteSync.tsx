import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { setAppNavigator } from '../routerNav';
import { parseLocation, routesEqual, type ParsedRoute } from '../routes';

interface RouteSyncProps {
  /** Route mà state App hiện tại hàm ý (App tính, memo). */
  expected: ParsedRoute;
  /** Áp dụng URL -> state khi lệch (back/forward/truy cập trực tiếp). */
  onRoute: (route: ParsedRoute) => void;
  /** Chỉ đồng bộ ở app cinema; manga/livetv giữ stack riêng. */
  activeApp: string;
}

/**
 * Cầu nối URL <-> state (hội tụ, không cờ):
 * - In-app: handler vừa set state vừa navigate -> URL khớp expected -> noop.
 * - Back/forward/direct: chỉ URL đổi -> lệch expected -> onRoute áp state.
 */
export const RouteSync: React.FC<RouteSyncProps> = ({ expected, onRoute, activeApp }) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setAppNavigator(navigate);
    return () => setAppNavigator(null);
  }, [navigate]);

  const key = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (activeApp !== 'cinema') return;
    const actual = parseLocation(location.pathname, location.search);
    if (actual.kind === 'unknown' || !routesEqual(actual, expected)) {
      onRoute(actual);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activeApp]);

  return null;
};
