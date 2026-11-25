import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import type { Pool } from './db.js';
import { TEMPLATES, linkedIds, type FormValues, type TemplateKey } from './shared/accountTemplates.js';

// صفحات الأنواع الخمس وكشف الحساب (لوحات BankAccounts / Wallets / PalWallets / CashPlus / CryptoAccounts).
// الكشف يُقرأ من دفتر القيود: الرصيد الجاري = الافتتاحي + القيود بالترتيب.

/** الصفحة ← الحسابات التي تعرضها. صفحة Cash Plus خاصة بجهة Cash Plus كما في لوحتها. */
const PAGES: Record<string, { type: string; provider?: string }> = {
  banks: { type: 'BANK' },
  'egyptian-wallets': { type: 'EG_WALLET' },
  'palestinian-wallets': { type: 'PS_WALLET' },
  'usdt-platforms': { type: 'USDT_PLATFORM' },
  'cash-plus': { type: 'PAYMENT_PLATFORM', provider: 'Cash Plus' },
};

const SOURCE_LABEL: Record<string, string> = {
  TRANSFER: 'حوالة',
  EXPENSE: 'مصروف',
  DEBT: 'دين',
  DEBT_PAYMENT: 'تسديد دين',
  CUSTOMER_ADJUSTMENT: 'تسوية',
};

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statementQuery = z.object({ from: dateText.optional(), to: dateText.optional() });

const fail = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } });

interface AccountRow {
  id: string;
  provider: string;
  template: TemplateKey;
  name: string;
  status: string;
  responsible: string | null;
  details: FormValues;
  currencies: { id: string; currency: string; balance: string }[];
  documents: { type: string; holder: string; expiry: string | null; note: string | null }[];
  notes: string[];
}

/** حقول «بيانات الحساب» بتسميات قالب الجهة، كما في معاينة نموذج الإضافة. */
function accountFields(row: AccountRow) {
  const template = TEMPLATES[row.template];
  const currencies = row.currencies.map((c) => c.currency);
  const linked = row.template === 'ip' ? linkedIds(row.details) : [];
  const fields: { label: string; value: string; en: boolean; copy: boolean }[] = [
    { label: 'الجهة', value: row.provider, en: /^[A-Za-z]/.test(row.provider), copy: false },
  ];
  for (const group of template.ident(row.details, currencies, linked)) {
    const prefix = group.title && /\d$/.test(group.title) ? `${group.title} · ` : '';
    for (const field of group.fields) {
      const raw = row.details[field.k];
      const value = Array.isArray(raw) ? raw.join('، ') : String(raw ?? '').trim();
      if (value) fields.push({ label: prefix + field.label, value, en: !!field.en, copy: !!field.copy });
    }
  }
  fields.push({ label: 'المسؤول عنه في المكتب', value: row.responsible ?? '—', en: false, copy: false });
  return fields;
}

