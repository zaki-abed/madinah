// قوالب نموذج «إضافة حساب جديد» (لوحة AddAccount.dc.html): لكل جهة قالب يحدد أقسامه وحقوله.
// ملف مشترك: تستعمله الواجهة لعرض الحقول، والخادم لتكرار التحقق نفسه قبل الحفظ.
// لا يستورد أي شيء خاص بالخادم أو بالمتصفح.

export type TemplateKey = 'bank' | 'paypal' | 'emi' | 'cardapp' | 'crypto' | 'vf' | 'ip' | 'plw';
export type SectionId = 'ident' | 'curs' | 'limits' | 'docs' | 'cards' | 'ops';
export type SectionLevel = 'core' | 'opt' | 'na';
export type FormValue = string | string[];
export type FormValues = Record<string, FormValue | undefined>;

/** صيغ التحقق: [التعبير، رسالة الخطأ]. */
export const RX = {
  email: ['^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', 'بريد إلكتروني غير صحيح'],
  egPhone: ['^01[0125]\\d{8}$', 'رقم مصري من 11 خانة يبدأ بـ 010 أو 011 أو 012 أو 015'],
  psPhone: ['^05[69]\\d{7}$', 'رقم فلسطيني من 10 خانات يبدأ بـ 059 أو 056'],
  psIban: ['^PS\\d{2}[A-Z]{4}\\d{21}$', 'IBAN فلسطيني: يبدأ بـ PS وطوله 29 خانة'],
  egIban: ['^EG\\d{27}$', 'IBAN مصري: EG يليه 27 رقماً'],
  digits: ['^\\d{5,13}$', 'أرقام فقط، من 5 إلى 13 خانة'],
  uid: ['^\\d{6,12}$', 'UID أرقام فقط، من 6 إلى 12 خانة'],
  swift: ['^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$', 'SWIFT من 8 أو 11 خانة'],
  trc: ['^T[1-9A-HJ-NP-Za-km-z]{33}$', 'عنوان TRC20 يبدأ بـ T وطوله 34 خانة'],
  evm: ['^0x[0-9a-fA-F]{40}$', 'عنوان يبدأ بـ 0x ويليه 40 خانة'],
  sol: ['^[1-9A-HJ-NP-Za-km-z]{32,44}$', 'عنوان Solana من 32 إلى 44 خانة'],
  ipa: ['^[a-z0-9._-]+@instapay$', 'العنوان ينتهي بـ @instapay'],
  routing: ['^\\d{9}$', 'Routing من 9 أرقام'],
} as const satisfies Record<string, readonly [string, string]>;
export type RxKey = keyof typeof RX;

/** صيغ المعرّفات التي يُنبَّه عند تكرارها في حساب آخر (أرقام محافظ وحسابات). */
export const IDENTIFIER_RX: RxKey[] = ['egPhone', 'psPhone', 'digits'];

export const CURRENCY_NAME: Record<string, string> = {
  ILS: 'الشيكل',
  USD: 'الدولار',
  EUR: 'اليورو',
  JOD: 'الدينار الأردني',
  EGP: 'الجنيه المصري',
  USDT: 'USDT',
};

export const STATUS_OPTIONS = ['نشط', 'مقيّد', 'مجمّد', 'مغلق'] as const;
export const STATUS_CODE: Record<string, 'ACTIVE' | 'RESTRICTED' | 'FROZEN' | 'CLOSED'> = {
  نشط: 'ACTIVE',
  مقيّد: 'RESTRICTED',
  مجمّد: 'FROZEN',
  مغلق: 'CLOSED',
};

export const DOC_TYPES = [
  'جواز سفر', 'هوية', 'إقامة', 'رخصة قيادة', 'إثبات عنوان', 'كشف حساب', 'صورة سيلفي', 'سجل تجاري', 'أخرى',
];

