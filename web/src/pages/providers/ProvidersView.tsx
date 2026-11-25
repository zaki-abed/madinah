/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/** العرض منقول من لوحة Providers.dc.html (الهيكل والأصناف والنصوص)، وقيمه وأفعاله من منطق الصفحة. */
export function ProvidersView({ vm }: { vm: any }) {
  const { pageErr, cBtn, cBtnCls, cOpen, cText, cTitle, chips, close, confirm, curOpts, empty, err, flash, groups, hasLocked, mName, mNoCurs, mOpen, mTitle, mType, onName, onQ, onType, openAdd, q, save, saveTxt, typeLocked, typeOpts } = vm;
  return (
    <div className="pg-providers" style={{ display: 'contents' }}>
<main className="main">
<Link className="lnk" to="/accounts" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>← الحسابات والخزائن</Link>
<header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}><div><h1 style={{ margin: '0', fontSize: '28px', lineHeight: '40px', fontWeight: '700' }}>الجهات</h1><p className="sub" style={{ margin: '4px 0 0' }}>البنوك والمنصات والمحافظ التي تُفتح عندها حسابات المكتب · الأنواع ثابتة، والجهات تُدار من هنا</p></div><button className="btn acc" type="button" onClick={openAdd}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>إضافة جهة</button></header>

{flash && (<><div className="flash" role="status">{flash}</div></>)}
{pageErr && (<div className="err" role="alert">{pageErr}</div>)}

<div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
 <label className="f" style={{ flex: '1 1 280px', maxWidth: '420px' }}><span className="vh">بحث</span><input type="search" placeholder="ابحث عن جهة" value={q} onChange={onQ} /></label>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }} role="group" aria-label="تصفية حسب النوع">{chips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.on} onClick={c.go}>{c.label} <span className="amt" style={{ opacity: '.7' }}>{c.n}</span></button></Fragment>))}</div>
</div>

{groups.map((g: any, g_i: number) => (<Fragment key={g_i}>
<section className="card" style={{ overflow: 'hidden' }}>
 <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}><h2 style={{ margin: '0', fontSize: '18px', lineHeight: '28px', fontWeight: '700' }}>{g.name}</h2><span className="cap">{g.count}</span></div>
 <div style={{ overflowX: 'auto' }}><table className="tbl">
  <thead><tr><th>الجهة</th><th>العملات المسموحة</th><th>الحسابات</th><th>الحالة</th><th style={{ textAlign: 'left' }}>إجراءات</th></tr></thead>
  <tbody>{g.rows.map((p: any, p_i: number) => (<Fragment key={p_i}>
   <tr>
    <td><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span className="pv" style={p.pvStyle} aria-hidden="true">{p.letter}</span><span style={{ fontWeight: '600' }}>{p.name}</span></div></td>
    <td>{p.hasCurs && (<><div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{p.curs.map((c: any, c_i: number) => (<Fragment key={c_i}><span className="cur">{c}</span></Fragment>))}</div></>)}{p.noCurs && (<><span className="cap">بلا عملات ولا أرصدة</span></>)}</td>
    <td><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}><span>{p.accTxt}</span>{p.hasAccs && (<><button type="button" className="lnk" aria-expanded={p.isOpen} onClick={p.toggle}>{p.toggleTxt}</button></>)}</div></td>
    <td><span className={p.stPill}>{p.st}</span></td>
    <td><div className="acts"><button type="button" className="lnk" onClick={p.edit}>تعديل</button>{p.canDelete && (<><button type="button" className="lnk bad" onClick={p.askDel}>حذف</button></>)}{p.hasAccs && (<><button type="button" className="lnk" onClick={p.askStop}>{p.stopTxt}</button></>)}</div></td>
   </tr>
   {p.isOpen && (<><tr><td colSpan={5} style={{ padding: '0' }}><div className="sub-rows">{p.accs.map((x: any, x_i: number) => (<Fragment key={x_i}><span>{x}</span></Fragment>))}</div></td></tr></>)}
  </Fragment>))}</tbody>
 </table></div>
</section>
</Fragment>))}
{empty && (<><section className="card" style={{ padding: '32px', textAlign: 'center', color: '#4A5A70' }}>لا توجد جهات بهذا البحث</section></>)}
<p className="hint" style={{ margin: '0' }}>الجهة التي عليها حسابات لا تُحذف، بل تُوقَف: لا تظهر في «إضافة حساب» وتبقى حساباتها كما هي. كل تعديل يُسجَّل في سجل التدقيق.</p>
</main>
{mOpen && (<>
<div className="ov" role="dialog" aria-modal="true" aria-labelledby="pm-t"><div className="modal">
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}><h2 id="pm-t" style={{ margin: '0' }}>{mTitle}</h2><button className="x" type="button" aria-label="إغلاق" onClick={close}>×</button></div>
 <label className="f"><span>اسم الجهة</span><input type="text" value={mName} onChange={onName} placeholder="مثال: بنك القدس" /></label>
 <label className="f"><span>النوع</span><select value={mType} onChange={onType} disabled={typeLocked}>{typeOpts.map((o: any, o_i: number) => (<Fragment key={o_i}><option value={o.id}>{o.name}</option></Fragment>))}</select></label>
 {typeLocked && (<><p className="hint" style={{ margin: '-8px 0 0' }}>لا يتغير النوع لأن على الجهة حسابات.</p></>)}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><span style={{ fontSize: '13px', fontWeight: '600' }}>العملات المسموحة</span>
  {mNoCurs && (<><p className="hint" style={{ margin: '0' }}>تطبيقات البطاقات بلا عملات ولا أرصدة.</p></>)}
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{curOpts.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.on} disabled={c.locked} title={c.title} onClick={c.toggle}><span className="amt">{c.code}</span>{c.mark}</button></Fragment>))}</div>
  {hasLocked && (<><p className="hint" style={{ margin: '0' }}>العملة التي عليها حسابات لا تُحذف من الجهة.</p></>)}
 </div>
 {err && (<><div className="err" role="alert">{err}</div></>)}
 <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={close}>تراجع</button><button className="btn pri" type="button" onClick={save}>{saveTxt}</button></div>
</div></div>
</>)}

{cOpen && (<>
<div className="ov" role="dialog" aria-modal="true" aria-labelledby="pc-t"><div className="modal" style={{ maxWidth: '480px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}><h2 id="pc-t" style={{ margin: '0' }}>{cTitle}</h2><button className="x" type="button" aria-label="إغلاق" onClick={close}>×</button></div>
 <p style={{ margin: '0', fontSize: '14px', lineHeight: '22px', color: '#4A5A70' }}>{cText}</p>
 <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={close}>تراجع</button><button className={cBtnCls} type="button" onClick={confirm}>{cBtn}</button></div>
</div></div>
</>)}
    </div>
  );
}