export function registerAccountPages(app: FastifyInstance, pool: Pool): void {
  app.get<{ Params: { page: string } }>('/api/account-pages/:page', { preHandler: requireAuth }, async (request, reply) => {
    const page = PAGES[request.params.page];
    if (!page) return fail(reply, 404, 'NOT_FOUND', 'الصفحة غير موجودة.');
    const [accounts, totals] = await Promise.all([
      pool.query<AccountRow>(
        `SELECT a.id, p.name AS provider, p.template, a.name, a.status, u.full_name AS responsible, a.details,
                COALESCE((
                  SELECT json_agg(json_build_object('id', b.account_currency_id, 'currency', b.currency, 'balance', b.balance::text)
                                  ORDER BY b.account_currency_id)
                  FROM v_account_currency_balances b WHERE b.account_id = a.id
                ), '[]') AS currencies,
                COALESCE((
                  SELECT json_agg(json_build_object('type', d.doc_type, 'holder', d.holder_name,
                                                    'expiry', to_char(d.expiry_date, 'YYYY-MM-DD'), 'note', d.note)
                                  ORDER BY d.created_at, d.id)
                  FROM account_documents d WHERE d.account_id = a.id
                ), '[]') AS documents,
                COALESCE((SELECT json_agg(n.body ORDER BY n.created_at, n.id) FROM account_notes n WHERE n.account_id = a.id), '[]') AS notes
         FROM accounts a
         JOIN providers p ON p.id = a.provider_id
         LEFT JOIN users u ON u.id = a.responsible_id
         WHERE p.type = $1 AND ($2::text IS NULL OR p.name = $2)
         ORDER BY p.is_builtin DESC, p.created_at, p.name, a.created_at, a.id`,
        [page.type, page.provider ?? null],
      ),
      pool.query<{ currency: string; total: string }>(
        `SELECT b.currency, sum(b.balance)::numeric(18,4)::text AS total
         FROM v_account_currency_balances b
         JOIN accounts a ON a.id = b.account_id JOIN providers p ON p.id = a.provider_id
         WHERE p.type = $1 AND ($2::text IS NULL OR p.name = $2)
         GROUP BY b.currency ORDER BY b.currency`,
        [page.type, page.provider ?? null],
      ),
    ]);
    return {
      accounts: accounts.rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        name: row.name,
        status: row.status,
        fields: accountFields(row),
        currencies: row.currencies,
        documents: row.documents,
        notes: row.notes,
      })),
      totals: totals.rows,
    };
  });

  // كشف عملة حساب: رصيد أول الفترة، الحركات برصيدها الجاري، والإجماليات.
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/api/account-currencies/:id/statement',
    { preHandler: requireAuth },
    async (request, reply) => {
      const query = statementQuery.safeParse(request.query ?? {});
      if (!query.success || !z.string().uuid().safeParse(request.params.id).success) {
        return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
      }
      const { from = null, to = null } = query.data;
      const head = await pool.query<{ currency: string; initial: string; opening_date: string; today: string }>(
        `SELECT currency, initial_balance::text AS initial, to_char(opening_date, 'YYYY-MM-DD') AS opening_date,
                to_char((now() AT TIME ZONE 'Asia/Jerusalem')::date, 'YYYY-MM-DD') AS today
         FROM account_currencies WHERE id = $1`,
        [request.params.id],
      );
      const account = head.rows[0];
      if (!account) return fail(reply, 404, 'NOT_FOUND', 'الحساب غير موجود.');

      const result = await pool.query<{
        id: string; date: string; amount: string; balance: string; description: string | null; source_type: string;
        opening: string; debit: string; credit: string;
      }>(
        `WITH entries AS (
           SELECT l.id, (l.entry_at AT TIME ZONE 'Asia/Jerusalem')::date AS d, l.amount, l.description, l.source_type,
                  ac.initial_balance + sum(l.amount) OVER (ORDER BY l.entry_at, l.id) AS balance
           FROM ledger_entries l JOIN account_currencies ac ON ac.id = l.account_currency_id
           WHERE ac.id = $1
         ),
         opening AS (
           SELECT (SELECT initial_balance FROM account_currencies WHERE id = $1)
                  + COALESCE((SELECT sum(amount) FROM entries WHERE $2::date IS NOT NULL AND d < $2::date), 0) AS balance
         ),
         shown AS (
           SELECT * FROM entries
           WHERE ($2::date IS NULL OR d >= $2::date) AND ($3::date IS NULL OR d <= $3::date)
         )
         SELECT s.id, to_char(s.d, 'YYYY-MM-DD') AS date, s.amount::text AS amount, s.balance::numeric(18,4)::text AS balance,
                s.description, s.source_type::text AS source_type,
                o.balance::numeric(18,4)::text AS opening,
                COALESCE(sum(-s.amount) FILTER (WHERE s.amount < 0) OVER (), 0)::numeric(18,4)::text AS debit,
                COALESCE(sum(s.amount) FILTER (WHERE s.amount > 0) OVER (), 0)::numeric(18,4)::text AS credit
         FROM opening o LEFT JOIN shown s ON true
         ORDER BY s.d, s.id`,
        [request.params.id, from, to],
      );
      const first = result.rows[0]!;
      const rows = result.rows.filter((row) => row.id !== null);
      const last = rows[rows.length - 1];
      return {
        currency: account.currency,
        opening: { date: from ?? account.opening_date, balance: first.opening },
        rows: rows.map((row) => ({
          id: row.id,
          date: row.date,
          title: row.description ?? SOURCE_LABEL[row.source_type] ?? row.source_type,
          kind: SOURCE_LABEL[row.source_type] ?? row.source_type,
          amount: row.amount,
          balance: row.balance,
        })),
        totals: { debit: first.debit, credit: first.credit, count: rows.length },
        closing: { date: to ?? account.today, balance: last ? last.balance : first.opening },
      };
    },
  );
}