export interface Field {
  k: string;
  label: string;
  t: 'text' | 'chips' | 'area';
  req?: boolean;
  /** نص لاتيني: خط واتجاه LTR. */
  en?: boolean;
  /** يظهر معه زر «نسخ» في صفحة الحساب. */
  copy?: boolean;
  wide?: boolean;
  rx?: RxKey;
  ph?: string;
  help?: string;
  opts?: string[];
  multi?: boolean;
}

export interface FieldGroup {
  title?: string;
  boxed?: boolean;
  help?: string;
  /** مجموعة قابلة للإزالة (حساب بنكي مربوط في إنستاباي): رقمها. */
  removeId?: number;
  fields: Field[];
}

export interface Template {
  /** مستوى كل قسم لهذه الجهة. غير المذكور = اختياري (الوثائق) أو أساسي (العملات). */
  secs: Partial<Record<'curs' | 'limits' | 'docs' | 'cards', SectionLevel>>;
  naNote: Partial<Record<SectionId, string>>;
  /** ملاحظة تثبيت العملة (جهة بعملة واحدة). */
  curFixed?: string;
  noteHint?: string;
  ownerHelp?: string;
  /** زر إضافة مجموعة متكررة. */
  addGroup?: string;
  /** حقول «بيانات الجهة». linked: أرقام الحسابات البنكية المربوطة (إنستاباي). */
  ident(values: FormValues, currencies: string[], linked: number[]): FieldGroup[];
}

const F = (k: string, label: string, options: Partial<Field> = {}): Field => ({ k, label, t: 'text', ...options });
const chips = (k: string, label: string, opts: string[], options: Partial<Field> = {}): Field =>
  F(k, label, { t: 'chips', opts, ...options });
const list = (value: FormValue | undefined): string[] => (Array.isArray(value) ? value : []);
const networkRx = (network: string): RxKey => (network === 'TRC20' ? 'trc' : network === 'Solana' ? 'sol' : 'evm');

const NOTE_HINT =
  'مثلاً: الهدف من فتح الحساب، والعمل أو النشاط، وحجم التعامل المتوقع، والعنوان المسجّل، ومن يحتفظ بكلمة المرور ورمز PIN.';

