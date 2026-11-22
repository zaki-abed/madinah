import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './layout/AppShell';
import { navItems } from './layout/nav';
import { Login } from './pages/Login';
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
        {navItems.map((item) =>
          item.kind === 'link' ? (
            <Route key={item.to} path={item.to} element={<Placeholder title={item.label} />} />
          ) : null,
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
