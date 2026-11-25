import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { TEMPLATES, fieldError, linkedIds, sectionLevel, validateIdentity } from '../src/shared/accountTemplates.js';
import { balanceOf, createUser, openTestDb, providerId, unique, type TestDb } from './helpers.js';

let db: TestDb;
let app: FastifyInstance;
let cookies: Record<string, string>;
let staff: string;

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
  const user = await createUser(db);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: user.username, password: user.password },
  });
  cookies = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  staff = user.id; // «المسؤول عنه» يُختار من فريق العمل
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, cookies, payload: payload as object });
const digits = (length: number) => String(Math.floor(Math.random() * 10 ** length)).padStart(length, '0');

const IBAN = 'PS92PALS000000000400400991701';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bank = (overrides: Record<string, unknown> = {}): Record<string, any> => ({
  name: unique('حساب المكتب'),
  responsibleId: staff,
  details: { branch: 'المغازي', acctType: 'جاري', holder: 'مكتب المدينة', accNo: digits(7), iban_ILS: IBAN, iban_USD: IBAN },
  currencies: [
    { currency: 'ILS', initialBalance: '12,000', openingDate: '2026-11-01' },
    { currency: 'USD', initialBalance: '' },
  ],
  ...overrides,
});

interface Issue { sec: string; label: string }
const issuesOf = async (payload: unknown): Promise<string[]> =>
  ((await post('/api/accounts', payload)).json().error.issues as Issue[]).map((i) => i.label);

describe('قوالب الحقول المشتركة', () => {
  it('مستويات الأقسام حسب الجهة', () => {
    expect(sectionLevel(TEMPLATES.bank, 'limits')).toBe('core');
    expect(sectionLevel(TEMPLATES.crypto, 'limits')).toBe('na');
    expect(sectionLevel(TEMPLATES.cardapp, 'curs')).toBe('na');
    expect(sectionLevel(TEMPLATES.cardapp, 'cards')).toBe('opt');
    expect(sectionLevel(TEMPLATES.vf, 'docs')).toBe('opt');
    expect(sectionLevel(TEMPLATES.plw, 'ident')).toBe('core');
  });

  it('حقول IBAN تتبع العملات، وعناوين الإيداع تتبع الشبكات', () => {
    const ibans = TEMPLATES.bank.ident({}, ['ILS', 'JOD'], [])[1]!.fields.map((f) => f.k);
    expect(ibans).toEqual(['iban_ILS', 'iban_JOD']);
    const addresses = TEMPLATES.crypto.ident({ nets: ['TRC20', 'BEP20'] }, ['USDT'], [])[1]!.fields.map((f) => [f.k, f.rx]);
    expect(addresses).toEqual([['addr_TRC20', 'trc'], ['addr_BEP20', 'evm']]);
  });

  it('صيغ الحقول برسائل التصميم', () => {
    const field = (key: string) => TEMPLATES.vf.ident({}, [], [])[0]!.fields.find((f) => f.k === key)!;
    expect(fieldError(field('no'), '0591234567')).toBe('رقم مصري من 11 خانة يبدأ بـ 010 أو 011 أو 012 أو 015');
    expect(fieldError(field('no'), '01012345678')).toBe('');
    expect(fieldError(field('no'), '')).toBe('');
    const result = validateIdentity('paypal', { email: 'not-an-email', ppName: 'Madina', ppType: 'Personal', hack: 'x' }, ['USD']);
    expect(result.issues.map((i) => i.label)).toEqual(['البريد الإلكتروني: بريد إلكتروني غير صحيح']);
    expect(Object.keys(result.clean)).not.toContain('hack');
  });

  it('إنستاباي: مجموعة لكل حساب بنكي مربوط', () => {
    expect(linkedIds({ ibBank_1: 'x', ibAcc_3: 'y', other: 'z' })).toEqual([1, 3]);
    const missing = validateIdentity('ip', { ipa: 'name@instapay', phone: '01155566778' }, ['EGP']).issues;
    expect(missing).toHaveLength(4); // بنك، صاحب الحساب، رقم الحساب، IBAN للحساب المربوط الأول
  });
});

