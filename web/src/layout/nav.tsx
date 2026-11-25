import type { ReactNode } from 'react';

// عناصر القائمة الجانبية بترتيبها ونصوصها وأيقوناتها كما في لوحات التصميم (Main.dc.html، وقسم «الإدارة» من Team.dc.html).

export type NavItem =
  | { kind: 'link'; to: string; label: string; icon: ReactNode; tag?: string }
  | { kind: 'section'; label: string }
  | { kind: 'off'; label: string; tag: string };

export const navItems: NavItem[] = [
  { kind: 'link', to: '/', label: 'لوحة التحكم', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
  { kind: 'link', to: '/transfers', label: 'الحوالات', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13l-3-3M17 17H4l3 3"/></svg> },
  { kind: 'section', label: 'المكاتب والزبائن' },
  { kind: 'link', to: '/offices', label: 'المكاتب', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18"/></svg> },
  { kind: 'link', to: '/clients', label: 'الزبائن', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg> },
  { kind: 'link', to: '/debts', label: 'الديون', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg> },
  { kind: 'section', label: 'الحسابات' },
  { kind: 'link', to: '/accounts', label: 'الحسابات والخزائن', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6V4h12v2"/></svg> },
  { kind: 'link', to: '/banks', label: 'البنوك', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18"/></svg> },
  { kind: 'link', to: '/paypal', label: 'PayPal', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13l-3-3M17 17H4l3 3"/></svg> },
  { kind: 'link', to: '/egyptian-wallets', label: 'المحافظ المصرية', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"/></svg> },
  { kind: 'link', to: '/palestinian-wallets', label: 'المحافظ الفلسطينية', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14.5h.01"/></svg> },
  { kind: 'link', to: '/usdt-platforms', label: 'منصات USDT', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.5 9h7M12 9v7"/></svg> },
  { kind: 'link', to: '/cards', label: 'البطاقات والربط', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18v10H3zM3 11h18M7 15h3"/></svg> },
  { kind: 'link', to: '/cash-plus', label: 'Cash Plus', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h13l-3-3M17 17H4l3 3"/></svg> },
  { kind: 'section', label: 'الصناديق' },
  { kind: 'link', to: '/usdt-fund', label: 'صندوق USDT', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5"/></svg> },
  { kind: 'link', to: '/egp-fund', label: 'صندوق الجنيه', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M15.4 10.2A6 6 0 1 1 10.2 15.4"/></svg> },
  { kind: 'section', label: 'متابعة الحسابات' },
  { kind: 'link', to: '/limits', label: 'حدود الحسابات', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><path d="M4 20h16"/></svg> },
  { kind: 'link', to: '/issues', label: 'مشاكل الحسابات', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>, tag: 'قريباً' },
  { kind: 'section', label: 'الإدارة' },
  { kind: 'link', to: '/team', label: 'فريق العمل', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg> },
  { kind: 'section', label: 'قريباً' },
  { kind: 'off', label: 'المصاريف', tag: 'قريباً' },
  { kind: 'off', label: 'التقارير والجرد', tag: 'قريباً' },
];
