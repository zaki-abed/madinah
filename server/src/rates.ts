import type { Pool } from './db.js';

// أسعار التحويل: للعرض والعلم فقط (CLAUDE.md، القاعدة 14).
// لا تُستعمل في أي حساب مالي أو رصيد أو قيد. تُجلب مرة يومياً وتُحفظ في exchange_rates.

export interface FetchedRates {
  /** تاريخ السعر كما أعلنه المصدر: YYYY-MM-DD. */
  date: string;
  /** كم وحدة من كل عملة تساوي دولاراً واحداً، نصاً كما وردت. */
  perUsd: Record<string, string>;
  source: string;
}

export type RatesFetcher = () => Promise<FetchedRates>;

const SOURCE_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

/** Frankfurter: أسعار البنك المركزي الأوروبي المرجعية. بلا مفتاح، والطلب لا يحمل أي بيانات من النظام. */
export const fetchFromFrankfurter: RatesFetcher = async () => {
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`مصدر الأسعار ردّ بالحالة ${response.status}`);
  const body = (await response.json()) as { base?: unknown; date?: unknown; rates?: unknown };
  if (body.base !== 'USD' || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new Error('رد مصدر الأسعار بصيغة غير متوقعة.');
  }
  if (typeof body.rates !== 'object' || body.rates === null) {
    throw new Error('رد مصدر الأسعار بلا أسعار.');
  }
  const perUsd: Record<string, string> = {};
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) perUsd[code] = String(value);
  }
  return { date: body.date, perUsd, source: 'frankfurter.dev (ECB)' };
};

export type RefreshResult = 'fresh' | 'updated' | 'failed';

/**
 * يجلب الأسعار إذا لم تُجلب اليوم (بتوقيت القدس) ويحفظها لعملات النظام فقط.
 * عند الفشل لا يتغير شيء: تبقى آخر أسعار محفوظة مستعملة.
 */
export async function refreshRatesIfStale(
  pool: Pool,
  fetcher: RatesFetcher = fetchFromFrankfurter,
  log: (message: string) => void = () => undefined,
): Promise<RefreshResult> {
  const fresh = await pool.query(
    `SELECT 1 FROM exchange_rates
     WHERE (fetched_at AT TIME ZONE 'Asia/Jerusalem')::date = (now() AT TIME ZONE 'Asia/Jerusalem')::date
     LIMIT 1`,
  );
  if (fresh.rowCount) return 'fresh';

  try {
    const fetched = await fetcher();
    const known = await pool.query<{ code: string }>("SELECT code FROM currencies WHERE code <> 'USD'");
    let saved = 0;
    for (const { code } of known.rows) {
      const perUsd = fetched.perUsd[code];
      if (!perUsd || !/^\d+(\.\d+)?$/.test(perUsd)) continue;
      // سعر الوحدة بالدولار = 1 ÷ (عدد الوحدات لكل دولار)، بحساب numeric داخل القاعدة.
      await pool.query(
        `INSERT INTO exchange_rates (currency, rate_date, usd_rate, source)
         VALUES ($1, $2, round(1 / $3::numeric, 8), $4)
         ON CONFLICT (currency, rate_date)
         DO UPDATE SET usd_rate = EXCLUDED.usd_rate, source = EXCLUDED.source, fetched_at = now()`,
        [code, fetched.date, perUsd, fetched.source],
      );
      saved += 1;
    }
    if (saved === 0) throw new Error('لا توجد أسعار لعملات النظام في رد المصدر.');
    log(`أسعار التحويل: حُفظت ${saved} عملة بتاريخ ${fetched.date}.`);
    return 'updated';
  } catch (error) {
    log(`أسعار التحويل: فشل الجلب، وتبقى آخر أسعار محفوظة. (${(error as Error).message})`);
    return 'failed';
  }
}

/** يشغّل الجلب عند بدء الخادم ثم كل ثلاث ساعات. الجلب الفعلي مرة واحدة يومياً. */
export function scheduleRatesRefresh(pool: Pool, log: (message: string) => void): () => void {
  const run = () => void refreshRatesIfStale(pool, fetchFromFrankfurter, log).catch(() => undefined);
  run();
  const timer = setInterval(run, 3 * 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
