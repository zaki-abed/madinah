import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { STATUS_LABEL, accountsCount, providerPage, sectionOf, type AccountStatus, type AccountType } from '../../accountTypes';
import { useBalances } from '../../balances';
import { formatAmount, isNegative } from '../../money';
import '../../styles/accounts.css';
import { errorMessage } from './data';

interface VaultAccount {
  id: string;
  accountId: string;
  provider: string;
  name: string;
  type: AccountType;
  status: AccountStatus;
  responsible: string | null;
  balance: string;
  share: number;
  lastAmount: string | null;
  lastAt: string | null;
}

interface VaultDetail {
  key: string;
  name: string;
  currency: string;
  total: string;
  accounts: VaultAccount[];
  moves: { id: string; date: string; account: string; description: string | null; amount: string }[];
}

const GREEN = '#136A43';
const RED = '#A3291D';
const HIDDEN = '••••••';

/**
 * تفاصيل خزنة عملة، كما في لوحتي Vault.dc.html و UsdtVault.dc.html.
 * عمود الليميت ومتوسط سعر الشراء يُضافان مع حدود الحسابات وصندوق USDT (المرحلة الخامسة).
 */
export function Vault() {
  const { key = '' } = useParams();
  const balances = useBalances();
  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setVault(null);
    setError('');
    api<VaultDetail>('GET', `/api/vaults/${encodeURIComponent(key)}`)
      .then((data) => {
        if (cancelled) return;
        setVault(data);
        document.title = `${data.name} · مكتب المدينة`;
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const money = (value: string, sign = false) => (balances.hidden ? HIDDEN : formatAmount(value, { sign }));

  if (error) {
    return (
      <main className="main pg-accounts">
        <div className="err" role="alert">{error}</div>
        <Link to="/accounts">الحسابات والخزائن ←</Link>
      </main>
    );
  }
  if (!vault) return <main className="main pg-accounts" />;

  return (
    <main className="main pg-accounts">
      <nav aria-label="مسار الصفحة" style={{ fontSize: '14px' }} className="sub">
        <Link to="/" style={{ textDecoration: 'none', fontWeight: 600 }}>لوحة التحكم</Link>{' '}
        <span aria-hidden="true">‹</span> {vault.name}
      </nav>

      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '16px', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '32px', lineHeight: '44px', fontWeight: 700 }}>{vault.name}</h1>
            <span className="code">{vault.currency}</span>
          </div>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            رصيد الخزنة هو مجموع الحسابات التابعة لها، ولا يُحسب كرصيد مستقل
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link className="btn" to="/accounts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            إضافة حساب
          </Link>
          <Link className="btn acc" to="/internal-transfer">نقل بين الحسابات</Link>
        </div>
      </header>

      <section className="card" style={{ padding: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }} className="sub">إجمالي الخزنة</div>
          <div className="amt" style={{ fontSize: '30px', lineHeight: '42px', textAlign: 'end', whiteSpace: 'nowrap' }}>
            {money(vault.total)} {vault.currency}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', flex: '3 1 560px' }}>
          <span style={{ fontSize: '24px', color: '#4A5A70' }} aria-hidden="true">=</span>
          {vault.accounts.map((account, index) => (
            <Fragment key={account.id}>
              {index > 0 ? <span style={{ fontSize: '24px', color: '#4A5A70' }} aria-hidden="true">+</span> : null}
              <div className="part">
                <span className="cap">{account.provider} – {account.name}</span>
                <b className="amt" style={{ fontSize: '18px', textAlign: 'end' }}>{money(account.balance)}</b>
              </div>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '22px', lineHeight: '32px', fontWeight: 700 }}>الحسابات التابعة</h2>
          <span className="pill neutral">{accountsCount(vault.accounts.length)}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>الحساب</th><th>النوع</th><th>الرصيد</th><th>الحصة</th><th>آخر حركة</th>
                <th><span className="vh">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {vault.accounts.map((account) => {
                const page = providerPage({ name: account.provider, type: account.type });
                return (
                  <tr key={account.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {account.provider} – {account.name}
                        {account.status !== 'ACTIVE' ? ` (${STATUS_LABEL[account.status]})` : ''}
                      </div>
                      {account.responsible ? <div className="cap">صاحب الحساب: {account.responsible}</div> : null}
                    </td>
                    <td>
                      <span className={account.type === 'BANK' ? 'pill info' : 'pill neutral'}>{sectionOf(account.type).typeLabel}</span>
                    </td>
                    <td><b className="amt" style={{ fontSize: '15px' }}>{money(account.balance)} {vault.currency}</b></td>
                    <td style={{ minWidth: '150px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="bar" style={{ flex: 1 }}>
                          <span style={{ width: `${account.share}%`, background: '#142B4A', borderRadius: '999px' }} />
                        </div>
                        <span className="amt cap">{account.share}%</span>
                      </div>
                    </td>
                    <td>
                      {account.lastAmount ? (
                        <>
                          <div className="amt" style={{ color: isNegative(account.lastAmount) ? RED : GREEN }}>
                            {money(account.lastAmount, true)}
                          </div>
                          <div className="cap">{account.lastAt}</div>
                        </>
                      ) : (
                        <span className="cap" style={{ color: '#9FB0C6' }}>لا توجد حركات</span>
                      )}
                    </td>
                    <td>
                      {page ? (
                        <Link to={`${page}#${account.accountId}`} style={{ fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>
                          كشف الحساب
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {vault.accounts.length === 0 ? (
                <tr><td colSpan={6} className="sub" style={{ textAlign: 'center' }}>لا توجد حسابات في هذه الخزنة</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px' }}>
          <h2 style={{ margin: 0, fontSize: '22px', lineHeight: '32px', fontWeight: 700 }}>آخر الحركات في الخزنة</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>التاريخ</th><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>
            </thead>
            <tbody>
              {vault.moves.map((move) => (
                <tr key={move.id}>
                  <td className="amt">{move.date}</td>
                  <td>{move.account}</td>
                  <td>{move.description}</td>
                  <td>
                    <b className="amt" style={{ color: isNegative(move.amount) ? RED : GREEN }}>
                      {money(move.amount, true)} {vault.currency}
                    </b>
                  </td>
                </tr>
              ))}
              {vault.moves.length === 0 ? (
                <tr><td colSpan={4} className="sub" style={{ textAlign: 'center' }}>لا توجد حركات بعد</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
