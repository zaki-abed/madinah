/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import {
  CURRENCY_NAME,
  DOC_TYPES,
  IDENTIFIER_RX,
  SECTIONS as FORM_SECTIONS,
  SOON_SECTIONS,
  STATUS_CODE,
  STATUS_OPTIONS,
  TEMPLATES,
  fieldError,
  sectionLevel,
  type Field,
  type FieldGroup,
  type FormValues,
  type SectionId,
  type TemplateKey,
} from '@shared/accountTemplates';
import { api, ApiError } from '../../api';
import { SECTIONS, providerInitial, providerPage, sectionOf, type SectionId as CategoryId } from '../../accountTypes';
import { useAuth } from '../../auth';
import { formatAmount } from '../../money';
import type { Provider } from '../accounts/data';

// منطق نموذج «إضافة حساب جديد». منقول من منطق لوحة AddAccount.dc.html (renderVals) بنفس الأسماء،
// مع بيانات حقيقية من الخادم بدل البيانات التجريبية.

interface Staff { id: string; name: string }
interface Doc { dtype?: string; who?: string; expiry?: string; dnote?: string; showNote?: boolean }
interface Issue { sec: SectionId; label: string }

interface FormState {
  step: 1 | 2 | 3;
  cat: CategoryId | 'all';
  q: string;
  prov: string;
  sec: SectionId;
  v: FormValues;
  curs: string[];
  open: Record<string, string>;
  openD: Record<string, string>;
  dd: Record<string, Doc>;
  xdocs: string[];
  ib: number[];
  seq: number;
}

const DRAFT_KEY = 'madinah.addAccountDraft';
const PAGE_LABEL: Record<string, string> = {
  '/banks': 'البنوك', '/paypal': 'PayPal', '/cash-plus': 'Cash Plus', '/cards': 'البطاقات والربط',
  '/usdt-platforms': 'منصات USDT', '/egyptian-wallets': 'المحافظ المصرية', '/palestinian-wallets': 'المحافظ الفلسطينية',
};
const CATEGORY_SINGULAR: Record<CategoryId, string> = {
  bank: 'بنك', pay: 'منصة دفع وتحويل', cards: 'تطبيق بطاقات', crypto: 'منصة USDT', wallet: 'محفظة مصرية', palwallet: 'محفظة فلسطينية',
};
const DEFAULT_CURRENCIES: Record<TemplateKey, string[]> = {
  bank: ['ILS', 'USD'], paypal: ['USD'], emi: ['USD', 'EUR'], cardapp: [], crypto: ['USDT'], vf: ['EGP'], ip: ['EGP'], plw: ['ILS', 'USD'],
};
const SHORT: Partial<Record<SectionId, string>> = { curs: 'عملات', ident: 'بيانات', limits: 'حدود', docs: 'وثائق', cards: 'بطاقات' };
const LEVEL: Record<string, [string, string]> = {
  core: ['أساسي', 'pill info'], opt: ['اختياري', 'pill neutral'], na: ['لا ينطبق', 'pill neutral'], soon: ['قريباً', 'pill neutral'],
};
const CUSTOM_AVATAR = { background: '#fff', color: '#142B4A', border: '1px dashed #9FB0C6' };

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const showDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
const isNumber = (raw: string) => /^-?\d{1,14}(\.\d{1,4})?$/.test(raw.replace(/[,\s]/g, ''));
const cleanNumber = (raw: string) => (raw.trim() === '' ? '0' : raw.replace(/[,\s]/g, ''));
const text = (value: unknown) => String(value ?? '').trim();
const chip = (on: boolean, extra = '') => `chipf${extra}${on ? ' on' : ''}`;

const fresh = (): FormState => ({
  step: 1, cat: 'all', q: '', prov: '', sec: 'ident', v: { status: 'نشط' }, curs: [], open: {}, openD: {}, dd: {}, xdocs: [], ib: [1], seq: 2,
});

function readDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? ({ ...fresh(), ...JSON.parse(raw) } as FormState) : null;
  } catch {
    return null;
  }
}

