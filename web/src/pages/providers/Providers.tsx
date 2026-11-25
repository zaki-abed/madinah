/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { SECTIONS, accountsCount, providerInitial, sectionOf, type AccountType, type SectionId } from '../../accountTypes';
import '../../styles/providers.css';
import { errorMessage } from '../accounts/data';
import { ProvidersView } from './ProvidersView';

// شاشة «الجهات» (لوحة Providers.dc.html). المنطق منقول من منطق اللوحة بنفس الأسماء،
// والقواعد (الحذف، الإيقاف، أقفال النوع والعملة) تفرضها القاعدة والخادم.

interface ProviderRow {
  id: string;
  name: string;
  type: AccountType;
  currencies: string[];
  isActive: boolean;
  accounts: string[];
  usedCurrencies: string[];
}
interface Editing { mode: 'add' | 'edit'; id?: string; name: string; type: SectionId; curs: string[] }
interface Confirming { kind: 'del' | 'stop' | 'on'; id: string }

const accountsText = (n: number) => (n === 0 ? 'لا توجد حسابات' : accountsCount(n));
const providersText = (n: number) => (n === 1 ? 'جهة واحدة' : n === 2 ? 'جهتان' : `${n} جهات`);

export function Providers() {
  const [all, setAll] = useState<ProviderRow[]>([]);
  const [typeCurrencies, setTypeCurrencies] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState('');
  const [tf, setTf] = useState<SectionId | 'all'>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [m, setM] = useState<Editing | null>(null);
  const [c, setC] = useState<Confirming | null>(null);
  const [err, setErr] = useState('');
  const [pageErr, setPageErr] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ providers: ProviderRow[]; typeCurrencies: Record<string, string[]> }>('GET', '/api/providers');
      setAll(data.providers);
      setTypeCurrencies(data.typeCurrencies);
    } catch (caught) {
      setPageErr(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    document.title = 'الجهات · مكتب المدينة';
    void reload();
  }, [reload]);

  /** عملات النوع المسموحة بترتيب عرضها. */
  const allowedOf = (type: SectionId) => {
    const section = SECTIONS.find((s) => s.id === type)!;
    return typeCurrencies[section.newType] ?? section.allowedCurrencies;
  };
  const query = q.trim().toLowerCase();
  const match = (p: ProviderRow) => !query || p.name.toLowerCase().includes(query);
  const inType = (p: ProviderRow, type: SectionId) => sectionOf(p.type).id === type;

  const chips = [{ id: 'all' as const, name: 'الكل' }, ...SECTIONS].map((t) => ({
    label: t.name,
    n: all.filter((p) => (t.id === 'all' || inType(p, t.id)) && match(p)).length,
    on: tf === t.id ? 'true' : 'false',
    cls: tf === t.id ? 'chipf on' : 'chipf',
    go: () => setTf(t.id),
  }));

  const groups = SECTIONS.filter((t) => tf === 'all' || tf === t.id)
    .map((t) => {
      const rows = all.filter((p) => inType(p, t.id) && match(p)).map((p) => {
        const count = p.accounts.length;
        const isOpen = !!open[p.id];
        const stopped = !p.isActive;
        return {
          name: p.name, letter: providerInitial(p.name), pvStyle: t.iconStyle,
          curs: p.currencies, hasCurs: p.currencies.length > 0, noCurs: p.currencies.length === 0,
          accTxt: accountsText(count), hasAccs: count > 0, accs: p.accounts, isOpen,
          toggleTxt: isOpen ? 'إخفاء الحسابات' : 'عرض الحسابات',
          toggle: () => setOpen({ ...open, [p.id]: !isOpen }),
          st: stopped ? 'موقوفة' : 'نشطة', stPill: stopped ? 'pill neutral' : 'pill ok',
          // PayPal جهة ثابتة: لا تُحذف حتى لو كانت بلا حسابات
          canDelete: count === 0 && p.type !== 'PAYPAL', stopTxt: stopped ? 'إعادة تفعيل' : 'إيقاف',
          edit: () => {
            setM({ mode: 'edit', id: p.id, name: p.name, type: t.id, curs: [...p.currencies] });
            setErr('');
            setFlash('');
          },
          askDel: () => {
            setC({ kind: 'del', id: p.id });
            setFlash('');
          },
          askStop: () => {
            setC({ kind: stopped ? 'on' : 'stop', id: p.id });
            setFlash('');
          },
        };
      });
      return { name: t.name, count: providersText(rows.length), rows };
    })
    .filter((g) => g.rows.length > 0);

  const editing = m?.mode === 'edit' ? all.find((p) => p.id === m.id) : undefined;
  // النوع مقفل إذا على الجهة حسابات، ونوع PayPal ثابت دائماً
  const locked = !!editing && (editing.accounts.length > 0 || editing.type === 'PAYPAL');
  const used = editing?.usedCurrencies ?? [];
  const curOpts = m
    ? allowedOf(m.type).map((code) => {
        const on = m.curs.includes(code);
        const isLocked = on && used.includes(code);
        return {
          code, on: on ? 'true' : 'false', locked: isLocked, mark: on ? ' ✓' : '', title: isLocked ? 'عليها حسابات' : '',
          cls: `cbx${on ? ' on' : ''}${isLocked ? ' dis' : ''}`,
          toggle: () => {
            if (isLocked) return;
            setM({ ...m, curs: on ? m.curs.filter((x) => x !== code) : [...m.curs, code] });
            setErr('');
          },
        };
      })
    : [];

  const target = c ? all.find((p) => p.id === c.id) : undefined;
  const CONFIRM: Record<Confirming['kind'], [string, string, string, string]> = {
    del: ['حذف الجهة', `تُحذف جهة «${target?.name ?? ''}» نهائياً. لا توجد عليها حسابات.`, 'حذف', 'btn danger'],
    stop: ['إيقاف الجهة', `لن تظهر «${target?.name ?? ''}» في «إضافة حساب». حساباتها (${accountsText(target?.accounts.length ?? 0)}) تبقى كما هي وتعمل عادياً.`, 'إيقاف', 'btn pri'],
    on: ['إعادة تفعيل الجهة', `تعود «${target?.name ?? ''}» للظهور في «إضافة حساب».`, 'إعادة تفعيل', 'btn pri'],
  };
  const confirmText = c ? CONFIRM[c.kind] : null;

  const close = () => {
    setM(null);
    setC(null);
    setErr('');
  };

  async function save() {
    if (!m || busy) return;
    setBusy(true);
    try {
      const body = { name: m.name, type: SECTIONS.find((s) => s.id === m.type)!.newType, currencies: m.curs };
      const name = m.name.trim();
      if (m.mode === 'edit') await api('PATCH', `/api/providers/${m.id}`, body);
      else await api('POST', '/api/providers', body);
      await reload();
      setM(null);
      setFlash(m.mode === 'edit' ? `حُفظ تعديل الجهة «${name}».` : `أُضيفت جهة «${name}» وتظهر الآن في «إضافة حساب».`);
    } catch (caught) {
      setErr(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!c || !target || busy) return;
    setBusy(true);
    setPageErr('');
    try {
      if (c.kind === 'del') await api('DELETE', `/api/providers/${c.id}`);
      else await api('POST', `/api/providers/${c.id}/active`, { active: c.kind === 'on' });
      await reload();
      setFlash(c.kind === 'del' ? `حُذفت جهة «${target.name}».` : c.kind === 'stop' ? `أُوقفت جهة «${target.name}».` : `أُعيد تفعيل جهة «${target.name}».`);
    } catch (caught) {
      setPageErr(errorMessage(caught));
    } finally {
      setC(null);
      setBusy(false);
    }
  }

  const vm: any = {
    q, onQ: (e: { target: { value: string } }) => setQ(e.target.value),
    chips, groups, empty: groups.length === 0, flash, pageErr,
    openAdd: () => {
      setM({ mode: 'add', name: '', type: tf !== 'all' ? tf : 'bank', curs: [] });
      setErr('');
      setFlash('');
    },
    mOpen: !!m, mTitle: m?.mode === 'edit' ? 'تعديل الجهة' : 'إضافة جهة', saveTxt: m?.mode === 'edit' ? 'حفظ التعديل' : 'إضافة الجهة',
    mName: m?.name ?? '',
    onName: (e: { target: { value: string } }) => {
      if (m) setM({ ...m, name: e.target.value });
      setErr('');
    },
    mType: m?.type ?? 'bank', typeLocked: locked, typeOpts: SECTIONS.map((s) => ({ id: s.id, name: s.name })),
    onType: (e: { target: { value: string } }) => {
      if (!m || locked) return;
      setM({ ...m, type: e.target.value as SectionId, curs: [] });
      setErr('');
    },
    mNoCurs: !!m && allowedOf(m.type).length === 0, curOpts, hasLocked: curOpts.some((o) => o.locked),
    err, close, save, confirm,
    cOpen: !!confirmText, cTitle: confirmText?.[0] ?? '', cText: confirmText?.[1] ?? '', cBtn: confirmText?.[2] ?? '', cBtnCls: confirmText?.[3] ?? 'btn',
  };
  return <ProvidersView vm={vm} />;
}