export const TEMPLATES: Record<TemplateKey, Template> = {
  bank: {
    secs: { limits: 'core', cards: 'na' },
    naNote: { cards: 'البطاقات لا تُسجَّل عادةً مع الحسابات البنكية. يمكن تفعيل القسم لحساب بعينه عند الحاجة.' },
    ownerHelp: 'هو نفسه صاحب تطبيق البنك على جواله',
    ident: (_values, currencies) => [
      {
        fields: [
          F('branch', 'الفرع', { req: true, ph: 'مثال: المغازي', copy: true }),
          chips('acctType', 'نوع الحساب', ['جاري', 'توفير'], { req: true }),
          F('holder', 'اسم صاحب الحساب', { req: true, copy: true, wide: true, ph: 'كما هو مسجل في البنك' }),
          F('accNo', 'رقم الحساب', { req: true, en: true, copy: true, rx: 'digits', ph: '0412345' }),
          F('swift', 'SWIFT / BIC', { en: true, copy: true, rx: 'swift', ph: 'PALSPS22' }),
        ],
      },
      {
        title: 'أرقام IBAN',
        boxed: true,
        help: currencies.length ? '' : 'اختر العملات أولاً من قسم «العملات والأرصدة»، فيظهر حقل IBAN لكل عملة.',
        fields: currencies.map((c) =>
          F(`iban_${c}`, `IBAN ${CURRENCY_NAME[c] ?? c}`, { req: true, en: true, copy: true, rx: 'psIban', ph: 'PS92PALS…', wide: true }),
        ),
      },
    ],
  },
  paypal: {
    secs: { limits: 'core', cards: 'na' },
    naNote: { cards: 'PayPal لا يُصدر بطاقات. ربط بطاقات KAST وnsave بحسابات PayPal يتم من صفحة «البطاقات والربط».' },
    noteHint: NOTE_HINT,
    ident: () => [
      {
        fields: [
          F('email', 'البريد الإلكتروني', { req: true, en: true, copy: true, rx: 'email', ph: 'name@example.com' }),
          F('ppName', 'الاسم في PayPal', { req: true, en: true, copy: true }),
          F('ppme', 'رابط PayPal.me', { en: true, copy: true, ph: 'paypal.me/…' }),
          chips('ppType', 'نوع الحساب', ['Personal', 'Business'], { req: true, help: 'الحساب التجاري يضيف «مستندات تسجيل النشاط» إلى الوثائق' }),
          F('country', 'دولة التسجيل', { ph: 'مثال: فلسطين' }),
        ],
      },
    ],
  },
  emi: {
    secs: { limits: 'na', cards: 'na' },
    naNote: { limits: 'لا يُسجَّل ليميت لهذا النوع من الحسابات.', cards: 'لا تُسجَّل بطاقات لهذا النوع من الحسابات.' },
    noteHint: NOTE_HINT,
    ident: () => [
      {
        fields: [
          F('email', 'البريد الإلكتروني', { req: true, en: true, copy: true, rx: 'email' }),
          F('holder', 'اسم صاحب الحساب', { req: true, en: true, copy: true }),
        ],
      },
    ],
  },
  cardapp: {
    secs: { curs: 'na', limits: 'na', cards: 'opt' },
    naNote: {
      curs: 'تطبيقات البطاقات بدون أرصدة في النظام. تُسجَّل بيانات الحساب والبطاقات فقط.',
      limits: 'لا يُسجَّل ليميت لتطبيقات البطاقات.',
    },
    noteHint: NOTE_HINT,
    ident: (values) => {
      const methods = list(values.rcvM);
      const on = (m: string) => methods.includes(m);
      const any = on('SWIFT') || on('ACH');
      const networks = list(values.nets);
      let receive: Field[] = [chips('rcvM', 'طرق الاستلام', ['SWIFT', 'ACH'], { multi: true })];
      if (any) {
        receive = receive.concat(
          [
            F('rBank', 'اسم البنك', { en: true, copy: true }),
            F('rBankAddr', 'عنوان البنك', { en: true, copy: true, wide: true }),
            F('rBankCountry', 'دولة البنك', { en: true, copy: true }),
            F('rAcc', 'رقم الحساب', { en: true, copy: true, rx: 'digits' }),
          ],
          on('ACH') ? [F('rRouting', 'Routing number', { en: true, copy: true, rx: 'routing' })] : [],
          on('SWIFT') ? [F('rSwift', 'SWIFT / BIC', { en: true, copy: true, rx: 'swift' })] : [],
          [F('rBen', 'اسم المستفيد', { en: true, copy: true }), F('rBenAddr', 'عنوان المستفيد', { en: true, copy: true, wide: true })],
        );
      }
      return [
        {
          fields: [
            F('email', 'البريد الإلكتروني', { req: true, en: true, copy: true, rx: 'email' }),
            F('phone', 'رقم الجوال المسجل', { en: true, copy: true }),
            F('holder', 'اسم صاحب الحساب', { req: true, en: true, copy: true }),
            F('country', 'دولة التسجيل'),
          ],
        },
        { title: 'تفاصيل استلام الدولار · اختياري', boxed: true, help: any ? '' : 'اختر الطرق المتوفرة لهذا الحساب، فتظهر حقولها.', fields: receive },
        {
          title: 'عناوين الإيداع · اختياري',
          boxed: true,
          help: networks.length ? '' : 'اختر الشبكات المتوفرة لهذا الحساب، فيظهر حقل عنوان لكل شبكة.',
          fields: [chips('nets', 'شبكات الإيداع', ['BEP20', 'TRC20', 'Solana'], { multi: true })].concat(
            networks.map((n) => F(`addr_${n}`, `عنوان ${n}`, { req: true, en: true, copy: true, wide: true, rx: networkRx(n) })),
          ),
        },
      ];
    },
  },
  crypto: {
    secs: { limits: 'na', cards: 'na' },
    naNote: { limits: 'منصات USDT بدون ليميت في النظام.', cards: 'منصات USDT في النظام بدون بطاقات.' },
    curFixed: 'منصات USDT: عملة واحدة فقط هي USDT.',
    ident: (values) => {
      const networks = list(values.nets);
      return [
        {
          fields: [
            F('uid', 'UID', { req: true, en: true, copy: true, rx: 'uid' }),
            F('email', 'البريد الإلكتروني', { req: true, en: true, copy: true, rx: 'email' }),
            chips('nets', 'شبكات الإيداع', ['BEP20', 'TRC20', 'Solana'], { req: true, multi: true }),
          ],
        },
        {
          title: 'عناوين الإيداع',
          boxed: true,
          help: networks.length ? '' : 'اختر الشبكات أولاً، فيظهر حقل عنوان لكل شبكة.',
          fields: networks.map((n) => F(`addr_${n}`, `عنوان ${n}`, { req: true, en: true, copy: true, wide: true, rx: networkRx(n) })),
        },
      ];
    },
  },
  vf: {
    secs: { limits: 'core', cards: 'na' },
    naNote: { cards: 'لا توجد بطاقات لهذه المحفظة في النظام.' },
    curFixed: 'المحافظ المصرية بالجنيه فقط، وتُحسب ضمن «صندوق الجنيه».',
    ident: () => [
      {
        fields: [
          F('no', 'رقم المحفظة', { req: true, en: true, copy: true, rx: 'egPhone', ph: '010…' }),
          F('line', 'اسم صاحب الخط', { req: true, copy: true }),
        ],
      },
    ],
  },
  ip: {
    secs: { limits: 'core', cards: 'na' },
    naNote: { cards: 'إنستاباي تطبيق تحويل بدون بطاقات خاصة به.' },
    curFixed: 'إنستاباي بالجنيه فقط، وتُحسب ضمن «صندوق الجنيه».',
    addGroup: 'ربط حساب بنكي آخر',
    ident: (_values, _currencies, linked) => {
      const groups: FieldGroup[] = [
        {
          fields: [
            F('ipa', 'عنوان إنستاباي', { req: true, en: true, copy: true, rx: 'ipa', ph: 'name@instapay' }),
            F('phone', 'رقم الجوال المربوط', { req: true, en: true, copy: true, rx: 'egPhone' }),
          ],
        },
      ];
      linked.forEach((n, index) => {
        groups.push({
          title: `الحساب البنكي المربوط ${index + 1}`,
          boxed: true,
          removeId: linked.length > 1 ? n : undefined,
          fields: [
            F(`ibBank_${n}`, 'اسم البنك', { req: true, ph: 'مثال: البنك الأهلي المصري' }),
            F(`ibHolder_${n}`, 'اسم صاحب الحساب', { req: true, copy: true }),
            F(`ibAcc_${n}`, 'رقم الحساب', { req: true, en: true, copy: true, rx: 'digits' }),
            F(`ibIban_${n}`, 'IBAN', { req: true, en: true, copy: true, rx: 'egIban', wide: true }),
          ],
        });
      });
      return groups;
    },
  },
  plw: {
    secs: { limits: 'core', cards: 'na' },
    naNote: { cards: 'لا توجد بطاقات لهذه المحفظة في النظام.' },
    ident: () => [
      {
        fields: [
          F('no', 'رقم المحفظة', { req: true, en: true, copy: true, rx: 'psPhone', ph: '059…' }),
          F('holder', 'اسم صاحب الحساب', { req: true, copy: true }),
        ],
      },
    ],
  },
};

