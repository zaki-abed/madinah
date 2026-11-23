import type { Pool } from './db.js';
import { sharePercent, sumAmounts } from './money.js';

// خزنة PayPal (CLAUDE.md، القاعدتان 13 و14):
// تجمع كل حسابات PayPal بكل عملاتها. كل حساب بسطر واحد: مجموع عملاته محوّلاً إلى الدولار.
// التحويل للعرض فقط بأسعار تقريبية محفوظة، ولا يُكتب في القاعدة ولا يدخل في أي رصيد أو قيد.

export interface PaypalVaultAccount {
  accountId: string;
  provider: string;
  name: string;
  type: 'PAYPAL';
  status: string;
  responsible: string | null;
  /** الأرصدة الحقيقية بعملاتها الأصلية. */
  parts: { currency: string; balance: string }[];
  /** مجموع الحساب بالدولار. null إذا لم توجد أسعار كافية للتحويل. */
  usd: string | null;
  /** في المجموع تحويل فعلي من عملة غير الدولار. */
  approx: boolean;
  share: number;
  lastAmount: string | null;
  lastCurrency: string | null;
  lastAt: string | null;
}

export interface PaypalVault {
  /** توجد أسعار لكل العملات غير الدولارية ذات الرصيد، فأمكن التحويل. */
  converted: boolean;
  /** الإجمالي يتضمن تحويلاً فعلياً، فيُعرض مع ≈. */
  approx: boolean;
  /** الإجمالي بالدولار، أو null بدون أسعار. */
  total: string | null;
  /** تاريخ آخر تحديث للأسعار المستعملة: DD/MM/YYYY. */
  ratesAt: string | null;
  /** الإجمالي الحقيقي لكل عملة، بلا تحويل. */
  totals: { currency: string; total: string }[];
  accounts: PaypalVaultAccount[];
}

const LATEST_RATES = `
  SELECT DISTINCT ON (currency) currency, usd_rate, fetched_at
  FROM exchange_rates ORDER BY currency, rate_date DESC`;

export async function loadPaypalVault(pool: Pool): Promise<PaypalVault> {
  const [accounts, totals, ratesAt] = await Promise.all([
    pool.query<Omit<PaypalVaultAccount, 'share'> & { convertible: boolean }>(
      `WITH rates AS (${LATEST_RATES}),
       rows AS (
         SELECT b.account_id, b.account_currency_id, b.currency, b.balance,
                CASE WHEN b.currency = 'USD' THEN b.balance
                     WHEN b.balance = 0 THEN 0
                     ELSE b.balance * r.usd_rate END AS usd,
                (b.currency <> 'USD' AND b.balance <> 0) AS is_converted
         FROM v_account_currency_balances b
         LEFT JOIN rates r ON r.currency = b.currency
         WHERE b.vault_key = 'PAYPAL'
       ),
       per AS (
         SELECT account_id, bool_and(usd IS NOT NULL) AS convertible, round(sum(usd), 2) AS usd,
                bool_or(is_converted) AS approx,
                json_agg(json_build_object('currency', currency, 'balance', balance::text)
                         ORDER BY account_currency_id) AS parts
         FROM rows GROUP BY account_id
       )
       SELECT a.id AS "accountId", p.name AS provider, a.name, p.type, a.status, s.name AS responsible,
              per.parts, per.convertible, per.usd::numeric(18,4)::text AS usd, per.approx,
              last.amount::text AS "lastAmount", last.currency AS "lastCurrency",
              to_char(last.entry_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') AS "lastAt"
       FROM per
       JOIN accounts a ON a.id = per.account_id
       JOIN providers p ON p.id = a.provider_id
       LEFT JOIN staff_members s ON s.id = a.responsible_id
       LEFT JOIN LATERAL (
         SELECT l.amount, l.currency, l.entry_at
         FROM ledger_entries l JOIN account_currencies ac ON ac.id = l.account_currency_id
         WHERE ac.account_id = a.id ORDER BY l.entry_at DESC, l.id DESC LIMIT 1
       ) last ON true
       ORDER BY per.usd DESC NULLS LAST, a.name, a.id`,
    ),
    pool.query<{ currency: string; total: string }>(
      `SELECT currency, sum(balance)::numeric(18,4)::text AS total
       FROM v_account_currency_balances WHERE vault_key = 'PAYPAL'
       GROUP BY currency ORDER BY (currency <> 'USD'), currency`,
    ),
    pool.query<{ at: string | null }>(
      `WITH rates AS (${LATEST_RATES})
       SELECT to_char(max(r.fetched_at) AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY') AS at
       FROM rates r
       WHERE r.currency IN (
         SELECT currency FROM v_account_currency_balances
         WHERE vault_key = 'PAYPAL' AND currency <> 'USD' AND balance <> 0
       )`,
    ),
  ]);

  const converted = accounts.rows.every((row) => row.convertible);
  const total = converted ? sumAmounts(accounts.rows.map((row) => row.usd ?? '0')) : null;
  const approx = converted && accounts.rows.some((row) => row.approx);

  return {
    converted,
    approx,
    total,
    ratesAt: approx ? (ratesAt.rows[0]?.at ?? null) : null,
    totals: totals.rows,
    accounts: accounts.rows.map(({ convertible: _convertible, ...row }) => ({
      ...row,
      usd: converted ? row.usd : null,
      approx: converted && row.approx,
      share: converted && total && row.usd ? sharePercent(row.usd, total) : 0,
    })),
  };
}
