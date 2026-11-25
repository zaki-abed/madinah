import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { withTransaction, type Pool, type PoolClient } from './db.js';
import { formatAmount, parseAmount } from './money.js';
import { loadPaypalVault } from './paypal-vault.js';
import {
  DOC_TYPES,
  TEMPLATES,
  sectionLevel,
  validateIdentity,
  type FormValues,
  type Issue,
  type TemplateKey,
} from './shared/accountTemplates.js';

// الحسابات والخزائن (لوحة Accounts.dc.html). النصوص ورسائل الخطأ من اللوحة.

type AccountType =
  | 'BANK' | 'PAYPAL' | 'PAYMENT_PLATFORM' | 'EG_WALLET' | 'PS_WALLET' | 'USDT_PLATFORM' | 'CARD_APP';
type AccountStatus = 'ACTIVE' | 'RESTRICTED' | 'FROZEN' | 'CLOSED';

const STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: 'نشط',
  RESTRICTED: 'مقيّد',
  FROZEN: 'مجمّد',
  CLOSED: 'مغلق',
};

/** أقسام الصفحة. PayPal نوع مستقل في القاعدة ويظهر تحت «منصات الدفع والتحويل». */
const SECTION_LABEL: Record<AccountType, string> = {
  BANK: 'البنوك',
  PAYPAL: 'منصات الدفع والتحويل',
  PAYMENT_PLATFORM: 'منصات الدفع والتحويل',
  CARD_APP: 'تطبيقات البطاقات',
  USDT_PLATFORM: 'منصات USDT',
  EG_WALLET: 'المحافظ المصرية',
  PS_WALLET: 'المحافظ الفلسطينية',
};

/** قالب حقول الجهة الجديدة حسب نوعها (نفس provider_type_template في القاعدة). PayPal جهة ثابتة ولا تُضاف. */
const NEW_PROVIDER_TEMPLATE: Record<Exclude<AccountType, 'PAYPAL'>, string> = {
  BANK: 'bank',
  PAYMENT_PLATFORM: 'emi',
  CARD_APP: 'cardapp',
  USDT_PLATFORM: 'crypto',
  EG_WALLET: 'vf',
  PS_WALLET: 'plw',
};

/** عملات كل نوع بترتيب العرض (نفس provider_type_currencies في القاعدة، وهي التي تفرض القاعدة). */
const TYPE_CURRENCIES: Record<AccountType, string[]> = {
  BANK: ['ILS', 'USD', 'JOD', 'EUR'],
  PAYMENT_PLATFORM: ['USD', 'EUR', 'ILS', 'JOD'],
  PAYPAL: ['USD', 'EUR', 'ILS', 'JOD'],
  USDT_PLATFORM: ['USDT'],
  EG_WALLET: ['EGP'],
  PS_WALLET: ['ILS', 'USD'],
  CARD_APP: [],
};

/** يرتّب العملات المختارة بترتيب نوعها، ويرفض ما ليس من عملاته. */
function orderCurrencies(type: AccountType, chosen: string[]): string[] {
  const allowed = TYPE_CURRENCIES[type];
  if (chosen.some((c) => !allowed.includes(c))) throw new InputError('عملة غير مسموحة لهذا النوع من الجهات.');
  return allowed.filter((c) => chosen.includes(c));
}

const VAULT_ORDER = ['USD', 'PAYPAL', 'ILS', 'JOD', 'EGP', 'EUR', 'USDT'];
const VAULT_NAME: Record<string, string> = {
  USD: 'خزنة الدولار',
  PAYPAL: 'خزنة PayPal',
  ILS: 'خزنة الشيكل',
  JOD: 'خزنة الدينار',
  EGP: 'خزنة الجنيه',
  EUR: 'خزنة اليورو',
  USDT: 'خزنة USDT',
};

class InputError extends Error {}

/** نواقص تمنع الحفظ، بنفس قائمة «قبل الحفظ» في النموذج. */
class IncompleteError extends Error {
  constructor(
    message: string,
    readonly issues: Issue[],
  ) {
    super(message);
  }
}

