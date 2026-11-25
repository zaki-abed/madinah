import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './layout/AppShell';
import { navItems } from './layout/nav';
import { Accounts } from './pages/accounts/Accounts';
import { AddAccount } from './pages/add-account/AddAccount';
import { Vault } from './pages/accounts/Vault';
import { Login } from './pages/Login';
import { Providers } from './pages/providers/Providers';
import { Team } from './pages/team/Team';
import { Placeholder } from './pages/Placeholder';

/** يحمي الشاشات: بدون جلسة يحوّل إلى صفحة الدخول ويتذكر الصفحة المطلوبة. */
function Protected() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return null; // جارٍ التحقق من الجلسة
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/new" element={<AddAccount />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/team" element={<Team />} />
        <Route path="/vaults/:key" element={<Vault />} />
        <Route path="/internal-transfer" element={<Placeholder title="نقل داخلي" />} />
        {navItems.map((item) =>
          item.kind === 'link' && !['/accounts', '/team'].includes(item.to) ? (
            <Route key={item.to} path={item.to} element={<Placeholder title={item.label} />} />
          ) : null,
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
