import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// حالة «إخفاء الأرصدة» من القائمة الجانبية. صفحات الأرصدة (من المرحلة الثانية) تقرؤها من هنا.

const STORAGE_KEY = 'madinah.hideBalances';

interface BalancesState {
  hidden: boolean;
  toggle(): void;
}

const BalancesContext = createContext<BalancesState | null>(null);

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function BalancesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // التخزين غير متاح: يبقى الاختيار لهذه الجلسة فقط.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <BalancesContext.Provider value={value}>{children}</BalancesContext.Provider>;
}

export function useBalances(): BalancesState {
  const context = useContext(BalancesContext);
  if (!context) throw new Error('useBalances خارج BalancesProvider');
  return context;
}
