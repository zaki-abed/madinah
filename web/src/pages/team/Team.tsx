/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { accountsCount } from '../../accountTypes';
import { useAuth } from '../../auth';
import '../../styles/team.css';
import { errorMessage } from '../accounts/data';
import { TeamView } from './TeamView';

// شاشة «فريق العمل» (لوحة Team.dc.html): أعضاء الفريق هم من يدخل النظام، وكلهم بصلاحيات كاملة.
// المنطق منقول من منطق اللوحة بنفس الأسماء، والقواعد تفرضها القاعدة والخادم.

interface Member {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  me: boolean;
  lastLoginDate: string | null;
  lastLoginTime: string | null;
  lastLoginDaysAgo: number | null;
  accounts: string[];
  /** له أثر في سجل التدقيق (حتى تسجيل دخول): يُوقَف ولا يُحذف. */
  hasTrace: boolean;
}
interface Editing { mode: 'add' | 'edit' | 'pass'; id?: string; name: string; user: string; pass: string; pass2: string }
interface Confirming { kind: 'stop' | 'on' | 'del'; id: string }

const AVATARS = [
  { background: '#16B8A6', color: '#0B1626' }, { background: '#E6EEF7', color: '#1F3F66' },
  { background: '#FDF0D5', color: '#7A5200' }, { background: '#EAEAF6', color: '#3B3D7A' },
];
const membersText = (n: number) => (n === 1 ? 'عضو واحد' : n === 2 ? 'عضوان' : `${n} أعضاء`);
const lastLogin = (member: Member) =>
  !member.lastLoginDate ? 'لم يدخل بعد'
  : member.lastLoginDaysAgo === 0 ? `اليوم ${member.lastLoginTime}`
  : member.lastLoginDaysAgo === 1 ? `أمس ${member.lastLoginTime}`
  : member.lastLoginDate;

