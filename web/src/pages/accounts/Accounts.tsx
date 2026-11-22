import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SECTIONS,
  STATUS_LABEL,
  STATUS_PILL,
  accountsCount,
  countWord,
  providerPage,
  type SectionId,
} from '../../accountTypes';
import { useAuth } from '../../auth';
import { useBalances } from '../../balances';
import { formatAmount, sumAmounts } from '../../money';
import '../../styles/accounts.css';
import { AddAccountModal } from './AddAccountModal';
import { ManageAccountModal } from './ManageAccountModal';
import { useAccounts, type Account, type Provider } from './data';

const CURRENCY_ORDER = ['USD', 'ILS', 'JOD', 'EGP', 'EUR', 'USDT'];
const HIDDEN = '••••••';

/** مجموع أرصدة مجموعة حسابات لكل عملة، بترتيب العملات في التصميم. */
function totalsOf(accounts: Account[]): { currency: string; total: string }[] {
  const byCurrency = new Map<string, string[]>();
  for (const account of accounts) {
    for (const c of account.currencies) {
      byCurrency.set(c.currency, [...(byCurrency.get(c.currency) ?? []), c.balance]);
    }
  }
  return CURRENCY_ORDER.filter((c) => byCurrency.has(c)).map((currency) => ({
    currency,
    total: sumAmounts(byCurrency.get(currency)!),
  }));
}