const uuid = z.string().uuid();
const providerChoice = {
  providerId: uuid.optional(),
  newProvider: z
    .object({
      name: z.string().trim().max(80),
      type: z.enum(['BANK', 'PAYMENT_PLATFORM', 'CARD_APP', 'USDT_PLATFORM', 'EG_WALLET', 'PS_WALLET']),
    })
    .optional(),
};
const currencyInput = z.object({
  currency: z.string().regex(/^[A-Z]{3,5}$/),
  initialBalance: z.union([z.string().max(40), z.number()]).optional(),
});
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
const createBody = z.object({
  providerId: uuid,
  name: text(80).default(''),
  responsibleId: uuid.nullish(),
  status: z.enum(['ACTIVE', 'RESTRICTED', 'FROZEN', 'CLOSED']).default('ACTIVE'),
  details: z.record(z.string().max(40), z.union([z.string().max(200), z.array(z.string().max(40)).max(10)])).default({}),
  currencies: z
    .array(currencyInput.extend({ openingDate: dateText.nullish() }))
    .max(10)
    .default([]),
  documents: z
    .array(z.object({ type: text(40).default(''), holder: text(80).default(''), expiry: dateText.nullish(), note: text(300).nullish() }))
    .max(30)
    .default([]),
  note: text(2000).nullish(),
});
const providerBody = z.object({
  name: text(80).default(''),
  type: z.enum(['BANK', 'PAYMENT_PLATFORM', 'CARD_APP', 'USDT_PLATFORM', 'EG_WALLET', 'PS_WALLET']),
  currencies: z.array(z.string().regex(/^[A-Z]{3,5}$/)).max(10).default([]),
});
const activeBody = z.object({ active: z.boolean() });
const checkBody = z.object({
  identifiers: z.array(z.string().max(200)).max(40).default([]),
  documents: z.array(z.object({ type: text(40), holder: text(80) })).max(30).default([]),
});
const updateBody = z.object({
  ...providerChoice,
  name: z.string().trim().max(80).default(''),
  addCurrencies: z.array(currencyInput).max(10).default([]),
});
const statusBody = z.object({ status: z.enum(['ACTIVE', 'RESTRICTED', 'FROZEN', 'CLOSED']) });