export function Team() {
  const { refresh } = useAuth();
  const [all, setAll] = useState<Member[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [m, setM] = useState<Editing | null>(null);
  const [c, setC] = useState<Confirming | null>(null);
  const [err, setErr] = useState('');
  const [pageErr, setPageErr] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setAll((await api<{ members: Member[] }>('GET', '/api/team')).members);
    } catch (caught) {
      setPageErr(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    document.title = 'فريق العمل · مكتب المدينة';
    void reload();
  }, [reload]);

  const rows = all.map((u, index) => {
    const count = u.accounts.length;
    const isOpen = !!open[u.id];
    const stopped = !u.isActive;
    return {
      name: u.name, user: u.username, letter: u.name.charAt(0), avStyle: AVATARS[index % AVATARS.length], me: u.me,
      accTxt: count === 0 ? 'لا توجد حسابات' : accountsCount(count), hasAccs: count > 0, accs: u.accounts, isOpen,
      toggleTxt: isOpen ? 'إخفاء الحسابات' : 'عرض الحسابات',
      toggle: () => setOpen({ ...open, [u.id]: !isOpen }),
      last: lastLogin(u), st: stopped ? 'موقوف' : 'نشط', stPill: stopped ? 'pill neutral' : 'pill ok',
      canStop: !u.me && (stopped || u.hasTrace || count > 0), stopTxt: stopped ? 'إعادة تفعيل' : 'إيقاف',
      canDelete: !u.me && count === 0 && !u.hasTrace,
      edit: () => {
        setM({ mode: 'edit', id: u.id, name: u.name, user: u.username, pass: '', pass2: '' });
        setErr('');
        setFlash('');
      },
      pass: () => {
        setM({ mode: 'pass', id: u.id, name: u.name, user: u.username, pass: '', pass2: '' });
        setErr('');
        setFlash('');
      },
      askStop: () => {
        setC({ kind: stopped ? 'on' : 'stop', id: u.id });
        setFlash('');
      },
      askDel: () => {
        setC({ kind: 'del', id: u.id });
        setFlash('');
      },
    };
  });

  const target = c ? all.find((u) => u.id === c.id) : undefined;
  const who = target?.name ?? '';
  const CONFIRM: Record<Confirming['kind'], [string, string, string, string]> = {
    stop: ['إيقاف العضو', `لن يستطيع ${who} الدخول إلى النظام. يبقى اسمه في السجلات، ويبقى «المسؤول عنه» في حساباته حتى تغييرها.`, 'إيقاف', 'btn pri'],
    on: ['إعادة تفعيل العضو', `يستطيع ${who} الدخول إلى النظام من جديد بكلمة مروره.`, 'إعادة تفعيل', 'btn pri'],
    del: ['حذف العضو', `يُحذف ${who} نهائياً. ليس له حسابات ولا حركات في النظام.`, 'حذف', 'btn danger'],
  };
  const confirmText = c ? CONFIRM[c.kind] : null;
  const TITLES = { add: ['إضافة عضو', 'إضافة العضو'], edit: ['تعديل بيانات العضو', 'حفظ التعديل'], pass: ['تغيير كلمة المرور', 'حفظ كلمة المرور'] };

  const close = () => {
    setM(null);
    setC(null);
    setErr('');
  };
  const field = (key: keyof Editing) => (e: { target: { value: string } }) => {
    if (m) setM({ ...m, [key]: e.target.value });
    setErr('');
  };

  async function save() {
    if (!m || busy) return;
    setBusy(true);
    try {
      const name = m.name.trim();
      if (m.mode === 'add') {
        await api('POST', '/api/team', { name: m.name, username: m.user, password: m.pass, password2: m.pass2 });
      } else if (m.mode === 'edit') {
        await api('PATCH', `/api/team/${m.id}`, { name: m.name, username: m.user });
      } else {
        await api('POST', `/api/team/${m.id}/password`, { password: m.pass, password2: m.pass2 });
      }
      await reload();
      await refresh(); // الاسم في القائمة الجانبية إذا عدّل العضو بياناته هو
      setM(null);
      setFlash(
        m.mode === 'add' ? `أُضيف ${name} إلى فريق العمل ويستطيع الدخول الآن.`
        : m.mode === 'edit' ? `حُفظ تعديل بيانات ${name}.`
        : `تغيّرت كلمة مرور ${m.name}.`,
      );
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
      if (c.kind === 'del') await api('DELETE', `/api/team/${c.id}`);
      else await api('POST', `/api/team/${c.id}/active`, { active: c.kind === 'on' });
      await reload();
      setFlash(c.kind === 'del' ? `حُذف ${target.name} من فريق العمل.` : c.kind === 'stop' ? `أُوقف ${target.name}.` : `أُعيد تفعيل ${target.name}.`);
    } catch (caught) {
      setPageErr(errorMessage(caught));
    } finally {
      setC(null);
      setBusy(false);
    }
  }

  const vm: any = {
    rows, count: membersText(all.length), flash, pageErr,
    openAdd: () => {
      setM({ mode: 'add', name: '', user: '', pass: '', pass2: '' });
      setErr('');
      setFlash('');
    },
    mOpen: !!m, mTitle: m ? (m.mode === 'pass' ? `${TITLES.pass[0]} · ${m.name}` : TITLES[m.mode][0]) : '', saveTxt: m ? TITLES[m.mode][1] : '',
    showInfo: !!m && m.mode !== 'pass', showPass: !!m && m.mode !== 'edit', passLabel: m?.mode === 'pass' ? 'كلمة المرور الجديدة' : 'كلمة المرور',
    mName: m?.name ?? '', mUser: m?.user ?? '', mPass: m?.pass ?? '', mPass2: m?.pass2 ?? '',
    onName: field('name'), onUser: field('user'), onPass: field('pass'), onPass2: field('pass2'),
    err, close, save, confirm,
    cOpen: !!confirmText, cTitle: confirmText?.[0] ?? '', cText: confirmText?.[1] ?? '', cBtn: confirmText?.[2] ?? '', cBtnCls: confirmText?.[3] ?? 'btn',
  };
  return <TeamView vm={vm} />;
}
