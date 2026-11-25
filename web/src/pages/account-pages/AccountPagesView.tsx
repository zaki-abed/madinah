/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/** العرض منقول من لوحة BankAccounts.dc.html (الهيكل والأصناف والنصوص)، وقيمه وأفعاله من منطق الصفحة. */
export function AccountPagesView({ vm }: { vm: any }) {
  const { title, sub, tabsLabel, pageErr, hasTotals, totalsLabel, totals, isEmpty, emptyText, hasAccounts, accGroups, bsClose, bsCloseDate, bsCloseSide, bsCount, bsCr, bsCur, bsDr, bsEmpty, bsFrom, bsName, bsOnFrom, bsOnQ, bsOnTo, bsOpenBal, bsOpenDate, bsOpenSide, bsPresets, bsQ, bsRange, bsRows, bsSearching, bsSortLabel, bsTo, bsToggleSort, copyAll, copyAllTxt, curTabs, fields, flash, hasFlash, stPill, stTxt, xTabs, xd, xn, xt_dn, xt_st, xt_sum } = vm;
  return (
    <div className="pg-accpages" style={{ display: 'contents' }}>
<main className="main">
  <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
    <div>
      <h1 style={{ margin: '0', fontSize: '32px', lineHeight: '44px', fontWeight: '700' }}>{title}</h1>
      <p className="sub" style={{ margin: '4px 0 0' }}>{sub}</p>
    </div>
  </header>

  {pageErr && (<div className="flash" role="alert" style={{ background: '#FBE7E5', color: '#A3291D' }}>{pageErr}</div>)}

  {hasTotals && (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 22px', padding: '12px 16px', borderRadius: '14px', background: '#fff', border: '1px solid #E1E6EE', fontSize: '13px' }} aria-label={totalsLabel}>
    {totals.map((t: any, t_i: number) => (<span className="sub" key={t_i}>{t.label} <b className="amt" style={{ color: '#142B4A', fontSize: '15px' }}>{t.value}</b></span>))}
  </div>
  )}

  {isEmpty && (
  <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
    <p className="sub" style={{ margin: '0 0 12px' }}>{emptyText}</p>
    <Link className="btn pri" to="/accounts/new" style={{ textDecoration: 'none' }}>إضافة حساب</Link>
  </div>
  )}

  {hasAccounts && (<>
  <div className="xa-accs" role="tablist" aria-label={tabsLabel}>
    {accGroups.map((g: any, g_i: number) => (<Fragment key={g_i}><div className="xa-ag"><span className="xa-agl">{g.name}</span><div className="xa-chips">{g.items.map((a: any, a_i: number) => (<Fragment key={a_i}><button type="button" role="tab" className={a.cls} aria-selected={a.sel} onClick={a.go}>{a.label}{a.off && (<><span className={a.offPill}>{a.offTxt}</span></>)}</button></Fragment>))}</div></div></Fragment>))}
  </div>

  <div className="xa-tabs" role="tablist" aria-label="أقسام الحساب">{xTabs.map((t: any, t_i: number) => (<Fragment key={t_i}><button type="button" role="tab" className={t.cls} aria-selected={t.sel} onClick={t.go}>{t.label}</button></Fragment>))}</div>

{xt_sum && (<>
<section className="sg">
 <div className="card sp" aria-label="بيانات الحساب">
  <div className="sp-h"><div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><h3>بيانات الحساب</h3><span className={stPill}>{stTxt}</span></div><button type="button" className="cl2" onClick={copyAll}>{copyAllTxt}</button></div>
  {fields.map((f: any, f_i: number) => (<Fragment key={f_i}><div className="sr">
   <span className="cap" style={{ flex: 'none', width: '150px', fontSize: '13px' }}>{f.label}</span>
   <b className="sv">{f.val}</b>
   {f.share && (<><button type="button" className="cl2" onClick={f.copy} aria-label={f.aria}>{f.btn}</button></>)}
  </div></Fragment>))}
 </div>
</section>
</>)}

{xt_st && (<>
  <div className="xa-curbar"><span className="cap" style={{ fontWeight: '600' }}>العملة</span><div className="xa-seg" role="tablist" aria-label="العملة">{curTabs.map((t: any, t_i: number) => (<Fragment key={t_i}><button type="button" role="tab" className={t.cls} aria-selected={t.sel} onClick={t.go}>{t.code}</button></Fragment>))}</div></div>

  <section className="stats4" aria-label="ملخص الفترة">
    <div className="s4"><span className="cap" style={{ fontWeight: '600' }}>رصيد أول الفترة</span><span className="v">{bsOpenBal}</span><span className="cap amt">{bsOpenDate}</span></div>
    <span className="op4" aria-hidden="true">+</span>
    <div className="s4"><span className="cap" style={{ fontWeight: '600' }}>الداخل</span><span className="v" style={{ color: '#136A43' }}>{bsCr}</span><span className="cap">دائن</span></div>
    <span className="op4" aria-hidden="true">−</span>
    <div className="s4"><span className="cap" style={{ fontWeight: '600' }}>الخارج</span><span className="v" style={{ color: '#A3291D' }}>{bsDr}</span><span className="cap">مدين</span></div>
    <span className="op4" aria-hidden="true">=</span>
    <div className="s4" style={{ borderTop: '3px solid #16B8A6' }}><span style={{ fontSize: '12px', fontWeight: '600', color: '#4A5A70' }}>الرصيد آخر الفترة</span><span className="v">{bsClose}</span><span className="amt" style={{ fontSize: '12px', color: '#4A5A70' }}>{bsCloseDate}</span></div>
  </section>

<section className="card" style={{ overflow: 'hidden' }} aria-label="كشف الحساب">
 <div className="bshead">
  <div><h2 style={{ margin: '0', fontSize: '20px', lineHeight: '30px', fontWeight: '700' }}>كشف حساب <span className="en" style={{ fontSize: '13px', fontWeight: '600', color: '#4A5A70' }}>Account Statement</span></h2><div className="cap" style={{ fontSize: '13px' }}>{bsName} · العملة <b className="en">{bsCur}</b> · الفترة <span className="amt">{bsRange}</span></div></div>
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button type="button" className="btn mb" disabled title="قريباً"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>تحميل Excel</button><button type="button" className="btn mb" disabled title="قريباً"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>تحميل PDF</button></div>
 </div>
 {hasFlash && (<><div className="bsnote" style={{ background: '#E2F4EC', color: '#136A43', borderColor: '#BFE3CF' }}>{flash}</div></>)}
 <div className="bstool">
  <label className="bsf"><span>من</span><input type="date" value={bsFrom} onChange={bsOnFrom} /></label>
  <label className="bsf"><span>إلى</span><input type="date" value={bsTo} onChange={bsOnTo} /></label>
  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} role="group" aria-label="فترات جاهزة">{bsPresets.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} style={{ height: '34px', fontSize: '12px' }} onClick={c.go} aria-pressed={c.pressed}>{c.label}</button></Fragment>))}</div>
  <label className="bss"><span className="vh">بحث</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" value={bsQ} onChange={bsOnQ} placeholder="بحث برقم العملية أو الطرف" /></label>
  <button type="button" className="btn mb" onClick={bsToggleSort}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/></svg>{bsSortLabel}</button>
 </div>
 {bsSearching && (<><div className="bsnote">تُعرض نتائج البحث فقط · الرصيد الجاري لكل صف محسوب على كل الحركات، والرصيد الختامي لكامل الفترة</div></>)}
 <div style={{ overflow: 'auto', maxHeight: '560px' }}><table className="bst" dir="rtl">
  <thead><tr><th style={{ width: '84px' }}>التاريخ<small>Date</small></th><th className="ar">البيان<small>Description</small></th><th className="n" style={{ width: '120px' }}>مدين<small>Debit · خارج</small></th><th className="n" style={{ width: '120px' }}>دائن<small>Credit · داخل</small></th><th className="n" style={{ width: '150px' }}>الرصيد الجاري<small>Current Balance</small></th></tr></thead>
  <tbody>
   <tr className="ob"><td className="dt">{bsOpenDate}</td><td className="ar"><b>رصيد افتتاحي</b> <span className="en" style={{ color: '#4A5A70', fontSize: '12px' }}>Opening Balance</span></td><td className="n"></td><td className="n"></td><td className="n"><b>{bsOpenBal}</b><span className="bsd">{bsOpenSide}</span></td></tr>
   {bsRows.map((r: any, r_i: number) => (<Fragment key={r_i}><tr>
    <td className="dt">{r.d}</td>
    <td className="ar"><b className="l1">{r.l1}</b><span className="l2">{r.l2}</span>{r.hasL3 && (<><span className="l3">{r.l3}</span></>)}</td>
    <td className="n dr">{r.dr}</td><td className="n cr">{r.cr}</td>
    <td className="n"><b>{r.bal}</b><span className="bsd">{r.side}</span></td>
   </tr></Fragment>))}
   {bsEmpty && (<><tr><td colSpan={5} className="ar" style={{ textAlign: 'center', color: '#4A5A70', padding: '20px' }}>لا توجد حركات في هذه الفترة</td></tr></>)}
  </tbody>
  <tfoot>
   <tr><td colSpan={2} className="ar">الإجمالي <span className="en" style={{ fontSize: '12px', opacity: '.8' }}>Totals</span> · {bsCount}</td><td className="n">{bsDr}</td><td className="n">{bsCr}</td><td className="n"></td></tr>
   <tr className="bsclose"><td colSpan={4} className="ar">الرصيد الختامي <span className="en" style={{ fontSize: '12px', opacity: '.8' }}>Closing Balance</span> · <span className="amt">{bsCloseDate}</span></td><td className="n">{bsClose}<span className="bsd" style={{ color: '#B8C4D4' }}>{bsCloseSide}</span></td></tr>
  </tfoot>
 </table></div>
</section>
</>)}

{xt_dn && (<>
  <div className="xa-row">
  <section className="card xa-sec" aria-label="الوثائق">
    <div className="xa-h"><h2>الوثائق</h2><span className={xd.pill}>{xd.count}</span></div>
    {xd.none && (<><div className="xa-empty">لا توجد وثائق لهذا الحساب</div></>)}
    {xd.list.map((d: any, d_i: number) => (<Fragment key={d_i}><div className="xa-doc"><span className="xa-ok" aria-hidden="true">✓</span><div className="xa-dt"><b style={{ fontSize: '14px', lineHeight: '22px' }}>{d.title}</b><span className="cap">{d.meta}</span></div>{d.hasSt && (<><span className={d.pill}>{d.st}</span></>)}</div></Fragment>))}
  </section>
  <section className="card xa-sec" aria-label="الملاحظات">
    <div className="xa-h"><h2>الملاحظات</h2></div>
    {xn.none && (<><div className="xa-empty">لا توجد ملاحظات لهذا الحساب</div></>)}
    {xn.has && (<><p className="xa-note">{xn.text}</p></>)}
  </section>
  </div>
</>)}

  </>)}
</main>

    </div>
  );
}
