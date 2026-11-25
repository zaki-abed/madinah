/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api';
import { STATUS_LABEL, STATUS_PILL, type AccountStatus } from '../../accountTypes';
import { useBalances } from '../../balances';
import { formatAmount, isNegative } from '../../money';
import '../../styles/account-pages.css';
import { errorMessage } from '../accounts/data';
import { AccountPagesView } from './AccountPagesView';

// صفحات الأنواع الخمس (البنوك، المحافظ المصرية، المحافظ الفلسطينية، Cash Plus، منصات USDT).
// البنية واحدة في لوحاتها، فهي صفحة واحدة عامة منقولة من لوحة BankAccounts.dc.html،
// وتختلف في العنوان والوصف وشريط المجاميع. المنطق بنفس أسماء منطق اللوحة.

export interface PageConfig {
  /** اسم الصفحة في الخادم. */
  page: string;
  title: string;
  sub: string;
  tabsLabel: string;
  emptyText: string;
  /** شريط المجاميع أعلى الصفحة: تسمية مجموع كل عملة. بدونه لا يظهر الشريط (كما في لوحتي البنوك وCash Plus). */
  totals?: { label: string; currencies: Record<string, string> };
}

interface AccountView {
  id: string;
  provider: string;
  name: string;
  status: AccountStatus;
  fields: { label: string; value: string; en: boolean; copy: boolean }[];
  currencies: { id: string; currency: string; balance: string }[];
  documents: { type: string; holder: string; expiry: string | null; note: string | null }[];
  notes: string[];
}
interface Statement {
  currency: string;
  opening: { date: string; balance: string };
  rows: { id: string; date: string; title: string; kind: string; amount: string; balance: string }[];
  totals: { debit: string; credit: string; count: number };
  closing: { date: string; balance: string };
}
type Tab = 'sum' | 'st' | 'dn';

const HIDDEN = '••••••';
const showDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);

