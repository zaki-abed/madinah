import { Outlet } from 'react-router-dom';
import { BalancesProvider } from '../balances';
import { Sidebar } from './Sidebar';

/** هيكل كل الشاشات بعد الدخول: القائمة الجانبية + محتوى الصفحة. */
export function AppShell() {
  return (
    <BalancesProvider>
      <div className="app" dir="rtl">
        <Sidebar />
        <Outlet />
      </div>
    </BalancesProvider>
  );
}