/** صفحة «الحسابات والخزائن» كما في لوحة Accounts.dc.html. */
export function Accounts() {
  const { user } = useAuth();
  const balances = useBalances();
  const { data, error, reload } = useAccounts();
  const [view, setView] = useState<'type' | 'cur'>('type');
  const [filter, setFilter] = useState<SectionId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Partial<Record<SectionId, boolean>>>({});
  const [flash, setFlash] = useState('');
  const [adding, setAdding] = useState<{ section: SectionId; providerId?: string } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'الحسابات والخزائن · مكتب المدينة';
  }, []);

  const money = (value: string) => (balances.hidden ? HIDDEN : formatAmount(value));
  const providers = data?.providers ?? [];
  const accounts = data?.accounts ?? [];
  const providerOf = (account: Account): Provider => providers.find((p) => p.id === account.providerId)!;

  const q = query.trim();
  const matches = (account: Account) => !q || `${providerOf(account).name} ${account.name}`.includes(q);

  const sections = SECTIONS.filter((s) => filter === 'all' || filter === s.id)
    .map((section) => {
      const list = accounts.filter((a) => section.types.includes(providerOf(a).type) && matches(a));
      const sectionProviders = providers.filter((p) => list.some((a) => a.providerId === p.id));
      return { section, list, sectionProviders, isOpen: !!open[section.id] || !!q };
    })
    .filter((s) => s.list.length > 0);

  const managed = managing ? accounts.find((a) => a.id === managing) : undefined;

  async function done(message: string, section?: SectionId) {
    setAdding(null);
    setManaging(null);
    await reload();
    setFlash(message);
    if (section) {
      setView('type');
      setOpen((current) => ({ ...current, [section]: true }));
    }
  }

  return (
    <main className="main pg-accounts">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', lineHeight: '44px', fontWeight: 700 }}>الحسابات والخزائن</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            المكان الوحيد لإضافة الحسابات وتعديلها وتغيير حالتها · صفحات المنصات (PayPal وغيرها) تعرض نفس الحسابات ونفس الأرصدة · لا يوجد كاش في النظام
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="vh">بحث</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFilter('all');
              }}
              placeholder="ابحث عن حساب أو منصة"
            />
          </label>
          {user?.permissions.canEdit ? (
            <button
              className="btn acc"
              type="button"
              onClick={() => {
                setFlash('');
                setAdding({ section: filter === 'all' ? 'bank' : filter });
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              إضافة حساب
            </button>
          ) : null}
        </div>
      </header>

      {flash ? <div className="flash" role="status">{flash}</div> : null}
      {error ? <div className="err" role="alert">{error}</div> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="طريقة العرض">
          <button type="button" role="tab" className={view === 'type' ? 'on' : ''} aria-selected={view === 'type'} onClick={() => setView('type')}>
            حسب النوع
          </button>
          <button type="button" role="tab" className={view === 'cur' ? 'on' : ''} aria-selected={view === 'cur'} onClick={() => setView('cur')}>
            حسب العملة (الخزائن)
          </button>
        </div>
        {view === 'type' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} role="group" aria-label="تصفية حسب النوع">
            {[{ id: 'all' as const, name: 'الكل' }, ...SECTIONS].map((chip) => {
              const on = filter === chip.id;
              const count =
                chip.id === 'all'
                  ? accounts.length
                  : accounts.filter((a) => SECTIONS.find((s) => s.id === chip.id)!.types.includes(providerOf(a).type)).length;
              return (
                <button key={chip.id} type="button" className={on ? 'chipf on' : 'chipf'} aria-pressed={on} onClick={() => setFilter(chip.id)}>
                  {chip.name} <span className="amt" style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {view === 'type' && data ? (
        <>
          {sections.length === 0 ? (
            <div className="card sub" style={{ padding: '28px', textAlign: 'center' }}>
              {accounts.length === 0 ? 'لا توجد حسابات بعد' : 'لا توجد حسابات مطابقة للبحث'}
            </div>
          ) : null}
          {sections.map(({ section, list, sectionProviders, isOpen }) => (
            <section className="par" aria-label={section.name} key={section.id}>
              <button
                type="button"
                className="parh pbtn"
                aria-expanded={isOpen}
                onClick={() => setOpen({ ...open, [section.id]: !isOpen })}
              >
                <span className="ic" style={section.iconStyle}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={section.icon} />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '20px', lineHeight: '30px', fontWeight: 700 }}>{section.name}</span>
                  <span className="cap" style={{ fontSize: '13px' }}>
                    {section.sub} · {countWord(sectionProviders.length, section.providersWord)} · {accountsCount(list.length)}
                  </span>
                </span>
                <span className="pchev" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen ? (
                <div className="pgrid">
                  {sectionProviders.map((provider) => {
                    const own = list
                      .filter((a) => a.providerId === provider.id)
                      .sort((x, y) => Number(x.status !== 'ACTIVE') - Number(y.status !== 'ACTIVE'));
                    const inactive = own.filter((a) => a.status !== 'ACTIVE').length;
                    const page = providerPage(provider);
                    return (
                      <div className="prov" key={provider.id}>
                        <div className="provh">
                          <span className="pav" aria-hidden="true">{provider.name.charAt(0).toUpperCase()}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: '17px', lineHeight: '24px' }}>{provider.name}</b>
                            <div className="cap">
                              {accountsCount(own.length)}
                              {inactive ? ` · ${inactive === 1 ? 'واحد غير نشط' : `${inactive} غير نشطة`}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="ptots">
                          {totalsOf(own).map((t) => (
                            <span className="tot" key={t.currency}>
                              <span className="code">{t.currency}</span>
                              <b className="amt">{money(t.total)}</b>
                            </span>
                          ))}
                        </div>
                        {own.map((account) => {
                          const off = account.status !== 'ACTIVE';
                          return (
                            <div className={off ? 'acb stp' : 'acb'} key={account.id}>
                              <div className="ach">
                                <b className="anm" style={{ fontSize: '15px', fontWeight: 600 }}>{account.name}</b>
                                {off ? (
                                  <span className={STATUS_PILL[account.status]}>
                                    {STATUS_LABEL[account.status]}
                                    {account.statusSince ? ` منذ ${account.statusSince}` : ''}
                                  </span>
                                ) : null}
                                <span className="aact">
                                  {page ? (
                                    <Link className="lk" to={`${page}#${account.id}`}>صفحة الحساب ←</Link>
                                  ) : null}
                                  {user?.permissions.canEdit ? (
                                    <button
                                      type="button"
                                      className="sbtn"
                                      aria-label="تعديل الحساب"
                                      onClick={() => {
                                        setFlash('');
                                        setManaging(account.id);
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M4 20h4L19 9l-4-4L4 16z" />
                                      </svg>
                                      تعديل
                                    </button>
                                  ) : null}
                                </span>
                              </div>
                              {account.currencies.map((c) => (
                                <div className="cl" key={c.id}>
                                  <span className="code">{c.currency}</span>
                                  <b className="amt" style={{ fontSize: '16px', fontWeight: 600 }}>{money(c.balance)}</b>
                                  <span className="cap">
                                    افتتاحي <span className="amt">{money(c.initialBalance)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        {user?.permissions.canEdit ? (
                          <button
                            type="button"
                            className="addl"
                            onClick={() => {
                              setFlash('');
                              setAdding({ section: section.id, providerId: provider.id });
                            }}
                          >
                            + حساب في {provider.name}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </>
      ) : null}

      {view === 'cur' && data ? (
        <>
          <p className="cap" style={{ margin: 0, fontSize: '13px' }}>
            الخزنة = مجموع أرصدة كل الحسابات بنفس العملة، مهما كان نوعها.
          </p>
          {data.vaults.length === 0 ? (
            <div className="card sub" style={{ padding: '28px', textAlign: 'center' }}>لا توجد حسابات بعد</div>
          ) : null}
          <div className="vgrid">
            {data.vaults.map((vault) => (
              <Link className="vc" to={vault.key === 'PAYPAL' ? '/paypal' : `/vaults/${vault.key}`} key={vault.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: '16px' }}>{vault.name}</b>
                  <span className="code">{vault.currency}</span>
                </div>
                <div className="amt" style={{ fontSize: '26px', lineHeight: '34px', textAlign: 'end', fontWeight: 600 }}>
                  {money(vault.total)} {vault.currency}
                </div>
                <span className="cap">{accountsCount(vault.count)}</span>
                <div>
                  {vault.top.map((row, index) => (
                    <div className="vrow" key={index}>
                      <span>
                        {row.name}
                        {row.status !== 'ACTIVE' ? ` (${STATUS_LABEL[row.status]})` : ''}
                      </span>
                      <b className="amt">{money(row.balance)}</b>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {adding ? (
        <AddAccountModal
          providers={providers}
          initial={adding}
          onClose={() => setAdding(null)}
          onSaved={(message, section) => void done(message, section)}
        />
      ) : null}

      {managed ? (
        <ManageAccountModal
          key={managed.id}
          account={managed}
          providers={providers}
          canDelete={!!user?.permissions.canDelete}
          onClose={() => setManaging(null)}
          onDone={(message, section) => void done(message, section)}
        />
      ) : null}
    </main>
  );
}