/** «هذا الشهر» و«الشهر الماضي» بتوقيت القدس. */
function monthRange(offset: number): [string, string] {
  const [year, month] = today().split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

export function AccountPages({ config }: { config: PageConfig }) {
  const location = useLocation();
  const balances = useBalances();
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [totals, setTotals] = useState<{ currency: string; total: string }[]>([]);
  const [acc, setAcc] = useState('');
  const [cur, setCur] = useState('');
  const [xtab, setXtab] = useState<Tab>('sum');
  const [copied, setCopied] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [pageErr, setPageErr] = useState('');

  const money = (value: string) => (balances.hidden ? HIDDEN : formatAmount(value).replace('−', ''));

  // الحسابات. الرابط «…#معرّف الحساب» يفتح ذلك الحساب مباشرة.
  useEffect(() => {
    let cancelled = false;
    document.title = `${config.title} · مكتب المدينة`;
    setAccounts(null);
    setPageErr('');
    api<{ accounts: AccountView[]; totals: { currency: string; total: string }[] }>('GET', `/api/account-pages/${config.page}`)
      .then((data) => {
        if (cancelled) return;
        setAccounts(data.accounts);
        setTotals(data.totals);
        const wanted = location.hash.slice(1);
        setAcc(data.accounts.find((a) => a.id === wanted)?.id ?? data.accounts[0]?.id ?? '');
        setCur('');
      })
      .catch((caught) => {
        if (!cancelled) setPageErr(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [config.page, config.title, location.hash]);

  const A = accounts?.find((a) => a.id === acc);
  const currency = A?.currencies.find((c) => c.currency === cur) ?? A?.currencies[0];

  // كشف العملة المختارة للفترة المختارة
  useEffect(() => {
    if (!currency) {
      setStatement(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api<Statement>('GET', `/api/account-currencies/${currency.id}/statement?${params}`)
      .then((data) => {
        if (!cancelled) setStatement(data);
      })
      .catch((caught) => {
        if (!cancelled) setPageErr(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [currency?.id, from, to]);

  const doCopy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1600);
  };
  const side = (balance: string) => (isNegative(balance) ? 'سالب' : '');

  // تبويبات الحسابات مجمّعة حسب الجهة
  const accGroups: { name: string; items: any[] }[] = [];
  for (const account of accounts ?? []) {
    let group = accGroups.find((g) => g.name === account.provider);
    if (!group) accGroups.push((group = { name: account.provider, items: [] }));
    const on = account.id === acc;
    group.items.push({
      label: account.name, cls: `xa-acc${on ? ' on' : ''}`, sel: on ? 'true' : 'false',
      go: () => {
        setAcc(account.id);
        setCur('');
        setFrom('');
        setTo('');
        setQ('');
        setCopied('');
      },
      off: account.status !== 'ACTIVE', offTxt: STATUS_LABEL[account.status], offPill: STATUS_PILL[account.status],
    });
  }

  // أقسام الحساب. تطبيق بلا عملات لا كشف له.
  const tabs: [Tab, string][] = [['sum', 'الملخص'], ...(currency ? ([['st', 'الكشف']] as [Tab, string][]) : []), ['dn', 'الوثائق والملاحظات']];
  const tab = tabs.some(([id]) => id === xtab) ? xtab : 'sum';

  const fields = A?.fields ?? [];
  const copyKey = `${acc}*`;
  const query = q.trim().toLowerCase();
  const rows = (statement?.rows ?? []).filter((row) => !query || `${row.title} ${row.kind}`.toLowerCase().includes(query));
  const shown = desc ? [...rows].reverse() : rows;
  const [thisFrom, thisTo] = monthRange(0);
  const [lastFrom, lastTo] = monthRange(-1);
  const presets: [string, string, string][] = [['كل الفترة', '', ''], ['هذا الشهر', thisFrom, thisTo], ['الشهر الماضي', lastFrom, lastTo]];
  const docs = (A?.documents ?? []).map((d) => {
    const n = d.expiry ? daysUntil(d.expiry) : null;
    const state = n === null ? null : n < 0 ? ['منتهية', 'pill bad'] : n <= 60 ? [`تنتهي خلال ${n} يوماً`, 'pill warn'] : ['سارية', 'pill ok'];
    return {
      title: `تم استخدام ${d.type} ${d.holder}`,
      meta: [d.expiry ? `تنتهي ${showDate(d.expiry)}` : 'بدون تاريخ انتهاء', d.note ?? ''].filter(Boolean).join(' · '),
      hasSt: !!state, st: state?.[0] ?? '', pill: state?.[1] ?? '',
    };
  });
  const note = (A?.notes ?? []).join('\n');
  const summary = config.totals;

  const vm: any = {
    title: config.title, sub: config.sub, tabsLabel: config.tabsLabel, pageErr,
    hasTotals: !!summary && totals.length > 0, totalsLabel: summary?.label ?? '',
    totals: totals.map((t) => ({ label: summary?.currencies[t.currency] ?? `مجموع ${t.currency}`, value: `${money(t.total)} ${t.currency}` })),
    isEmpty: accounts !== null && accounts.length === 0, emptyText: config.emptyText, hasAccounts: !!A,
    accGroups,
    xTabs: tabs.map(([id, label]) => ({ label, cls: id === tab ? 'on' : '', sel: id === tab ? 'true' : 'false', go: () => setXtab(id) })),
    xt_sum: tab === 'sum', xt_st: tab === 'st' && !!statement, xt_dn: tab === 'dn',
    stTxt: A ? STATUS_LABEL[A.status] : '', stPill: A ? STATUS_PILL[A.status] : '',
    fields: fields.map((f, index) => {
      const done = copied === `${acc}:${index}`;
      return { label: f.label, val: f.value || '—', vcls: f.en ? 'en' : '', share: f.copy && !!f.value, bcls: `cpy${done ? ' ok2' : ''}`, btn: done ? '✓ نُسخ' : 'نسخ', aria: `نسخ ${f.label}`, copy: () => doCopy(`${acc}:${index}`, f.value) };
    }),
    copyAllCls: `btn mb${copied === copyKey ? ' cdone' : ''}`, copyAllTxt: copied === copyKey ? '✓ نُسخت' : 'نسخ الكل',
    copyAll: () => doCopy(copyKey, fields.filter((f) => f.copy && f.value).map((f) => `${f.label}: ${f.value}`).join('\n')),
    curTabs: (A?.currencies ?? []).map((c) => {
      const on = c.id === currency?.id;
      return { code: c.currency, label: `رصيد ${c.currency}`, bal: `${money(c.balance)} ${c.currency}`, cls: on ? 'on' : '', sel: on ? 'true' : 'false', go: () => setCur(c.currency) };
    }),
    hasFlash: false, flash: '',
    bsName: A ? `${A.provider} – ${A.name}` : '', bsCur: currency?.currency ?? '',
    bsRange: `${from ? showDate(from) : 'بداية الحساب'} – ${to ? showDate(to) : 'اليوم'}`,
    bsFrom: from, bsTo: to, bsQ: q,
    bsOnFrom: (e: { target: { value: string } }) => setFrom(e.target.value),
    bsOnTo: (e: { target: { value: string } }) => setTo(e.target.value),
    bsOnQ: (e: { target: { value: string } }) => setQ(e.target.value),
    bsPresets: presets.map(([label, f, t]) => {
      const on = from === f && to === t;
      return { label, cls: `chipf${on ? ' on' : ''}`, pressed: on ? 'true' : 'false', go: () => { setFrom(f); setTo(t); } };
    }),
    bsSortLabel: desc ? 'الترتيب: الأحدث أولاً' : 'الترتيب: الأقدم أولاً', bsToggleSort: () => setDesc(!desc),
    bsSearching: !!query,
    bsOpenDate: showDate(statement?.opening.date ?? ''), bsOpenBal: statement ? money(statement.opening.balance) : '', bsOpenSide: statement ? side(statement.opening.balance) : '',
    bsRows: shown.map((row) => ({
      d: showDate(row.date), l1: row.title, l2: row.kind === row.title ? '' : row.kind, l3: '', hasL3: false,
      dr: isNegative(row.amount) ? money(row.amount) : '', cr: isNegative(row.amount) ? '' : money(row.amount),
      bal: money(row.balance), side: side(row.balance),
    })),
    bsEmpty: shown.length === 0,
    bsDr: statement ? money(statement.totals.debit) : '', bsCr: statement ? money(statement.totals.credit) : '',
    bsCount: statement ? (statement.totals.count === 1 ? 'حركة واحدة' : statement.totals.count === 2 ? 'حركتان' : `${statement.totals.count} حركات`) : '',
    bsClose: statement ? money(statement.closing.balance) : '', bsCloseSide: statement ? side(statement.closing.balance) : '',
    bsCloseDate: showDate(statement?.closing.date ?? ''),
    xd: { none: docs.length === 0, list: docs, count: docs.length === 0 ? 'لا توجد وثائق' : docs.length === 1 ? 'وثيقة واحدة' : docs.length === 2 ? 'وثيقتان' : `${docs.length} وثائق`, pill: docs.length ? 'pill info' : 'pill neutral' },
    xn: { has: !!note, none: !note, text: note },
  };
  return <AccountPagesView vm={vm} />;
}

/** الصفحات الخمس بعناوينها ونصوصها من لوحاتها. */
export const ACCOUNT_PAGES: Record<string, PageConfig> = {
  '/banks': {
    page: 'banks', title: 'البنوك', sub: 'بيانات كل حساب جاهزة للنسخ والمشاركة · رصيد كل عملة وكشفها',
    tabsLabel: 'الحسابات البنكية', emptyText: 'لا توجد حسابات بنكية بعد.',
  },
  '/egyptian-wallets': {
    page: 'egyptian-wallets', title: 'المحافظ المصرية', sub: 'فودافون كاش وإنستاباي · بيانات كل محفظة جاهزة للنسخ، مع رصيدها وحدودها وكشفها',
    tabsLabel: 'المحافظ', emptyText: 'لا توجد محافظ مصرية بعد.',
    totals: { label: 'ملخص الجنيه', currencies: { EGP: 'مجموع الجنيه في المحافظ' } },
  },
  '/palestinian-wallets': {
    page: 'palestinian-wallets', title: 'المحافظ الفلسطينية', sub: 'JAWWAL Pay وPalPay وMaalchat · بيانات كل محفظة جاهزة للنسخ، مع رصيدها بالشيكل والدولار وحدودها وكشفها',
    tabsLabel: 'المحافظ', emptyText: 'لا توجد محافظ فلسطينية بعد.',
    totals: { label: 'مجموع المحافظ', currencies: { ILS: 'مجموع الشيكل في المحافظ', USD: 'مجموع الدولار في المحافظ' } },
  },
  '/cash-plus': {
    page: 'cash-plus', title: 'Cash Plus', sub: 'منصات الدفع والتحويل · بيانات الحساب جاهزة للنسخ، مع رصيد كل عملة وكشفها',
    tabsLabel: 'حسابات Cash Plus', emptyText: 'لا توجد حسابات في Cash Plus بعد.',
  },
  '/usdt-platforms': {
    page: 'usdt-platforms', title: 'منصات USDT', sub: 'Binance وBybit وKraken · بيانات كل حساب وعناوين الإيداع جاهزة للنسخ، مع رصيده وكشفه',
    tabsLabel: 'حسابات المنصات', emptyText: 'لا توجد حسابات في منصات USDT بعد.',
    totals: { label: 'ملخص USDT', currencies: { USDT: 'مجموع USDT في المنصات' } },
  },
};
