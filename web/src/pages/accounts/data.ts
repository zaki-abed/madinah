import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import type { AccountStatus, AccountType } from '../../accountTypes';

export interface Provider {
  id: string;
  name: string;
  type: AccountType;
  template: string;
  currencies: string[];
  isBuiltin: boolean;
}

export interface AccountCurrency {
  id: string;
  currency: string;
  initialBalance: string;
  balance: string;
  openingDate: string;
}

export interface Account {
  id: string;
  providerId: string;
  name: string;
  status: AccountStatus;
  /** تاريخ آخر تغيير للحالة (DD/MM/YYYY) إذا كان الحساب غير نشط. */
  statusSince: string | null;
  hasMovements: boolean;
  movementsCount: number;
  currencies: AccountCurrency[];
}

/** رصيد حقيقي بعملته الأصلية. */
export interface CurrencyPart {
  currency: string;
  balance: string;
}

/**
 * حقول خزنة PayPal الإضافية: مجموعها بالدولار تقريبي بأسعار من الإنترنت، للعرض فقط.
 * غير موجودة في باقي الخزائن.
 */
export interface ApproxFields {
  /** أمكن التحويل إلى الدولار (توجد أسعار محفوظة). */
  converted?: boolean;
  /** في الإجمالي تحويل فعلي، فيُعرض مع ≈. */
  approx?: boolean;
  /** تاريخ آخر تحديث للأسعار. */
  ratesAt?: string | null;
  /** الإجمالي الحقيقي لكل عملة بلا تحويل. */
  totals?: { currency: string; total: string }[];
}

export interface VaultSummary extends ApproxFields {
  key: string;
  currency: string;
  name: string;
  /** null في خزنة PayPal عندما لا توجد أسعار للتحويل. */
  total: string | null;
  count: number;
  top: { name: string; status: AccountStatus; balance: string | null; approx?: boolean; parts?: CurrencyPart[] }[];
}

export interface AccountsData {
  providers: Provider[];
  accounts: Account[];
  vaults: VaultSummary[];
}

/** يحمّل الحسابات والخزائن من الخادم، مع reload بعد كل تعديل. */
export function useAccounts() {
  const [data, setData] = useState<AccountsData | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setData(await api<AccountsData>('GET', '/api/accounts'));
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

export const errorMessage = (caught: unknown) =>
  caught instanceof ApiError ? caught.message : 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.';

/** «لا توجد حركات مالية / حركة مالية واحدة / حركتان ماليتان / 5 حركات مالية / 18 حركة مالية». */
export const movementsText = (n: number) =>
  n === 0 ? 'لا توجد حركات مالية'
  : n === 1 ? 'حركة مالية واحدة'
  : n === 2 ? 'حركتان ماليتان'
  : n <= 10 ? `${n} حركات مالية`
  : `${n} حركة مالية`;