describe('إضافة حساب جديد', () => {
  it('حساب بنكي كامل: البيانات والعملات بتواريخها والوثائق والملاحظة', async () => {
    const payload = bank({
      status: 'RESTRICTED',
      documents: [{ type: 'جواز سفر', holder: 'أحمد', expiry: '2027-01-05', note: 'قُدّم عند فتح الحساب' }],
      note: 'حساب المكتب الرئيسي',
    });
    const response = await post('/api/accounts', { providerId: await providerId(db, 'بنك فلسطين'), ...payload, details: { ...payload.details, unknown: 'يُهمل' } });
    expect(response.statusCode).toBe(201);
    const { id, title, section, openings } = response.json();
    expect(title).toBe(`بنك فلسطين – ${payload.name}`);
    expect(section).toBe('البنوك');
    expect(openings).toEqual([
      { currency: 'ILS', initialBalance: '12000' },
      { currency: 'USD', initialBalance: '0' },
    ]);

    const account = await db.app.query<{ status: string; responsible_id: string; details: Record<string, string> }>(
      'SELECT status, responsible_id, details FROM accounts WHERE id = $1',
      [id],
    );
    expect(account.rows[0]).toMatchObject({ status: 'RESTRICTED', responsible_id: staff });
    expect(account.rows[0]!.details).toEqual(payload.details);

    const currencies = await db.app.query<{ id: string; currency: string; opening: string; today: boolean }>(
      `SELECT id, currency, to_char(opening_date, 'YYYY-MM-DD') AS opening,
              opening_date = (now() AT TIME ZONE 'Asia/Jerusalem')::date AS today
       FROM account_currencies WHERE account_id = $1 ORDER BY id`,
      [id],
    );
    expect(currencies.rows.map((c) => [c.currency, c.opening === '2026-11-01', c.today])).toEqual([
      ['ILS', true, false],
      ['USD', false, true],
    ]);
    expect(await balanceOf(db, currencies.rows[0]!.id)).toBe('12000.0000');

    const docs = await db.app.query<{ doc_type: string; holder_name: string; expiry: string; note: string }>(
      "SELECT doc_type, holder_name, to_char(expiry_date, 'YYYY-MM-DD') AS expiry, note FROM account_documents WHERE account_id = $1",
      [id],
    );
    expect(docs.rows).toEqual([{ doc_type: 'جواز سفر', holder_name: 'أحمد', expiry: '2027-01-05', note: 'قُدّم عند فتح الحساب' }]);
    const notes = await db.app.query<{ body: string }>('SELECT body FROM account_notes WHERE account_id = $1', [id]);
    expect(notes.rows).toEqual([{ body: 'حساب المكتب الرئيسي' }]);
  });

  it('النواقص تمنع الحفظ وتعود كقائمة «قبل الحفظ»', async () => {
    const providerIdValue = await providerId(db, 'بنك فلسطين');
    const response = await post('/api/accounts', {
      providerId: providerIdValue,
      name: ' ',
      details: { branch: 'المغازي', acctType: 'جاري', accNo: '12', swift: 'bad' },
      currencies: [{ currency: 'ILS', initialBalance: '12x' }, { currency: 'USDT' }],
      documents: [{ type: '', holder: '' }, { type: 'هوية', holder: 'زكي' }],
    });
    expect(response.statusCode).toBe(400);
    const error = response.json().error as { code: string; message: string; issues: Issue[] };
    expect(error.code).toBe('INCOMPLETE');
    expect(error.message).toBe(`لا يمكن الحفظ قبل إكمال ${error.issues.length} نقاط في القائمة.`);
    expect(error.issues.map((i) => i.label)).toEqual([
      'حقل «اسم الحساب في النظام» مطلوب',
      'حقل «المسؤول عنه في المكتب» مطلوب',
      'حقل «اسم صاحب الحساب» مطلوب',
      'رقم الحساب: أرقام فقط، من 5 إلى 13 خانة',
      'SWIFT / BIC: SWIFT من 8 أو 11 خانة',
      'حقل «IBAN الشيكل» مطلوب',
      'حقل «IBAN USDT» مطلوب',
      'الرصيد الافتتاحي ILS ليس رقماً',
      'العملة USDT غير متاحة لحسابات بنك فلسطين',
      'وثيقة 1: اختر نوع الوثيقة',
      'وثيقة 1: اكتب باسم مَن',
    ]);
    expect(new Set(error.issues.map((i) => i.sec))).toEqual(new Set(['ident', 'curs', 'docs']));

    expect(await issuesOf(bank({ providerId: providerIdValue, currencies: [], details: { branch: 'x', acctType: 'جاري', holder: 'y', accNo: '0400991' } }))).toEqual([
      'اختر عملة واحدة على الأقل',
    ]);
    const single = await post('/api/accounts', bank({ providerId: providerIdValue, responsibleId: null }));
    expect(single.json().error.message).toBe('لا يمكن الحفظ قبل إكمال نقطة واحدة في القائمة.');
  });

  it('الاسم المكرر داخل الجهة مرفوض برسالة التصميم', async () => {
    const providerIdValue = await providerId(db, 'بنك فلسطين');
    const first = bank({ providerId: providerIdValue });
    expect((await post('/api/accounts', first)).statusCode).toBe(201);
    const again = await post('/api/accounts', bank({ providerId: providerIdValue, name: first.name }));
    expect(again.json().error.message).toBe('يوجد حساب بنفس الاسم في بنك فلسطين. لا يمكن تكرار الحساب.');
  });

  it('تطبيق بطاقات: بلا عملات', async () => {
    const response = await post('/api/accounts', {
      providerId: await providerId(db, 'KAST'),
      name: unique('حساب زكي'),
      responsibleId: staff,
      details: { email: 'zaki.cards@example.com', holder: 'Zaki', rcvM: ['ACH'], rBank: 'SSB Bank', rRouting: '043087080' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().openings).toEqual([]);
    expect(await issuesOf({ providerId: await providerId(db, 'KAST'), name: 'x', responsibleId: staff, details: { email: 'a@b.co', holder: 'Z' }, currencies: [{ currency: 'USD' }] })).toEqual([
      'العملة USD غير متاحة لحسابات KAST',
    ]);
  });

  it('منصة USDT: الشبكات وعناوينها', async () => {
    const binance = await providerId(db, 'Binance');
    const base = { providerId: binance, name: unique('حساب'), responsibleId: staff, currencies: [{ currency: 'USDT', initialBalance: '2500' }] };
    expect(await issuesOf({ ...base, details: { uid: '384920175', email: 'otc@example.com', nets: ['TRC20'], addr_TRC20: '0xnope' } })).toEqual([
      'عنوان TRC20: عنوان TRC20 يبدأ بـ T وطوله 34 خانة',
    ]);
    const ok = await post('/api/accounts', {
      ...base,
      details: { uid: '384920175', email: 'otc@example.com', nets: ['TRC20'], addr_TRC20: 'TXk3n9QpW2yZr7VbA5cD8eF1gH4jK6mL9N' },
    });
    expect(ok.statusCode).toBe(201);
  });
});

describe('جهة جديدة من النموذج', () => {
  it('جهة جديدة تأخذ قالب مجموعتها والعملات المختارة', async () => {
    const name = unique('بنك القدس');
    const messages = async (payload: unknown) => (await post('/api/providers', payload)).json().error?.message;
    expect(await messages({ name: ' ', type: 'BANK', currencies: ['ILS'] })).toBe('اكتب اسم الجهة.');
    expect(await messages({ name, type: 'BANK', currencies: [] })).toBe('اختر عملة واحدة على الأقل.');

    const created = await post('/api/providers', { name, type: 'BANK', currencies: ['ILS', 'JOD'] });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      section: 'البنوك',
      provider: { name, type: 'BANK', template: 'bank', currencies: ['ILS', 'JOD'], isBuiltin: false, isActive: true },
    });
    expect(await messages({ name, type: 'BANK', currencies: ['ILS'] })).toBe('توجد جهة بنفس الاسم.');
    // لا GBP، ولا عملة من خارج عملات النوع
    expect(await messages({ name: unique('Wise'), type: 'PAYMENT_PLATFORM', currencies: ['GBP'] })).toBe('عملة غير مسموحة لهذا النوع من الجهات.');
    expect(await messages({ name: unique('Bank'), type: 'BANK', currencies: ['USDT'] })).toBe('عملة غير مسموحة لهذا النوع من الجهات.');

    const cards = await post('/api/providers', { name: unique('Bitget Card'), type: 'CARD_APP', currencies: ['USD'] });
    expect(cards.json().provider.currencies).toEqual([]);
  });
});

describe('تنبيهات لا تمنع الحفظ', () => {
  it('رقم مسجّل في حساب آخر، ووثيقة مستعملة في حسابات أخرى', async () => {
    const accNo = digits(9);
    const payload = bank({
      providerId: await providerId(db, 'بنك فلسطين'),
      details: { branch: 'المغازي', acctType: 'جاري', holder: 'مكتب', accNo, iban_ILS: IBAN, iban_USD: IBAN },
      documents: [{ type: 'رخصة قيادة', holder: unique('هبة') }],
    });
    const holder = (payload.documents as { holder: string }[])[0]!.holder;
    await post('/api/accounts', payload);

    const check = (await post('/api/accounts/check', {
      identifiers: [accNo, '99999999'],
      documents: [{ type: 'رخصة قيادة', holder }, { type: 'هوية', holder }],
    })).json();
    expect(check.identifiers).toEqual([{ value: accNo, account: `بنك فلسطين – ${payload.name}` }]);
    expect(check.documents).toEqual([{ type: 'رخصة قيادة', holder, account: `بنك فلسطين – ${payload.name}` }]);
  });
});