interface ProviderRow {
  id: string;
  name: string;
  type: AccountType;
  currencies: string[];
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

/** يحدد الجهة: موجودة بمعرّفها، أو جديدة تُنشأ بقالب نوعها. */
async function resolveProvider(
  client: PoolClient,
  choice: { providerId?: string; newProvider?: { name: string; type: Exclude<AccountType, 'PAYPAL'> } },
): Promise<ProviderRow> {
  if (choice.newProvider) {
    const { name, type } = choice.newProvider;
    if (!name) throw new InputError('اكتب اسم البنك أو المنصة.');
    const existing = await client.query('SELECT 1 FROM providers WHERE lower(name) = lower($1)', [name]);
    if (existing.rowCount) throw new InputError(`توجد جهة باسم «${name}». تُختار من القائمة.`);
    const created = await client.query<ProviderRow>(
      `INSERT INTO providers (name, type, template, currencies) VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, currencies`,
      [name, type, NEW_PROVIDER_TEMPLATE[type], TYPE_CURRENCIES[type]],
    );
    return created.rows[0]!;
  }
  if (!choice.providerId) throw new InputError('اكتب اسم البنك أو المنصة.');
  const found = await client.query<ProviderRow>(
    'SELECT id, name, type, currencies FROM providers WHERE id = $1',
    [choice.providerId],
  );
  if (!found.rows[0]) throw new InputError('الجهة المختارة غير موجودة.');
  return found.rows[0];
}

async function findDuplicate(client: PoolClient, providerId: string, name: string, exceptId: string | null) {
  const result = await client.query<{ status: AccountStatus }>(
    'SELECT status FROM accounts WHERE provider_id = $1 AND name = $2 AND id IS DISTINCT FROM $3',
    [providerId, name, exceptId],
  );
  return result.rows[0] ?? null;
}

function readCurrencies(
  inputs: { currency: string; initialBalance?: string | number }[],
  provider: ProviderRow,
): { currency: string; initialBalance: string }[] {
  const seen = new Set<string>();
  return inputs.map((input) => {
    if (seen.has(input.currency)) throw new InputError(`العملة ${input.currency} مكررة.`);
    seen.add(input.currency);
    if (!provider.currencies.includes(input.currency)) {
      throw new InputError(`العملة ${input.currency} غير متاحة لحسابات ${provider.name}.`);
    }
    const amount = parseAmount(input.initialBalance);
    if (amount === null) throw new InputError(`الرصيد الافتتاحي ${input.currency} غير صالح.`);
    return { currency: input.currency, initialBalance: amount };
  });
}

async function insertCurrencies(
  client: PoolClient,
  accountId: string,
  currencies: { currency: string; initialBalance: string }[],
): Promise<void> {
  for (const item of currencies) {
    await client.query(
      'INSERT INTO account_currencies (account_id, currency, initial_balance) VALUES ($1, $2, $3)',
      [accountId, item.currency, item.initialBalance],
    );
  }
}

export function registerAccounts(app: FastifyInstance, pool: Pool): void {

  /** أخطاء الإدخال برسالتها، والباقي يذهب لمعالج الأخطاء العام. */
  async function guarded<T>(reply: FastifyReply, work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof IncompleteError) {
        await reply.code(400).send({ error: { code: 'INCOMPLETE', message: error.message, issues: error.issues } });
        return undefined;
      }
      if (error instanceof InputError) {
        await fail(reply, 400, 'INVALID_INPUT', error.message);
        return undefined;
      }
      throw error;
    }
  }

  // ───────────── القائمة: الجهات والحسابات وأرصدتها والخزائن ─────────────
  app.get('/api/accounts', { preHandler: requireAuth }, async () => {
    const [providers, accounts, vaults, currencies, paypal] = await Promise.all([
      pool.query(
        `SELECT id, name, type, template, currencies, is_builtin AS "isBuiltin", is_active AS "isActive"
         FROM providers ORDER BY is_builtin DESC, created_at, name`,
      ),
      pool.query(
        `SELECT a.id, a.provider_id AS "providerId", a.name, a.status,
                CASE WHEN a.status <> 'ACTIVE' THEN (
                  SELECT to_char(h.changed_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY')
                  FROM account_status_history h WHERE h.account_id = a.id ORDER BY h.id DESC LIMIT 1
                ) END AS "statusSince",
                account_has_movements(a.id) AS "hasMovements",
                (SELECT count(DISTINCT (l.source_type, l.source_id))::int
                 FROM ledger_entries l JOIN account_currencies ac ON ac.id = l.account_currency_id
                 WHERE ac.account_id = a.id) AS "movementsCount",
                COALESCE((
                  SELECT json_agg(json_build_object(
                           'id', b.account_currency_id, 'currency', b.currency,
                           'initialBalance', b.initial_balance::text, 'balance', b.balance::text,
                           'openingDate', to_char(b.opening_date, 'YYYY-MM-DD'))
                         ORDER BY ac.id)
                  FROM v_account_currency_balances b
                  JOIN account_currencies ac ON ac.id = b.account_currency_id
                  WHERE b.account_id = a.id
                ), '[]') AS currencies
         FROM accounts a
         ORDER BY a.created_at, a.id`,
      ),
      pool.query<{ key: string; currency: string; total: string; count: number; top: unknown }>(
        `WITH rows AS (
           SELECT b.vault_key, b.currency, b.balance, a.status,
                  p.name || ' – ' || a.name AS label
           FROM v_account_currency_balances b
           JOIN accounts a ON a.id = b.account_id
           JOIN providers p ON p.id = a.provider_id
         ), ranked AS (
           SELECT *, row_number() OVER (PARTITION BY vault_key ORDER BY balance DESC, label) AS rank FROM rows
         )
         SELECT vault_key AS key, min(currency) AS currency, sum(balance)::numeric(18,4)::text AS total,
                count(*)::int AS count,
                json_agg(json_build_object('name', label, 'status', status, 'balance', balance::text)
                         ORDER BY rank) FILTER (WHERE rank <= 4) AS top
         FROM ranked WHERE vault_key <> 'PAYPAL' GROUP BY vault_key`,
      ),
      pool.query('SELECT code, name_ar AS "nameAr" FROM currencies WHERE allows_accounts ORDER BY code'),
      loadPaypalVault(pool),
    ]);
    // خزنة PayPal: سطر لكل حساب بمجموعه التقريبي بالدولار (أو بعملاته كما هي إن لم توجد أسعار).
    const paypalSummary = paypal.accounts.length
      ? [{
          key: 'PAYPAL',
          currency: 'USD',
          total: paypal.total,
          count: paypal.accounts.length,
          converted: paypal.converted,
          approx: paypal.approx,
          ratesAt: paypal.ratesAt,
          totals: paypal.totals,
          top: paypal.accounts.slice(0, 4).map((a) => ({
            name: `${a.provider} – ${a.name}`,
            status: a.status,
            balance: a.usd,
            approx: a.approx,
            parts: a.parts,
          })),
        }]
      : [];
    const orderedVaults = [...vaults.rows, ...paypalSummary]
      .map((v) => ({ ...v, name: VAULT_NAME[v.key] ?? `خزنة ${v.key}` }))
      .sort((x, y) => VAULT_ORDER.indexOf(x.key) - VAULT_ORDER.indexOf(y.key));
    return { providers: providers.rows, accounts: accounts.rows, vaults: orderedVaults, currencies: currencies.rows };
  });

  // ───────────── إضافة حساب (نموذج «إضافة حساب جديد») ─────────────
  // التحقق نفسه الذي في الواجهة يُكرَّر هنا بقوالب الحقول المشتركة.
  app.post('/api/accounts', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    const body = parsed.data;

    return guarded(reply, () =>
      withTransaction(pool, request.user!.id, async (client) => {
        const found = await client.query<ProviderRow & { template: TemplateKey; is_active: boolean }>(
          'SELECT id, name, type, currencies, template, is_active FROM providers WHERE id = $1',
          [body.providerId],
        );
        const provider = found.rows[0];
        if (!provider) throw new InputError('الجهة المختارة غير موجودة.');
        if (!provider.is_active) throw new InputError('الجهة موقوفة. لا يُضاف تحتها حساب جديد.');
        const template = TEMPLATES[provider.template];
        const issues: Issue[] = [];

        // بيانات الحساب: الاسم والمسؤول والحالة، ثم حقول الجهة حسب قالبها
        if (!body.name) issues.push({ sec: 'ident', label: 'حقل «اسم الحساب في النظام» مطلوب' });
        let responsibleId: string | null = null;
        if (!body.responsibleId) {
          issues.push({ sec: 'ident', label: 'حقل «المسؤول عنه في المكتب» مطلوب' });
        } else {
          const staff = await client.query('SELECT 1 FROM users WHERE id = $1 AND is_active', [body.responsibleId]);
          if (staff.rowCount) responsibleId = body.responsibleId;
          else issues.push({ sec: 'ident', label: 'المسؤول عنه في المكتب: يُختار من أعضاء فريق العمل النشطين' });
        }
        const identity = validateIdentity(provider.template, body.details as FormValues, body.currencies.map((c) => c.currency));
        issues.push(...identity.issues);

        // العملات والأرصدة الافتتاحية
        const currencyLevel = sectionLevel(template, 'curs');
        if (currencyLevel === 'core' && body.currencies.length === 0) {
          issues.push({ sec: 'curs', label: 'اختر عملة واحدة على الأقل' });
        }
        const currencies: { currency: string; initialBalance: string; openingDate: string | null }[] = [];
        const seen = new Set<string>();
        for (const item of body.currencies) {
          if (seen.has(item.currency) || !provider.currencies.includes(item.currency)) {
            issues.push({ sec: 'curs', label: `العملة ${item.currency} غير متاحة لحسابات ${provider.name}` });
            continue;
          }
          seen.add(item.currency);
          const amount = parseAmount(item.initialBalance);
          if (amount === null) {
            issues.push({ sec: 'curs', label: `الرصيد الافتتاحي ${item.currency} ليس رقماً` });
            continue;
          }
          currencies.push({ currency: item.currency, initialBalance: amount, openingDate: item.openingDate ?? null });
        }

        // الوثائق: النوع وباسم مَن إلزاميان لكل وثيقة مضافة
        body.documents.forEach((doc, index) => {
          if (!doc.type) issues.push({ sec: 'docs', label: `وثيقة ${index + 1}: اختر نوع الوثيقة` });
          else if (!DOC_TYPES.includes(doc.type)) issues.push({ sec: 'docs', label: `وثيقة ${index + 1}: نوع غير معروف` });
          if (!doc.holder) issues.push({ sec: 'docs', label: `وثيقة ${index + 1}: اكتب باسم مَن` });
        });

        if (issues.length) {
          throw new IncompleteError(
            `لا يمكن الحفظ قبل إكمال ${issues.length === 1 ? 'نقطة واحدة' : `${issues.length} نقاط`} في القائمة.`,
            issues,
          );
        }

        const duplicate = await findDuplicate(client, provider.id, body.name, null);
        if (duplicate) {
          throw new InputError(
            duplicate.status === 'ACTIVE'
              ? `يوجد حساب بنفس الاسم في ${provider.name}. لا يمكن تكرار الحساب.`
              : `يوجد حساب «${STATUS_LABEL[duplicate.status]}» بنفس الاسم في ${provider.name}. يمكن تغيير حالته إلى «نشط» من «تعديل» بدلاً من إضافته من جديد.`,
          );
        }

        const created = await client.query<{ id: string }>(
          `INSERT INTO accounts (provider_id, name, responsible_id, status, details)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [provider.id, body.name, responsibleId, body.status, JSON.stringify(identity.clean)],
        );
        const id = created.rows[0]!.id;
        for (const item of currencies) {
          await client.query(
            `INSERT INTO account_currencies (account_id, currency, initial_balance, opening_date)
             VALUES ($1, $2, $3, COALESCE($4::date, (now() AT TIME ZONE 'Asia/Jerusalem')::date))`,
            [id, item.currency, item.initialBalance, item.openingDate],
          );
        }
        for (const doc of body.documents) {
          await client.query(
            `INSERT INTO account_documents (account_id, doc_type, holder_name, expiry_date, note)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, doc.type, doc.holder, doc.expiry ?? null, doc.note || null],
          );
        }
        if (body.note) {
          await client.query('INSERT INTO account_notes (account_id, body) VALUES ($1, $2)', [id, body.note]);
        }
        reply.code(201);
        return {
          id,
          title: `${provider.name} – ${body.name}`,
          section: SECTION_LABEL[provider.type],
          providerName: provider.name,
          openings: currencies.map((c) => ({ currency: c.currency, initialBalance: c.initialBalance })),
        };
      }),
    );
  });

  // ───────────── الجهات (شاشة «الجهات»، لوحة Providers.dc.html) ─────────────
  // قواعد الحذف والإيقاف وأقفال النوع والعملة تفرضها القاعدة، وهنا رسائل التصميم وترتيبها.
  const PROVIDER_COLUMNS = `id, name, type, template, currencies, is_builtin AS "isBuiltin", is_active AS "isActive"`;

  app.get('/api/providers', { preHandler: requireAuth }, async () => {
    const providers = await pool.query(
      `SELECT p.id, p.name, p.type, p.template, p.currencies, p.is_builtin AS "isBuiltin", p.is_active AS "isActive",
              COALESCE((SELECT json_agg(a.name ORDER BY a.created_at, a.id) FROM accounts a WHERE a.provider_id = p.id), '[]') AS accounts,
              COALESCE((SELECT json_agg(DISTINCT ac.currency)
                        FROM account_currencies ac JOIN accounts a ON a.id = ac.account_id
                        WHERE a.provider_id = p.id), '[]') AS "usedCurrencies"
       FROM providers p ORDER BY p.is_builtin DESC, p.created_at, p.name`,
    );
    return { providers: providers.rows, typeCurrencies: TYPE_CURRENCIES };
  });

  /** يتحقق من الاسم والعملات بترتيب رسائل اللوحة، ويعيد العملات مرتبة. */
  async function readProvider(
    client: PoolClient,
    input: { name: string; type: AccountType; currencies: string[] },
    exceptId: string | null,
  ): Promise<string[]> {
    if (!input.name) throw new InputError('اكتب اسم الجهة.');
    const existing = await client.query('SELECT 1 FROM providers WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2', [
      input.name,
      exceptId,
    ]);
    if (existing.rowCount) throw new InputError('توجد جهة بنفس الاسم.');
    if (TYPE_CURRENCIES[input.type].length > 0 && input.currencies.length === 0) {
      throw new InputError('اختر عملة واحدة على الأقل.');
    }
    // تطبيقات البطاقات بلا عملات ولا أرصدة
    return input.type === 'CARD_APP' ? [] : orderCurrencies(input.type, input.currencies);
  }

  app.post('/api/providers', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = providerBody.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    const input = parsed.data;
    return guarded(reply, () =>
      withTransaction(pool, request.user!.id, async (client) => {
        const currencies = await readProvider(client, input, null);
        const created = await client.query(
          `INSERT INTO providers (name, type, template, currencies) VALUES ($1, $2, $3, $4) RETURNING ${PROVIDER_COLUMNS}`,
          [input.name, input.type, NEW_PROVIDER_TEMPLATE[input.type], currencies],
        );
        reply.code(201);
        return { provider: created.rows[0], section: SECTION_LABEL[input.type] };
      }),
    );
  });

  app.patch<{ Params: { id: string } }>('/api/providers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = providerBody.safeParse(request.body ?? {});
    if (!parsed.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    return guarded(reply, () =>
      withTransaction(pool, request.user!.id, async (client) => {
        const current = await client.query<{ type: AccountType }>('SELECT type FROM providers WHERE id = $1 FOR UPDATE', [
          request.params.id,
        ]);
        const row = current.rows[0];
        if (!row) throw new InputError('الجهة غير موجودة.');
        // PayPal نوع مستقل في القاعدة ويظهر في الشاشة تحت «منصات الدفع والتحويل»: نوعه ثابت.
        const type: AccountType = row.type === 'PAYPAL' ? 'PAYPAL' : parsed.data.type;
        const currencies = await readProvider(client, { ...parsed.data, type }, request.params.id);
        const updated = await client.query(
          `UPDATE providers SET name = $2, type = $3, currencies = $4 WHERE id = $1 RETURNING ${PROVIDER_COLUMNS}`,
          [request.params.id, parsed.data.name, type, currencies],
        );
        return { provider: updated.rows[0] };
      }),
    );
  });

  app.post<{ Params: { id: string } }>('/api/providers/:id/active', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = activeBody.safeParse(request.body ?? {});
    if (!parsed.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const updated = await withTransaction(pool, request.user!.id, (client) =>
      client.query('UPDATE providers SET is_active = $2 WHERE id = $1', [request.params.id, parsed.data.active]),
    );
    if (!updated.rowCount) return fail(reply, 404, 'NOT_FOUND', 'الجهة غير موجودة.');
    return { id: request.params.id, isActive: parsed.data.active };
  });

  app.delete<{ Params: { id: string } }>('/api/providers/:id', { preHandler: requireAuth }, async (request, reply) => {
    if (!uuid.safeParse(request.params.id).success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    const deleted = await withTransaction(pool, request.user!.id, (client) =>
      client.query('DELETE FROM providers WHERE id = $1', [request.params.id]),
    );
    if (!deleted.rowCount) return fail(reply, 404, 'NOT_FOUND', 'الجهة غير موجودة.');
    return reply.code(204).send();
  });

  // ───────────── تنبيهات قبل الحفظ (لا تمنعه): رقم مسجّل في حساب آخر، ووثيقة مستعملة في حسابات أخرى ─────────────
  app.post('/api/accounts/check', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = checkBody.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    const { identifiers, documents } = parsed.data;
    const [ids, docs] = await Promise.all([
      identifiers.length
        ? pool.query<{ value: string; account: string }>(
            `SELECT DISTINCT d.value, p.name || ' – ' || a.name AS account
             FROM accounts a JOIN providers p ON p.id = a.provider_id, jsonb_each_text(a.details) d
             WHERE d.value = ANY ($1)`,
            [identifiers],
          )
        : { rows: [] },
      documents.length
        ? pool.query<{ type: string; holder: string; account: string }>(
            `SELECT DISTINCT x.doc_type AS type, x.holder_name AS holder, p.name || ' – ' || a.name AS account
             FROM account_documents x JOIN accounts a ON a.id = x.account_id JOIN providers p ON p.id = a.provider_id
             WHERE (x.doc_type, x.holder_name) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
            [documents.map((d) => d.type), documents.map((d) => d.holder)],
          )
        : { rows: [] },
    ]);
    return { identifiers: ids.rows, documents: docs.rows };
  });

  // ───────────── تعديل: الاسم، الجهة (لحساب بلا حركات)، وإضافة عملة ─────────────
  app.patch<{ Params: { id: string } }>('/api/accounts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateBody.safeParse(request.body ?? {});
    if (!parsed.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const body = parsed.data;

    return guarded(reply, () =>
      withTransaction(pool, request.user!.id, async (client) => {
        const current = await client.query<{ name: string; provider_id: string }>(
          'SELECT name, provider_id FROM accounts WHERE id = $1 FOR UPDATE',
          [request.params.id],
        );
        const account = current.rows[0];
        if (!account) throw new InputError('الحساب غير موجود.');

        const provider = await resolveProvider(client, body);
        if (!body.name) throw new InputError('اكتب اسم الحساب.');
        const duplicate = await findDuplicate(client, provider.id, body.name, request.params.id);
        if (duplicate) {
          throw new InputError(
            duplicate.status === 'ACTIVE'
              ? `يوجد حساب بنفس الاسم في ${provider.name}.`
              : `يوجد حساب «${STATUS_LABEL[duplicate.status]}» بنفس الاسم في ${provider.name}. يمكن تغيير حالته إلى «نشط» بدلاً من التكرار.`,
          );
        }
        const additions = readCurrencies(body.addCurrencies, provider);
        const changed = provider.id !== account.provider_id || body.name !== account.name;
        if (!changed && additions.length === 0) throw new InputError('لا توجد تعديلات للحفظ.');

        if (changed) {
          await client.query('UPDATE accounts SET provider_id = $2, name = $3 WHERE id = $1', [
            request.params.id,
            provider.id,
            body.name,
          ]);
        }
        const existing = await client.query<{ currency: string }>(
          'SELECT currency FROM account_currencies WHERE account_id = $1',
          [request.params.id],
        );
        const have = new Set(existing.rows.map((r) => r.currency));
        for (const item of additions) {
          if (have.has(item.currency)) throw new InputError(`العملة ${item.currency} موجودة في الحساب.`);
        }
        await insertCurrencies(client, request.params.id, additions);
        return { id: request.params.id, title: `${provider.name} – ${body.name}`, type: provider.type };
      }),
    );
  });

  // ───────────── تغيير الحالة ─────────────
  app.post<{ Params: { id: string } }>('/api/accounts/:id/status', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = statusBody.safeParse(request.body ?? {});
    if (!parsed.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const updated = await withTransaction(pool, request.user!.id, (client) =>
      client.query('UPDATE accounts SET status = $2 WHERE id = $1 AND status <> $2', [
        request.params.id,
        parsed.data.status,
      ]),
    );
    if (!updated.rowCount) return fail(reply, 400, 'INVALID_INPUT', 'الحساب غير موجود أو حالته لم تتغير.');
    return { id: request.params.id, status: parsed.data.status };
  });

  // ───────────── الحذف: لحساب بلا أي حركة فقط (القاعدة ترفض غير ذلك) ─────────────
  app.delete<{ Params: { id: string } }>('/api/accounts/:id', { preHandler: requireAuth }, async (request, reply) => {
    if (!uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const deleted = await withTransaction(pool, request.user!.id, (client) =>
      client.query('DELETE FROM accounts WHERE id = $1', [request.params.id]),
    );
    if (!deleted.rowCount) return fail(reply, 404, 'NOT_FOUND', 'الحساب غير موجود.');
    return reply.code(204).send();
  });

  // ───────────── سجل التدقيق للحساب ─────────────
  app.get<{ Params: { id: string } }>('/api/accounts/:id/log', { preHandler: requireAuth }, async (request, reply) => {
    if (!uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const id = request.params.id;
    const stamp = `to_char(%s AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI')`;
    const [audits, statuses, providers, account] = await Promise.all([
      pool.query<{
        id: string; at: string; sort: Date; by: string | null; action: string; entity: string;
        before: Record<string, unknown> | null; after: Record<string, unknown> | null;
      }>(
        `SELECT g.id, ${stamp.replace('%s', 'g.created_at')} AS at, g.created_at AS sort, u.full_name AS by,
                g.action, g.entity, g.before, g.after
         FROM audit_logs g LEFT JOIN users u ON u.id = g.user_id
         WHERE (g.entity = 'accounts' AND g.entity_id = $1)
            OR (g.entity = 'account_currencies' AND g.action = 'CREATE' AND g.after ->> 'account_id' = $1)
         ORDER BY g.id`,
        [id],
      ),
      pool.query<{
        id: string; at: string; sort: Date; by: string | null;
        from_status: AccountStatus; to_status: AccountStatus; balances: { currency: string; balance: string }[];
      }>(
        `SELECT h.id, ${stamp.replace('%s', 'h.changed_at')} AS at, h.changed_at AS sort, u.full_name AS by,
                h.from_status, h.to_status, h.balances
         FROM account_status_history h LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.account_id = $1 AND h.from_status IS NOT NULL
         ORDER BY h.id`,
        [id],
      ),
      pool.query<ProviderRow>('SELECT id, name, type, currencies FROM providers'),
      pool.query<{ created_at: Date }>('SELECT created_at FROM accounts WHERE id = $1', [id]),
    ]);
    if (!account.rows[0]) return fail(reply, 404, 'NOT_FOUND', 'الحساب غير موجود.');
    const createdAt = account.rows[0].created_at.getTime();
    const providerById = new Map(providers.rows.map((p) => [p.id, p]));

    type Entry = { at: string; sort: number; order: number; by: string; kind: string; what: string };
    const entries: Entry[] = [];
    // الأحدث أولاً. داخل اللحظة نفسها: عكس ترتيب التسجيل، كما في التصميم.
    const push = (row: { at: string; sort: Date; by: string | null }, kind: string, what: string) =>
      entries.push({ at: row.at, sort: row.sort.getTime(), order: entries.length, by: row.by ?? '—', kind, what });

    const openedWithBalances = audits.rows.some(
      (r) => r.entity === 'account_currencies' && r.sort.getTime() === createdAt,
    );
    for (const row of audits.rows) {
      if (row.entity === 'account_currencies') {
        // عملات أُنشئت مع الحساب نفسه جزء من «إنشاء الحساب»، وليست «إضافة عملة».
        if (row.sort.getTime() === createdAt) continue;
        push(row, 'cur', `إضافة عملة ${row.after?.currency} برصيد افتتاحي ${formatAmount(String(row.after?.initial_balance ?? '0'))}`);
      } else if (row.action === 'CREATE') {
        push(row, 'add', openedWithBalances ? 'إنشاء الحساب بأرصدة افتتاحية' : 'إنشاء الحساب');
      } else if (row.action === 'UPDATE' && row.before && row.after) {
        const from = providerById.get(String(row.before.provider_id));
        const to = providerById.get(String(row.after.provider_id));
        if (from && to && from.id !== to.id) {
          if (SECTION_LABEL[from.type] !== SECTION_LABEL[to.type]) {
            push(row, 'edit', `النوع: من «${SECTION_LABEL[from.type]}» إلى «${SECTION_LABEL[to.type]}»`);
          }
          push(row, 'edit', `البنك / المنصة: من «${from.name}» إلى «${to.name}»`);
        }
        if (row.before.name !== row.after.name) {
          push(row, 'edit', `الاسم: من «${row.before.name}» إلى «${row.after.name}»`);
        }
      }
    }
    for (const row of statuses.rows) {
      const balances = row.balances.map((b) => `${formatAmount(b.balance)} ${b.currency}`).join(' · ');
      push(
        row,
        'st',
        `الحالة: من «${STATUS_LABEL[row.from_status]}» إلى «${STATUS_LABEL[row.to_status]}»` +
          (balances ? ` · الرصيد ${balances}` : ''),
      );
    }
    entries.sort((x, y) => y.sort - x.sort || y.order - x.order);
    return { log: entries.map(({ at, by, kind, what }) => ({ at, by, kind, what })) };
  });

  // ───────────── تفاصيل خزنة ─────────────
  app.get<{ Params: { key: string } }>('/api/vaults/:key', { preHandler: requireAuth }, async (request, reply) => {
    const key = request.params.key.toUpperCase();
    if (!VAULT_NAME[key]) return fail(reply, 404, 'NOT_FOUND', 'الخزنة غير موجودة.');
    const movesQuery = () =>
      pool.query(
        `SELECT l.id, to_char(l.entry_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY') AS date,
                p.name || ' – ' || a.name AS account, l.description, l.amount::text AS amount, l.currency
         FROM ledger_entries l
         JOIN v_account_currency_balances b ON b.account_currency_id = l.account_currency_id
         JOIN accounts a ON a.id = b.account_id
         JOIN providers p ON p.id = a.provider_id
         WHERE b.vault_key = $1
         ORDER BY l.entry_at DESC, l.id DESC LIMIT 20`,
        [key],
      );

    if (key === 'PAYPAL') {
      const [paypal, paypalMoves] = await Promise.all([loadPaypalVault(pool), movesQuery()]);
      return {
        key,
        name: VAULT_NAME[key],
        currency: 'USD',
        total: paypal.total,
        converted: paypal.converted,
        approx: paypal.approx,
        ratesAt: paypal.ratesAt,
        totals: paypal.totals,
        accounts: paypal.accounts.map((a) => ({ ...a, id: a.accountId, currency: 'USD', balance: a.usd })),
        moves: paypalMoves.rows,
      };
    }

    const [accounts, moves] = await Promise.all([
      pool.query<{ balance: string; currency: string }>(
        `SELECT b.account_currency_id AS id, a.id AS "accountId", p.name AS provider, a.name, p.type, a.status,
                s.full_name AS responsible, b.currency, b.balance::text AS balance,
                CASE WHEN sum(b.balance) OVER () > 0 AND b.balance > 0
                     THEN round(b.balance / sum(b.balance) OVER () * 100)::int ELSE 0 END AS share,
                sum(b.balance) OVER ()::numeric(18,4)::text AS total,
                last.amount::text AS "lastAmount", b.currency AS "lastCurrency",
                to_char(last.entry_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') AS "lastAt"
         FROM v_account_currency_balances b
         JOIN accounts a ON a.id = b.account_id
         JOIN providers p ON p.id = a.provider_id
         LEFT JOIN users s ON s.id = a.responsible_id
         LEFT JOIN LATERAL (
           SELECT l.amount, l.entry_at FROM ledger_entries l
           WHERE l.account_currency_id = b.account_currency_id ORDER BY l.entry_at DESC, l.id DESC LIMIT 1
         ) last ON true
         WHERE b.vault_key = $1
         ORDER BY b.balance DESC, p.name, a.name`,
        [key],
      ),
      movesQuery(),
    ]);
    const first = accounts.rows[0] as { total?: string; currency?: string } | undefined;
    return {
      key,
      name: VAULT_NAME[key],
      currency: key === 'PAYPAL' ? 'USD' : key,
      total: first?.total ?? '0.0000',
      accounts: accounts.rows,
      moves: moves.rows,
    };
  });
}