/** مستوى القسم لقالب الجهة. الوثائق اختيارية لكل الجهات، والملاحظات اختيارية دائماً. */
export function sectionLevel(template: Template, id: SectionId): SectionLevel {
  if (id === 'ident') return 'core';
  if (id === 'ops') return 'opt';
  if (id === 'curs') return template.secs.curs ?? 'core';
  if (id === 'docs') return 'opt';
  return template.secs[id] ?? 'na';
}

/** ترتيب الأقسام في النموذج وعناوينها. */
export const SECTIONS: { id: SectionId; title: string; desc: string }[] = [
  { id: 'ident', title: 'بيانات الحساب', desc: 'اسم الحساب وحالته والمسؤول عنه، مع بيانات الجهة التي تظهر في صفحة الحساب ومعها أزرار النسخ' },
  { id: 'curs', title: 'العملات والأرصدة', desc: 'العملات المتاحة والرصيد الافتتاحي لكل عملة' },
  { id: 'limits', title: 'الحدود (الليميت)', desc: 'حدود الدخول والخروج وفتراتها وطريقة احتسابها' },
  { id: 'docs', title: 'الوثائق والتوثيق', desc: 'الوثائق المطلوبة لهذه الجهة مع تواريخ الإصدار والانتهاء' },
  { id: 'cards', title: 'البطاقات', desc: 'البطاقات الصادرة من هذا الحساب' },
  { id: 'ops', title: 'الملاحظات', desc: 'ملاحظات داخلية لا تظهر خارج المكتب' },
];

