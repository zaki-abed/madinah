import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  SECTIONS,
  STATUSES,
  STATUS_LABEL,
  STATUS_PILL,
  sectionOf,
  type AccountStatus,
  type SectionId,
} from '../../accountTypes';
import { formatAmount } from '../../money';
import { errorMessage, movementsText, type Account, type Provider } from './data';

const NEW = '@new';

interface LogEntry {
  at: string;
  by: string;
  kind: 'add' | 'edit' | 'cur' | 'st';
  what: string;
}

const LOG_KIND: Record<LogEntry['kind'], [string, string]> = {
  add: ['إضافة', 'pill teal'],
  edit: ['تعديل', 'pill neutral'],
  cur: ['إضافة عملة', 'pill info'],
  st: ['تغيير الحالة', 'pill warn'],
};

interface Props {
  account: Account;
  providers: Provider[];
  onClose(): void;
  /** بعد حفظ ناجح: رسالة تظهر أعلى الصفحة، والقسم الذي يُفتح. */
  onDone(flash: string, section?: SectionId): void;
}

/** نافذة «تعديل» من لوحة Accounts.dc.html: البيانات والحالة، وسجل التدقيق. */
export function ManageAccountModal({ account, providers, onClose, onDone }: Props) {
  const current = providers.find((p) => p.id === account.providerId)!;
  const title = `${current.name} – ${account.name}`;

  const [tab, setTab] = useState<'data' | 'log'>('data');
  const [sectionId, setSectionId] = useState<SectionId>(sectionOf(current.type).id);
  const [providerChoice, setProviderChoice] = useState(current.id);
  const [providerName, setProviderName] = useState('');
  const [name, setName] = useState(account.name);
  const [adding, setAdding] = useState<string[]>([]);
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [nextStatus, setNextStatus] = useState<AccountStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ log: LogEntry[] }>('GET', `/api/accounts/${account.id}/log`)
      .then((data) => {
        if (!cancelled) setLog(data.log);
      })
      .catch(() => {
        if (!cancelled) setLog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  const section = SECTIONS.find((s) => s.id === sectionId)!;
  // الجهة الموقوفة لا يُنقل إليها حساب (تبقى ظاهرة إن كانت جهة الحساب الحالية)
  const options = providers.filter((p) => section.types.includes(p.type) && (p.isActive || p.id === account.providerId));
  const choice = providerChoice === NEW || options.some((p) => p.id === providerChoice) ? providerChoice : (options[0]?.id ?? NEW);
  const isNew = choice === NEW;
  const target = options.find((p) => p.id === choice);
  const available = isNew ? section.newCurrencies : (target?.currencies ?? []);
  const have = account.currencies.map((c) => c.currency);
  const addable = available.filter((c) => !have.includes(c));
  const toAdd = adding.filter((c) => addable.includes(c));
  const off = account.status !== 'ACTIVE';
  const hasCurrencies = account.currencies.length > 0;

  const clear = () => setError('');

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const result = await api<{ title: string }>('PATCH', `/api/accounts/${account.id}`, {
        ...(isNew ? { newProvider: { name: providerName, type: section.newType } } : { providerId: choice }),
        name,
        addCurrencies: toAdd.map((currency) => ({ currency, initialBalance: opening[currency] ?? '' })),
      });
      onDone(`حُفظت التعديلات على «${result.title}» وتظهر في كل الصفحات.`, sectionId);
    });

  const changeStatus = () =>
    run(async () => {
      if (!nextStatus) return;
      await api('POST', `/api/accounts/${account.id}/status`, { status: nextStatus });
      onDone(
        `أصبحت حالة «${title}»: ${STATUS_LABEL[nextStatus]}` +
          (nextStatus === 'ACTIVE'
            ? '، وهو متاح للحركات الجديدة.'
            : `. لن يظهر في الحركات الجديدة${hasCurrencies ? '، ويبقى رصيده وكشفه كما هما.' : '.'}`),
      );
    });

  const remove = () =>
    run(async () => {
      await api('DELETE', `/api/accounts/${account.id}`);
      onDone(`حُذف «${title}» (لم تكن عليه أي حركة مالية).`);
    });

  return (
    <div className="ov" role="dialog" aria-modal="true" aria-label="إدارة الحساب">
      <div className="modal" style={{ maxWidth: '700px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '22px', lineHeight: '32px', fontWeight: 700 }}>{title}</h2>
              <span className={STATUS_PILL[account.status]}>{STATUS_LABEL[account.status]}</span>
            </div>
            <p className="cap" style={{ margin: '2px 0 0', fontSize: '13px' }}>
              {sectionOf(current.type).name} ·{' '}
              {account.movementsCount ? `عليه ${movementsText(account.movementsCount)}` : 'لا توجد عليه حركات مالية بعد'}
            </p>
          </div>
          <button className="x" type="button" aria-label="إغلاق" onClick={onClose}>×</button>
        </div>

        <div className="tabs" role="tablist" aria-label="أقسام إدارة الحساب">
          <button type="button" role="tab" className={tab === 'data' ? 'on' : ''} aria-selected={tab === 'data'} onClick={() => setTab('data')}>
            البيانات والحالة
          </button>
          <button type="button" role="tab" className={tab === 'log' ? 'on' : ''} aria-selected={tab === 'log'} onClick={() => setTab('log')}>
            سجل التدقيق{log ? ` (${log.length})` : ''}
          </button>
        </div>

        {tab === 'data' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '12px' }}>
              <label className="f">
                النوع
                <select
                  value={sectionId}
                  disabled={account.hasMovements}
                  onChange={(e) => {
                    setSectionId(e.target.value as SectionId);
                    setProviderChoice('');
                    clear();
                  }}
                >
                  {SECTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="f">
                البنك / المنصة
                <select
                  value={choice}
                  disabled={account.hasMovements}
                  onChange={(e) => {
                    setProviderChoice(e.target.value);
                    clear();
                  }}
                >
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value={NEW}>+ جديد…</option>
                </select>
              </label>
            </div>
            {account.hasMovements ? (
              <span className="hint">لا يمكن نقل حساب عليه حركات إلى نوع آخر أو جهة أخرى.</span>
            ) : null}

            {isNew ? (
              <label className="f">
                اسم البنك / المنصة الجديدة
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => {
                    setProviderName(e.target.value);
                    clear();
                  }}
                />
              </label>
            ) : null}

            <label className="f">
              اسم الحساب
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clear();
                }}
              />
            </label>

            {current.type !== 'CARD_APP' ? (
              <div className="f">
                <span>العملات في الحساب</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {account.currencies.map((c) => (
                    <span className="tot" key={c.id}>
                      <span className="code">{c.currency}</span>
                      <b className="amt">{formatAmount(c.balance)}</b>
                    </span>
                  ))}
                </div>
                {addable.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    <span className="hint">إضافة عملة:</span>
                    {addable.map((currency) => {
                      const on = toAdd.includes(currency);
                      return (
                        <button
                          key={currency}
                          type="button"
                          className={on ? 'chipf on' : 'chipf'}
                          aria-pressed={on}
                          onClick={() => {
                            setAdding(on ? toAdd.filter((c) => c !== currency) : [...toAdd, currency]);
                            clear();
                          }}
                        >
                          + {currency}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {toAdd.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px' }}>
                {toAdd.map((currency) => (
                  <label className="f" key={currency}>
                    <span>رصيد افتتاحي {currency}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="amt"
                      style={{ textAlign: 'left' }}
                      value={opening[currency] ?? ''}
                      onChange={(e) => {
                        setOpening({ ...opening, [currency]: e.target.value });
                        clear();
                      }}
                      placeholder="0.00"
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <span className="hint">أي تعديل هنا يظهر مباشرة في كل الصفحات التي تعرض هذا الحساب</span>
            {error ? <div className="err" role="alert">{error}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn pri" type="button" onClick={() => void save()} disabled={busy}>حفظ التعديلات</button>
            </div>

            <div className="mgbox" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
              <div className="mgt" style={{ flex: 'none' }}>
                <b>حالة الحساب</b>
                <span className="cap" style={{ fontSize: '13px' }}>
                  الحالة الحالية: {STATUS_LABEL[account.status]} {account.statusSince ? `منذ ${account.statusSince}` : ''} ·{' '}
                  {off
                    ? 'لا يظهر هذا الحساب في الحوالات والنقل الداخلي الجديد · رصيده وحركاته ظاهرة في الكشف والتقارير'
                    : 'متاح للحوالات والنقل الداخلي'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} role="group" aria-label="حالة الحساب">
                {STATUSES.map((status) => {
                  const on = (nextStatus ?? account.status) === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={on ? 'chipf on' : 'chipf'}
                      aria-pressed={on}
                      onClick={() => {
                        setNextStatus(status === account.status ? null : status);
                        setConfirmDelete(false);
                        clear();
                      }}
                    >
                      {STATUS_LABEL[status]}
                    </button>
                  );
                })}
              </div>
            </div>

            {nextStatus ? (
              <div className="mgcf" style={{ background: '#FDF0D5', color: '#7A5200' }}>
                <b>تغيير حالة «{title}» إلى «{STATUS_LABEL[nextStatus]}»؟</b>
                <span>
                  {nextStatus !== 'ACTIVE'
                    ? `لن يظهر في الحوالات والنقل الداخلي الجديد${hasCurrencies ? '، ويبقى رصيده وحركاته كما هي.' : '.'}`
                    : 'يصبح متاحاً للحوالات والنقل الداخلي الجديد.'}
                </span>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn" type="button" onClick={() => setNextStatus(null)}>تراجع</button>
                  <button className="btn pri" type="button" onClick={() => void changeStatus()} disabled={busy}>تأكيد</button>
                </div>
              </div>
            ) : null}

            {!account.hasMovements ? (
              <>
                <div className="mgbox" style={{ borderColor: '#F3D3CF', background: '#FFF8F7' }}>
                  <div className="mgt">
                    <b style={{ color: '#A3291D' }}>حذف الحساب</b>
                    <span className="cap" style={{ fontSize: '13px' }}>
                      لم تُسجَّل على هذا الحساب أي حركة مالية، لذلك يمكن حذفه نهائياً.
                    </span>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    style={{ color: '#A3291D' }}
                    onClick={() => {
                      setConfirmDelete(true);
                      setNextStatus(null);
                    }}
                  >
                    حذف الحساب
                  </button>
                </div>
                {confirmDelete ? (
                  <div className="mgcf" style={{ background: '#FBE7E5', color: '#A3291D' }}>
                    <b>حذف «{title}» نهائياً؟</b>
                    <span>يُحذف الحساب من النظام ومن صفحة المنصة، ولا يمكن استرجاعه.</span>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>تراجع</button>
                      <button className="btn red" type="button" onClick={() => void remove()} disabled={busy}>تأكيد الحذف</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {account.hasMovements ? (
              <p className="cap" style={{ margin: 0, fontSize: '13px' }}>
                لا يمكن حذف هذا الحساب لأن عليه {movementsText(account.movementsCount)}. يمكن تغيير حالته إلى «مغلق» بدلاً من الحذف.
              </p>
            ) : null}
          </>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lgt">
              <thead>
                <tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th></tr>
              </thead>
              <tbody>
                {(log ?? []).map((entry, index) => (
                  <tr key={index}>
                    <td className="amt" style={{ whiteSpace: 'nowrap' }}>{entry.at}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{entry.by}</td>
                    <td><span className={LOG_KIND[entry.kind][1]}>{LOG_KIND[entry.kind][0]}</span></td>
                    <td>{entry.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
