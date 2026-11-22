import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Mark } from '../layout/Mark';
import s from './Login.module.css';

/** صفحة تسجيل الدخول كما في لوحة Login.dc.html: نفس الشكل والنصوص وسلوك الحقول. */
export function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'تسجيل الدخول · مكتب المدينة';
  }, []);

  if (user === undefined) return null; // جارٍ التحقق من الجلسة
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const u = username.trim();
  const eyeLabel = show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!u || !password) {
      setTried(true);
      setError(
        !u && !password ? 'أدخل اسم المستخدم وكلمة المرور.' : !u ? 'أدخل اسم المستخدم.' : 'أدخل كلمة المرور.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(u, password, remember);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.');
      setBusy(false);
    }
  }

  return (
    <div className={s.lg} dir="rtl">
      <div className={s.band} aria-hidden="true" />
      <header className={s.top}>
        <span className={s.mark}>
          <Mark size={40} />
        </span>
        <div className={s.n}>مكتب المدينة للخدمات المالية</div>
        <div className={`${s.e} ${s.en}`}>Al-Madina Financial Services</div>
      </header>

      <form className={s.box} aria-label="تسجيل الدخول" onSubmit={submit} noValidate>
        <div>
          <h1>تسجيل الدخول</h1>
          <p className={s.sub}>أهلاً بك، أدخل بياناتك للمتابعة</p>
        </div>

        <label className={s.f}>
          اسم المستخدم
          <span className={s.inp}>
            <input
              type="text"
              className={tried && !u ? s.bad : undefined}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              placeholder="ahmad"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            <span className={s.ic}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" />
              </svg>
            </span>
          </span>
        </label>

        <div className={s.f}>
          <label htmlFor="pw">كلمة المرور</label>
          <div className={s.inp}>
            <input
              id="pw"
              type={show ? 'text' : 'password'}
              className={tried && !password ? `${s.pw} ${s.bad}` : s.pw}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <span className={s.ic}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <button type="button" className={s.eye} onClick={() => setShow(!show)} aria-label={eyeLabel} title={eyeLabel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {show ? <path d="M4 4l16 16" /> : null}
              </svg>
            </button>
          </div>
        </div>

        <div className={s.row}>
          <label className={s.chk}>
            <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
            تذكرني على هذا الجهاز
          </label>
          <button type="button" className={s.fg} onClick={() => setForgot(!forgot)}>
            نسيت كلمة المرور؟
          </button>
        </div>

        {forgot ? (
          <div className={s.hintbox}>لاستعادة كلمة المرور تواصل مع مدير النظام، وسيعيد تعيينها لك.</div>
        ) : null}

        {error ? (
          <div className={s.err} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5h.01" />
            </svg>
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className={s.btn} disabled={busy}>
          تسجيل الدخول
        </button>

        <div className={s.sec}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          </svg>
          نظام داخلي لموظفي المكتب فقط
        </div>
      </form>

      <footer className={s.foot}>
        مكتب المدينة للخدمات المالية · <span className={s.en}>© 2026</span>
      </footer>
    </div>
  );
}