/** أقسام تُبنى في المرحلة الخامسة: تظهر في النموذج بوسم «قريباً» بدون حقول. */
export const SOON_SECTIONS: SectionId[] = ['limits', 'cards'];

/** أرقام الحسابات البنكية المربوطة (إنستاباي) الموجودة في القيم. */
export function linkedIds(values: FormValues): number[] {
  const ids = new Set<number>();
  for (const key of Object.keys(values)) {
    const match = /^ib(?:Bank|Holder|Acc|Iban)_(\d+)$/.exec(key);
    if (match) ids.add(Number(match[1]));
  }
  return [...ids].sort((a, b) => a - b);
}

export interface Issue {
  sec: SectionId;
  label: string;
}

const isEmpty = (field: Field, value: FormValue | undefined) =>
  field.multi ? list(value).length === 0 : String(value ?? '').trim() === '';

/** خطأ صيغة الحقل، أو نص فارغ. */
export function fieldError(field: Field, value: FormValue | undefined): string {
  if (!field.rx || field.multi || isEmpty(field, value)) return '';
  const [pattern, message] = RX[field.rx];
  return new RegExp(pattern).test(String(value).trim()) ? '' : message;
}

/**
 * يتحقق من «بيانات الجهة» حسب القالب، ويعيد القيم المعروفة فقط (بلا مفاتيح غريبة)
 * مع قائمة النواقص بنصوص التصميم.
 */
export function validateIdentity(
  key: TemplateKey,
  values: FormValues,
  currencies: string[],
): { issues: Issue[]; clean: Record<string, FormValue>; identifiers: string[] } {
  const template = TEMPLATES[key];
  const linked = key === 'ip' ? (linkedIds(values).length ? linkedIds(values) : [1]) : [];
  const issues: Issue[] = [];
  const clean: Record<string, FormValue> = {};
  const identifiers: string[] = [];
  for (const group of template.ident(values, currencies, linked)) {
    for (const field of group.fields) {
      const value = values[field.k];
      if (isEmpty(field, value)) {
        if (field.req) issues.push({ sec: 'ident', label: `حقل «${field.label}» مطلوب` });
        continue;
      }
      if (field.t === 'chips') {
        const chosen = field.multi ? list(value) : [String(value)];
        if (chosen.some((option) => !field.opts?.includes(option))) {
          issues.push({ sec: 'ident', label: `${field.label}: قيمة غير معروفة` });
          continue;
        }
        clean[field.k] = field.multi ? chosen : chosen[0]!;
        continue;
      }
      const text = String(value).trim();
      const error = fieldError(field, text);
      if (error) issues.push({ sec: 'ident', label: `${field.label}: ${error}` });
      else if (field.rx && IDENTIFIER_RX.includes(field.rx)) identifiers.push(text);
      clean[field.k] = text;
    }
  }
  return { issues, clean, identifiers };
}
