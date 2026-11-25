import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useBalances } from '../balances';
import { Mark } from './Mark';
import { navItems } from './nav';

/** القائمة الجانبية كما في لوحة «لوحة التحكم» (Main.dc.html). */
export function Sidebar() {
  const { user, logout } = useAuth();
  const balances = useBalances();
  if (!user) return null;

  return (
    <nav className="side" aria-label="القائمة الرئيسية">
      <div className="brand">
        <Mark />
        <div className="brand-text">
          <span className="brand-name">مكتب المدينة</span>
          <span className="brand-sub">للخدمات المالية</span>
          <span className="en brand-en">Al-Madina Financial Services</span>
        </div>
      </div>

      {navItems.map((item) => {
        if (item.kind === 'section') {
          return (
            <div className="sec" key={`sec-${item.label}`}>
              {item.label}
            </div>
          );
        }
        if (item.kind === 'off') {
          return (
            <span className="nav off" key={`off-${item.label}`}>
              {item.label}
              <span className="tag">{item.tag}</span>
            </span>
          );
        }
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'nav on' : 'nav')}
          >
            {item.icon}
            {item.label}
            {item.tag ? <span className="tag">{item.tag}</span> : null}
          </NavLink>
        );
      })}

      <div className="side-foot">
        <button className="nav" type="button" onClick={balances.toggle} aria-pressed={balances.hidden}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {balances.hidden ? <path d="M4 4l16 16" /> : null}
          </svg>
          {balances.hidden ? 'إظهار الأرصدة' : 'إخفاء الأرصدة'}
        </button>
        <div className="side-user">
          <div className="side-avatar">{user.fullName.trim().charAt(0)}</div>
          <div className="side-user-text">
            <div className="side-user-name">{user.fullName}</div>
          </div>
          <button className="side-logout" type="button" onClick={() => void logout()} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