export function useAddAccount(initialProviderId: string | null) {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [st, setSt] = useState<FormState>(fresh);
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [pm, setPm] = useState<{ cat: CategoryId; name: string; curs: string[] } | null>(null);
  const [pmErr, setPmErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ openings: { currency: string; initialBalance: string }[] } | null>(null);
  const [existing, setExisting] = useState<Record<string, string>>({});
  const [docUsage, setDocUsage] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<FormState | null>(readDraft);

  const set = useCallback((patch: Partial<FormState>) => {
    setSt((current) => ({ ...current, ...patch }));
    setErr('');
    setFlash('');
  }, []);

  const prov = providers?.find((p) => p.id === st.prov) ?? null;
  const T = prov ? TEMPLATES[prov.template as TemplateKey] : null;
  const curOpts = prov?.currencies ?? [];

  const initFor = useCallback(
    (provider: Provider): Partial<FormState> => {
      const defaults = DEFAULT_CURRENCIES[provider.template as TemplateKey].filter((c) => provider.currencies.includes(c));
      const curs = defaults.length ? defaults : provider.currencies.slice(0, 1);
      return { prov: provider.id, sec: 'ident', v: { status: 'نشط' }, curs, open: {}, openD: {}, dd: {}, xdocs: [], ib: [1], seq: 10 };
    },
    [],
  );

  // الجهات وفريق العمل من الخادم
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<{ providers: Provider[] }>('GET', '/api/accounts'), api<{ members: (Staff & { isActive: boolean })[] }>('GET', '/api/team')])
      .then(([accounts, team]) => {
        if (cancelled) return;
        // الجهات الموقوفة لا تظهر في «إضافة حساب»
        setProviders(accounts.providers.filter((p) => p.isActive));
        // «المسؤول عنه» يُختار من أعضاء فريق العمل النشطين فقط
        setStaff(team.members.filter((member) => member.isActive));
        const preset = accounts.providers.find((p) => p.id === initialProviderId && p.isActive);
        if (preset) setSt((current) => (current.prov ? current : { ...current, ...initFor(preset) }));
      })
      .catch((caught) => {
        if (!cancelled) setErr(caught instanceof ApiError ? caught.message : 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.');
      });
    return () => {
      cancelled = true;
    };
  }, [initialProviderId, initFor]);

  // ───────────── الحقول والتحقق ─────────────
  const lvl = (id: SectionId) => (T ? sectionLevel(T, id) : 'na');
  const isSoon = (id: SectionId) => SOON_SECTIONS.includes(id) && lvl(id) !== 'na';
  const issues: Issue[] = [];
  const warns: { t: string }[] = [];
  const v = st.v;
  const setV = (key: string, value: string | string[]) => set({ v: { ...st.v, [key]: value } });

  const renderField = (field: Field, sec: SectionId) => {
    const raw = v[field.k];
    const many = field.multi ? (Array.isArray(raw) ? raw : []) : [];
    const one = field.multi ? '' : text(raw);
    const empty = field.multi ? many.length === 0 : one === '';
    const error = fieldError(field, raw);
    const warn = !empty && !error && existing[one] ? `هذا الرقم مسجّل مسبقاً في «${existing[one]}». تأكد قبل المتابعة.` : '';
    if (field.req && empty) issues.push({ sec, label: `حقل «${field.label}» مطلوب` });
    if (error) issues.push({ sec, label: `${field.label}: ${error}` });
    return {
      k: field.k, label: field.label, req: !!field.req, opt: !field.req, wcls: `fw${field.wide ? ' wide' : ''}`,
      isText: field.t === 'text', isDate: false, isArea: field.t === 'area', isChips: field.t === 'chips',
      val: field.multi ? '' : String(raw ?? ''), ph: field.ph ?? '', inCls: `inp${field.en ? ' en' : ''}`,
      on: (e: { target: { value: string } }) => setV(field.k, e.target.value),
      chips: (field.opts ?? []).map((option) => {
        const on = field.multi ? many.includes(option) : one === option;
        return {
          label: option, cls: chip(on), pressed: on ? 'true' : 'false',
          go: () => setV(field.k, field.multi ? (on ? many.filter((x) => x !== option) : [...many, option]) : on && !field.req ? '' : option),
        };
      }),
      help: field.help ?? '', hasHelp: !!field.help && !error, err: error, hasErr: !!error, warn, hasWarn: !!warn,
      copy: !!field.copy, filled: !empty, shown: field.multi ? many.join('، ') : one, en: !!field.en,
    };
  };

  /** الحقول الأساسية: اسم الحساب، المسؤول عنه (من أعضاء فريق العمل النشطين)، والحالة. */
  const basicFields = () => {
    const name = renderField({ k: 'name', label: 'اسم الحساب في النظام', t: 'text', req: true, ph: 'مثال: محفظة أحمد', help: 'يظهر في القوائم والتبويبات وكشف الحساب' }, 'ident');
    const ownerId = text(v.owner);
    if (!ownerId) issues.push({ sec: 'ident', label: 'حقل «المسؤول عنه في المكتب» مطلوب' });
    const owner = {
      ...renderField({ k: '__owner', label: 'المسؤول عنه في المكتب', t: 'chips', help: T?.ownerHelp ?? '' }, 'ident'),
      req: true, opt: false, filled: !!ownerId, hasHelp: !!T?.ownerHelp,
      chips: staff.map((member) => {
        const on = ownerId === member.id;
        return { label: member.name, cls: chip(on), pressed: on ? 'true' : 'false', go: () => setV('owner', member.id) };
      }),
    };
    const status = renderField({ k: 'status', label: 'حالة الحساب', t: 'chips', opts: [...STATUS_OPTIONS], req: true }, 'ident');
    return [name, owner, status];
  };

  const buildGroups = (groups: FieldGroup[], sec: SectionId, lead: any[] = []) =>
    groups.map((group, index) => ({
      title: group.title ?? '', hasTitle: !!group.title, help: group.help ?? '', hasHelp: !!group.help,
      cls: `fgrp${group.boxed ? ' boxed' : ''}`, removable: !!group.removeId,
      remove: () => {
        const next = { ...st.v };
        for (const key of Object.keys(next)) if (key.endsWith(`_${group.removeId}`)) delete next[key];
        set({ ib: st.ib.filter((x) => x !== group.removeId), v: next });
      },
      fields: (index === 0 ? lead : []).concat(group.fields.map((field) => renderField(field, sec))),
    }));

  const R: any = {};
  let idents: string[] = [];
  let docPairs: { type: string; holder: string }[] = [];

  if (prov && T) {
    const identDefs = T.ident(v, st.curs, st.ib);
    const identGroups = buildGroups(identDefs, 'ident', basicFields());
    const noteField: Field = { k: 'note', label: 'ملاحظات داخلية', t: 'area', wide: true, ph: T.noteHint ?? 'لا تظهر خارج المكتب' };
    const G: Record<string, any[]> = { ident: identGroups, ops: buildGroups([{ fields: [noteField] }], 'ops') };
    idents = identDefs.flatMap((g) => g.fields)
      .filter((f) => f.rx && IDENTIFIER_RX.includes(f.rx) && !fieldError(f, v[f.k]) && text(v[f.k]))
      .map((f) => text(v[f.k]));

    // العملات
    if (!st.curs.length && lvl('curs') === 'core') issues.push({ sec: 'curs', label: 'اختر عملة واحدة على الأقل' });
    R.curRows = st.curs.map((c) => {
      const raw = st.open[c] ?? '';
      const bad = raw.trim() !== '' && !isNumber(raw);
      if (bad) issues.push({ sec: 'curs', label: `الرصيد الافتتاحي ${c} ليس رقماً` });
      return {
        cur: c, name: CURRENCY_NAME[c] ?? c, val: raw, aria: `الرصيد الافتتاحي ${c}`, err: 'اكتب رقماً فقط', hasErr: bad, date: st.openD[c] || today(),
        on: (e: { target: { value: string } }) => set({ open: { ...st.open, [c]: e.target.value } }),
        onDate: (e: { target: { value: string } }) => set({ openD: { ...st.openD, [c]: e.target.value } }),
      };
    });

    // الوثائق
    const setDD = (key: string, patch: Doc) => set({ dd: { ...st.dd, [key]: { ...st.dd[key], ...patch } } });
    const docName = (d: Doc) => [d.dtype, text(d.who)].filter(Boolean).join(' ');
    const docState = (d: Doc): [string, string, string] => {
      if (!d.dtype || !text(d.who)) return ['غير مكتملة', 'pill warn', 'empty'];
      if (d.expiry) {
        const n = daysUntil(d.expiry);
        if (n < 0) return ['منتهية', 'pill bad', 'exp'];
        if (n <= 60) return [`تنتهي خلال ${n} يوماً`, 'pill warn', 'soon'];
      }
      return ['مسجّلة', 'pill info', 'ok'];
    };
    R.docRows = st.xdocs.map((key, index) => {
      const d = st.dd[key] ?? {};
      const state = docState(d);
      const name = state[2] === 'empty' ? '' : docName(d);
      const used = docUsage[`${d.dtype}|${text(d.who)}`] ?? [];
      if (!d.dtype) issues.push({ sec: 'docs', label: `وثيقة ${index + 1}: اختر نوع الوثيقة` });
      if (!text(d.who)) issues.push({ sec: 'docs', label: `وثيقة ${index + 1}: اكتب باسم مَن` });
      if (state[2] === 'exp' || state[2] === 'soon') warns.push({ t: `${docName(d)}: ${state[0]}` });
      return {
        n: String(index + 1), dtype: d.dtype ?? '', typeOpts: DOC_TYPES, who: d.who ?? '', expiry: d.expiry ?? '', text: name, hasText: !!name,
        onType: (e: { target: { value: string } }) => setDD(key, { dtype: e.target.value }),
        onWho: (e: { target: { value: string } }) => setDD(key, { who: e.target.value }),
        onExpiry: (e: { target: { value: string } }) => setDD(key, { expiry: e.target.value }),
        st: state[0], stPill: state[1], shared: used.length ? `مستخدمة أيضاً في: ${used.join('، ')}` : '', hasShared: used.length > 0,
        // إرفاق الملف مؤجل: الوثيقة تُسجَّل بدون ملف
        file: '', hasFile: false, noFile: false, upload: () => undefined, clear: () => undefined,
        dnote: d.dnote ?? '', showNoteIn: !!d.showNote || !!d.dnote, canAddNote: !d.showNote && !d.dnote,
        addNote: () => setDD(key, { showNote: true }), onNote: (e: { target: { value: string } }) => setDD(key, { dnote: e.target.value }),
        remove: () => {
          const next = { ...st.dd };
          delete next[key];
          set({ dd: next, xdocs: st.xdocs.filter((x) => x !== key) });
        },
      };
    });
    docPairs = st.xdocs.map((key) => st.dd[key] ?? {}).filter((d) => d.dtype && text(d.who)).map((d) => ({ type: d.dtype!, holder: text(d.who) }));
    for (const value of idents) if (existing[value]) warns.push({ t: `الرقم ${value} مسجّل مسبقاً في «${existing[value]}».` });

    // حالة الأقسام والتنقل
    const order: SectionId[] = ['ident', 'curs', 'limits', 'docs', 'cards', 'ops'];
    const titleOf = (id: SectionId) => FORM_SECTIONS.find((s) => s.id === id)!.title;
    const has: Partial<Record<SectionId, boolean>> = { docs: st.xdocs.length > 0, ops: !!text(v.note) };
    const group = (id: SectionId) => (lvl(id) === 'na' ? 'na' : isSoon(id) ? 'soon' : lvl(id));
    const visible = order.filter((id) => group(id) === 'core' || group(id) === 'opt');
    const count = (id: SectionId) => issues.filter((i) => i.sec === id).length;
    const cur = st.sec;
    const curGroup = group(cur);
    const idx = visible.indexOf(cur);
    R.navGroups = ([['core', 'الأقسام الأساسية'], ['opt', 'أقسام اختيارية'], ['soon', 'قريباً'], ['na', 'لا تنطبق على هذه الجهة']] as const)
      .map(([key, title]) => ({
        title,
        items: order.filter((id) => group(id) === key).map((id) => {
          const n = count(id);
          const on = id === cur;
          const muted = key === 'na' || key === 'soon';
          const done = key === 'core' || has[id];
          return {
            label: titleOf(id), cls: `sni${on ? ' on' : ''}${muted ? ' na' : ''}`, cur: on ? 'step' : 'false', go: () => set({ sec: id }),
            badge: key === 'na' ? '' : key === 'soon' ? 'قريباً' : n ? String(n) : done ? '✓' : '—',
            bcls: `bd ${key === 'na' ? 'none' : key === 'soon' ? 'neutral' : n ? 'warn' : done ? 'ok' : 'neutral'}`,
          };
        }),
      }))
      .filter((g) => g.items.length);
    const meta = FORM_SECTIONS.find((s) => s.id === cur)!;
    const active = curGroup === 'core' || curGroup === 'opt';
    R.S = {
      title: meta.title, desc: meta.desc, lvl: LEVEL[curGroup]![0], pill: LEVEL[curGroup]![1],
      isNa: curGroup === 'na', naNote: T.naNote[cur] ?? 'هذا القسم لا ينطبق على هذه الجهة.', canEnable: false, canDisable: false,
      isSoon: curGroup === 'soon',
      soonNote: cur === 'limits'
        ? 'تسجيل الحدود يُضاف مع صفحة «حدود الحسابات». يُحفظ الحساب الآن بدون ليميت، ويُحدَّد لاحقاً من هناك.'
        : 'تسجيل البطاقات يُضاف مع صفحة «البطاقات والربط». يُحفظ الحساب الآن بدون بطاقات، وتُضاف لاحقاً من هناك.',
      isForm: active && (cur === 'ident' || cur === 'ops'), groups: G[cur] ?? [],
      isCurs: active && cur === 'curs', isDocs: active && cur === 'docs', isLimits: false, isCards: false, isLinks: false,
      canAddGroup: cur === 'ident' && !!T.addGroup, addGroupLabel: `+ ${T.addGroup ?? ''}`,
      addGroup: () => set({ ib: [...st.ib, st.seq + 1], seq: st.seq + 1 }),
    };
    const before = visible.filter((id) => order.indexOf(id) < order.indexOf(cur));
    R.prevId = idx > 0 ? visible[idx - 1] : idx < 0 ? before[before.length - 1] ?? '' : '';
    R.nextId = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1] : idx < 0 ? visible.find((id) => order.indexOf(id) > order.indexOf(cur)) ?? '' : '';
    R.titleOf = titleOf;

    // معاينة صفحة الحساب (من نفس البيانات)
    const ownerName = staff.find((m) => m.id === text(v.owner))?.name ?? '—';
    const category = sectionOf(prov.type);
    const pFields = [{ label: 'الجهة', shown: prov.name, en: /^[A-Za-z]/.test(prov.name), copy: false, filled: true, k: '' }]
      .concat(identGroups.flatMap((g) => g.fields.map((f: any) => ({ ...f, label: (g.hasTitle && /\d$/.test(g.title) ? `${g.title} · ` : '') + f.label }))))
      .filter((f) => f.filled && !['name', '__owner', 'status'].includes(f.k))
      .concat([{ label: 'المسؤول عنه في المكتب', shown: ownerName, en: false, copy: false, filled: true, k: '' }]);
    const doCopy = (key: string, value: string) => {
      void navigator.clipboard?.writeText(value).catch(() => undefined);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1600);
    };
    R.doCopy = doCopy;
    R.allTxt = pFields.filter((f) => f.copy).map((f) => `${f.label}: ${f.shown}`).join('\n');
    const status = text(v.status) || 'نشط';
    const docCount = st.xdocs.length;
    R.P = {
      title: `${prov.name} – ${text(v.name) || 'الحساب الجديد'}`,
      sub: `${CATEGORY_SINGULAR[category.id]} · المسؤول: ${ownerName}${st.curs.length ? ` · ${st.curs.join(' · ')}` : ''}`,
      status, stPill: status === 'نشط' ? 'pill ok' : status === 'مجمّد' ? 'pill bad' : status === 'مغلق' ? 'pill neutral' : 'pill warn',
      hasDocBadge: true, docBadge: docCount ? (docCount === 1 ? 'وثيقة واحدة' : docCount === 2 ? 'وثيقتان' : `${docCount} وثائق`) : 'لا توجد وثائق',
      docPill: docCount ? 'pill info' : 'pill neutral',
      fields: pFields.map((f, index) => {
        const done = copied === `c:${index}`;
        return { label: f.label, val: f.shown, vcls: f.en ? 'en' : '', share: !!f.copy, bcls: `cpy${done ? ' ok2' : ''}`, btn: done ? '✓ نُسخ' : 'نسخ', aria: `نسخ ${f.label}`, copy: () => doCopy(`c:${index}`, f.shown) };
      }),
      curs: st.curs.map((c) => ({ cur: c, bal: `${isNumber(st.open[c] ?? '') ? formatAmount(cleanNumber(st.open[c]!)) : '0.00'} ${c}`, date: showDate(st.openD[c] || today()) })),
      showLim: false, showCards: false, cards: [], showLinks: false, links: [],
      showDocs: docCount > 0,
      docs: st.xdocs.map((key) => {
        const d = st.dd[key] ?? {};
        const state = docState(d);
        return { label: (state[2] === 'empty' ? 'وثيقة غير مكتملة' : `تم استخدام ${docName(d)}`) + (d.dnote ? ` · ${d.dnote}` : ''), st: state[0], stPill: state[1] };
      }),
      showOps: !!text(v.note), ops: text(v.note) ? [{ label: 'ملاحظات داخلية', val: text(v.note) }] : [],
    };
    const page = providerPage(prov);
    R.page = page;
    R.uniq = ['الحسابات والخزائن', ...(page ? [PAGE_LABEL[page]!] : []), ...(docCount ? ['قسم الوثائق في صفحة الحساب'] : [])].filter((x, i, all) => all.indexOf(x) === i);
  }

  // تنبيهات لا تمنع الحفظ: رقم مسجّل في حساب آخر، ووثيقة مستعملة في حسابات أخرى
  const checkKey = JSON.stringify([idents, docPairs]);
  useEffect(() => {
    const [identifiers, documents] = JSON.parse(checkKey) as [string[], { type: string; holder: string }[]];
    if (!identifiers.length && !documents.length) return;
    const timer = setTimeout(() => {
      api<{ identifiers: { value: string; account: string }[]; documents: { type: string; holder: string; account: string }[] }>(
        'POST', '/api/accounts/check', { identifiers, documents },
      )
        .then((result) => {
          setExisting(Object.fromEntries(result.identifiers.map((row) => [row.value, row.account])));
          const usage: Record<string, string[]> = {};
          for (const row of result.documents) (usage[`${row.type}|${row.holder}`] ??= []).push(row.account);
          setDocUsage(usage);
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [checkKey]);

  // ───────────── الخطوة 1: المجموعة والجهة ─────────────
  const q = st.q.trim().toLowerCase();
  const categoryOf = (p: Provider) => sectionOf(p.type);
  const shown = (providers ?? []).filter((p) => (st.cat === 'all' || categoryOf(p).id === st.cat) && (!q || p.name.toLowerCase().includes(q)));
  const provGroups = SECTIONS.filter((c) => st.cat === 'all' || st.cat === c.id)
    .map((category) => {
      const list: any[] = shown.filter((p) => categoryOf(p).id === category.id).map((p) => {
        const template = TEMPLATES[p.template as TemplateKey];
        const on = st.prov === p.id;
        return {
          isNew: !p.isBuiltin, name: p.name, ini: providerInitial(p.name), av: category.iconStyle,
          cls: `pc${on ? ' on' : ''}`, pressed: on ? 'true' : 'false',
          go: () => (on ? undefined : set(initFor(p))),
          sub: (['curs', 'ident', 'limits', 'docs', 'cards'] as SectionId[])
            .filter((id) => sectionLevel(template, id) === 'core' && !SOON_SECTIONS.includes(id))
            .map((id) => SHORT[id]).join(' · '),
        };
      });
      if (!q) {
        list.push({
          name: '+ جهة جديدة', ini: '+', av: CUSTOM_AVATAR, cls: 'pc add', pressed: 'false', sub: `تُضاف تحت ${category.name}`,
          go: () => {
            setPm({ cat: category.id, name: '', curs: [...category.newCurrencies] });
            setPmErr('');
          },
        });
      }
      return { name: category.name, provs: list };
    })
    .filter((g) => g.provs.length);

  const tplSecs = prov && T
    ? FORM_SECTIONS.map((s) => {
        const level = lvl(s.id);
        return { id: s.id, lv: level === 'na' ? 'na' : isSoon(s.id) ? 'opt' : level, plus: false, label: isSoon(s.id) ? `${s.title} · قريباً` : s.title };
      })
    : [];

  const toS2 = () => (prov ? set({ step: 2 }) : setErr('اختر الجهة أولاً.'));
  const step = st.step;
  const goStep = (n: number) => {
    if (n === 1) return set({ step: 1 });
    if (!prov) return;
    set({ step: n as 2 | 3 });
  };
  const steps = ([[1, 'المجموعة والجهة'], [2, 'البيانات'], [3, 'المراجعة والحفظ']] as const).map(([n, label], index) => {
    const on = n === step;
    const done = n < step || !!saved;
    return {
      n: done && !on ? '✓' : n, label, line: index > 0,
      cls: `stp${on ? ' on' : done ? ' done' : ''}${!prov && n > 1 ? ' lockd' : ''}`, cur: on ? 'step' : 'false',
      go: () => (saved ? undefined : goStep(n)),
    };
  });

  // ───────────── نافذة «إضافة جهة» ─────────────
  const pmSave = async () => {
    if (!pm) return;
    const category = SECTIONS.find((c) => c.id === pm.cat)!;
    try {
      const created = await api<{ provider: Provider; section: string }>('POST', '/api/providers', { name: pm.name, type: category.newType, currencies: pm.curs });
      setProviders((current) => [...(current ?? []), created.provider]);
      setPm(null);
      setSt((current) => ({ ...current, ...initFor(created.provider), cat: 'all', q: '' }));
      setErr('');
      setFlash(`أُضيفت الجهة «${created.provider.name}» تحت «${created.section}». اختر «متابعة» لإضافة أول حساب لها.`);
    } catch (caught) {
      setPmErr(caught instanceof ApiError ? caught.message : 'تعذّر حفظ الجهة.');
    }
  };

  // ───────────── الحفظ ─────────────
  const save = async () => {
    if (issues.length) {
      setErr(`لا يمكن الحفظ قبل إكمال ${issues.length === 1 ? 'نقطة واحدة' : `${issues.length} نقاط`} في القائمة.`);
      return;
    }
    if (!prov || busy) return;
    setBusy(true);
    try {
      const { name, owner, status, note, ...details } = st.v;
      const result = await api<{ openings: { currency: string; initialBalance: string }[] }>('POST', '/api/accounts', {
        providerId: prov.id,
        name: text(name),
        responsibleId: text(owner) || null,
        status: STATUS_CODE[text(status)] ?? 'ACTIVE',
        details,
        currencies: st.curs.map((c) => ({ currency: c, initialBalance: st.open[c] ?? '', openingDate: st.openD[c] || today() })),
        documents: st.xdocs.map((key) => st.dd[key] ?? {}).map((d) => ({ type: d.dtype ?? '', holder: text(d.who), expiry: d.expiry || null, note: text(d.dnote) || null })),
        note: text(note) || null,
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // لا شيء
      }
      setDraft(null);
      setSaved(result);
      setErr('');
    } catch (caught) {
      setErr(caught instanceof ApiError ? caught.message : 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(st));
      setDraft(st);
      setErr('');
      setFlash('حُفظت المسودة على هذا المتصفح. تُستكمل عند فتح «إضافة حساب جديد» من جديد.');
    } catch {
      setErr('تعذّر حفظ المسودة على هذا المتصفح.');
    }
  };

  const savedCurrencies = saved?.openings ?? [];
  const page: string | null = R.page ?? null;

  const vm: any = {
    loading: !providers,
    headSub: step === 1 ? 'اختر الجهة من مجموعتها، أو أضف جهة جديدة تحت المجموعة المناسبة'
      : prov ? `${prov.name} · ${step === 2 ? 'النموذج يعرض الأقسام التي تنطبق على هذه الجهة فقط' : 'راجع صفحة الحساب كما ستظهر قبل الحفظ'}` : '',
    canDraft: step > 1 && !saved, saveDraft,
    hasDraft: !!draft && !saved && !st.prov,
    resumeDraft: () => {
      if (draft) setSt(draft);
      setFlash('');
    },
    dropDraft: () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // لا شيء
      }
      setDraft(null);
    },
    steps, hasFlash: !!flash, flash, hasErr: !!err, err,
    isS1: step === 1, isS2: step === 2 && !!prov, isS3: step === 3 && !!prov,
    q: st.q, onQ: (e: { target: { value: string } }) => set({ q: e.target.value }),
    catChips: [{ id: 'all' as const, name: 'الكل' }, ...SECTIONS].map((c) => {
      const on = st.cat === c.id;
      return { label: c.name, cls: chip(on), pressed: on ? 'true' : 'false', go: () => set({ cat: c.id }) };
    }),
    provGroups, noProvs: !provGroups.length && !!providers,
    hasProv: !!prov, noProv: !prov, isCustom: false, customName: '', onCustomName: () => undefined, customGroup: '', baseChips: [],
    pv: prov
      ? {
          name: prov.name, ini: providerInitial(prov.name), av: sectionOf(prov.type).iconStyle,
          catName: CATEGORY_SINGULAR[sectionOf(prov.type).id] + (prov.isBuiltin ? '' : ' · جهة جديدة'),
          sub: `${sectionOf(prov.type).name}${prov.isBuiltin ? '' : ' · جهة جديدة'}${curOpts.length ? ` · ${curOpts.join(' ')}` : ''}`,
        }
      : { name: '', ini: '', av: {}, sub: '', catName: '' },
    tplCore: tplSecs.filter((t) => t.lv === 'core').map((t, index) => ({ n: String(index + 1), label: t.label })),
    tplOpt: tplSecs.filter((t) => t.lv === 'opt'), hasTplOpt: tplSecs.some((t) => t.lv === 'opt'),
    tplNa: tplSecs.filter((t) => t.lv === 'na'), hasTplNa: tplSecs.some((t) => t.lv === 'na'), hasTplPlus: false,
    tplNaTitle: prov ? `غير مستخدم مع ${sectionOf(prov.type).name}` : '',
    toS2, toS1: () => set({ step: 1 }),
    S: R.S ?? {}, navGroups: R.navGroups ?? [],
    curChips: curOpts.map((c) => {
      const on = st.curs.includes(c);
      const fixed = !!T?.curFixed || curOpts.length === 1;
      return {
        label: `${c} · ${CURRENCY_NAME[c] ?? c}`, cls: fixed ? 'chipf lock' : chip(on), pressed: on ? 'true' : 'false',
        go: () => (fixed ? undefined : set({ curs: on ? st.curs.filter((x) => x !== c) : curOpts.filter((x) => x === c || st.curs.includes(x)) })),
      };
    }),
    curFixed: !!T && (!!T.curFixed || curOpts.length === 1),
    curFixedNote: T ? (T.curFixed ?? `هذه الجهة تعمل بعملة واحدة: ${curOpts[0] ?? ''}`) : '',
    curRows: R.curRows ?? [],
    docRows: R.docRows ?? [], noDocs: !st.xdocs.length,
    addDoc: () => set({ seq: st.seq + 1, xdocs: [...st.xdocs, `x${st.seq + 1}`], dd: { ...st.dd, [`x${st.seq + 1}`]: {} } }),
    enableSec: () => undefined, disableSec: () => undefined,
    // الحدود والبطاقات والربط: المرحلة الخامسة
    limRows: [], hasLimRows: false, limModeChips: [], calcChips: [], calcHint: '', wsChips: [], showWs: false, thrChips: [], hasPresets: false,
    presetLabel: '', applyPresets: () => undefined, addLim: () => undefined, noLimMsg: false, unkLimMsg: false,
    lc: { name: '', type: '', state: '', statePill: '', border: {}, none: false, noneText: '', lims: [] },
    cardRows: [], noCards: true, addCard: () => undefined, linkChips: [],
    hasPrev: !!R.prevId, noPrev: !R.prevId, prevLabel: R.prevId ? R.titleOf(R.prevId) : '', goPrev: () => set({ sec: R.prevId }),
    nextLabel: R.nextId ? `التالي: ${R.titleOf(R.nextId)}` : 'المراجعة',
    goNext: () => (R.nextId ? set({ sec: R.nextId }) : set({ step: 3 })),
    P: R.P ?? { fields: [], curs: [], docs: [], cards: [], links: [], ops: [] },
    copyAllCls: `btn mb${copied === 'c:*' ? ' cdone' : ''}`, copyAllTxt: copied === 'c:*' ? '✓ نُسخت البيانات' : 'نسخ كل البيانات',
    copyAll: () => R.doCopy?.('c:*', R.allTxt),
    issues: issues.map((issue) => ({ sec: FORM_SECTIONS.find((s) => s.id === issue.sec)!.title, label: issue.label, go: () => set({ step: 2, sec: issue.sec }) })),
    hasIssues: issues.length > 0, noIssues: !issues.length,
    issuesHead: issues.length === 1 ? 'بقي حقل واحد يمنع الحفظ' : `بقيت ${issues.length} نقاط تمنع الحفظ`,
    warns, hasWarns: warns.length > 0, appearsIn: (R.uniq ?? []).join(' · '),
    save, busy, backEdit: () => set({ step: 2 }),
    saved: !!saved, notSaved: !saved,
    savedLine: prov
      ? `${savedCurrencies.length
          ? `أُضيف الحساب بأرصدة افتتاحية ${savedCurrencies.map((c) => `${formatAmount(c.initialBalance)} ${c.currency}`).join(' · ')}`
          : 'أُضيف الحساب'}، ويظهر الآن في: ${(R.uniq ?? []).join(' · ')}.`
      : '',
    auditLine: `${savedCurrencies.length ? 'إنشاء الحساب بأرصدة افتتاحية' : 'إنشاء الحساب'} · ${user?.fullName ?? ''} · ${showDate(today())}`,
    pageHref: page ?? '/accounts', pageLabel: page ? `فتح صفحة ${PAGE_LABEL[page]} ←` : 'فتح الحسابات والخزائن ←',
    restart: () => {
      setSaved(null);
      setSt(fresh());
      setFlash('');
      setErr('');
    },
    // نافذة «إضافة جهة»
    isPM: !!pm, pm: pm ?? { name: '' }, pmErr, pmHasErr: !!pmErr,
    pmClose: () => setPm(null),
    pmName: (e: { target: { value: string } }) => {
      setPm((current) => (current ? { ...current, name: e.target.value } : current));
      setPmErr('');
    },
    pmCats: SECTIONS.map((c) => {
      const on = pm?.cat === c.id;
      return { label: c.name, cls: chip(on), pressed: on ? 'true' : 'false', go: () => (on ? undefined : (setPm((current) => (current ? { ...current, cat: c.id, curs: [...c.newCurrencies] } : current)), setPmErr(''))) };
    }),
    pmCurs: (SECTIONS.find((category) => category.id === pm?.cat)?.allowedCurrencies ?? []).map((c) => {
      const on = !!pm?.curs.includes(c);
      return { label: c, cls: chip(on), pressed: on ? 'true' : 'false', go: () => (setPm((current) => (current ? { ...current, curs: on ? current.curs.filter((x) => x !== c) : [...current.curs, c] } : current)), setPmErr('')) };
    }),
    pmNoCurs: pm?.cat === 'cards',
    pmSave,
  };
  return vm;
}
