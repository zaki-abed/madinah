/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/** العرض منقول من لوحة Team.dc.html (الهيكل والأصناف والنصوص)، وقيمه وأفعاله من منطق الصفحة. */
export function TeamView({ vm }: { vm: any }) {
  const { pageErr, cBtn, cBtnCls, cOpen, cText, cTitle, close, confirm, count, err, flash, mName, mOpen, mPass, mPass2, mTitle, mUser, onName, onPass, onPass2, onUser, openAdd, passLabel, rows, save, saveTxt, showInfo, showPass } = vm;
  return (
    <div className="pg-team" style={{ display: 'contents' }}>
<main className="main">
<header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}><div><h1 style={{ margin: '0', fontSize: '28px', lineHeight: '40px', fontWeight: '700' }}>فريق العمل</h1><p className="sub" style={{ margin: '4px 0 0' }}>أعضاء الفريق هم من يدخل النظام، ومنهم يُختار «المسؤول عنه» في الحسابات</p></div><button className="btn acc" type="button" onClick={openAdd}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>إضافة عضو</button></header>

<div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#E6EEF7', color: '#1F3F66', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', flexWrap: 'wrap' }}><span className="pill info">الصلاحيات</span>كل أعضاء الفريق بصلاحيات كاملة.</div>

{flash && (<><div className="flash" role="status">{flash}</div></>)}
{pageErr && (<div className="err" role="alert">{pageErr}</div>)}

<section className="card" style={{ overflow: 'hidden' }}>
 <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}><h2 style={{ margin: '0', fontSize: '18px', lineHeight: '28px', fontWeight: '700' }}>الأعضاء</h2><span className="cap">{count}</span></div>
 <div style={{ overflowX: 'auto' }}><table className="tbl">
  <thead><tr><th>العضو</th><th>اسم الدخول</th><th>الحسابات المسؤول عنها</th><th>آخر دخول</th><th>الحالة</th><th style={{ textAlign: 'left' }}>إجراءات</th></tr></thead>
  <tbody>{rows.map((u: any, u_i: number) => (<Fragment key={u_i}>
   <tr>
    <td><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span className="av" style={u.avStyle} aria-hidden="true">{u.letter}</span><span style={{ fontWeight: '600' }}>{u.name}</span>{u.me && (<><span className="pill teal">أنت</span></>)}</div></td>
    <td><span className="code en" dir="ltr">{u.user}</span></td>
    <td><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}><span>{u.accTxt}</span>{u.hasAccs && (<><button type="button" className="lnk" aria-expanded={u.isOpen} onClick={u.toggle}>{u.toggleTxt}</button></>)}</div></td>
    <td><span className="cap">{u.last}</span></td>
    <td><span className={u.stPill}>{u.st}</span></td>
    <td><div className="acts"><button type="button" className="lnk" onClick={u.edit}>تعديل</button><button type="button" className="lnk" onClick={u.pass}>تغيير كلمة المرور</button>{u.canStop && (<><button type="button" className="lnk" onClick={u.askStop}>{u.stopTxt}</button></>)}{u.canDelete && (<><button type="button" className="lnk bad" onClick={u.askDel}>حذف</button></>)}</div></td>
   </tr>
   {u.isOpen && (<><tr><td colSpan={6} style={{ padding: '0' }}><div className="sub-rows">{u.accs.map((x: any, x_i: number) => (<Fragment key={x_i}><span>{x}</span></Fragment>))}</div></td></tr></>)}
  </Fragment>))}</tbody>
 </table></div>
 <p className="hint" style={{ margin: '0', padding: '16px 24px' }}>لا يُحذف عضو الفريق المرتبط بحسابات أو حركات في النظام، بل يُوقَف: يُمنع الدخول، ويبقى الاسم في السجلات. ولا يمكن إيقاف الحساب المستخدم حالياً.</p>
</section>
</main>
{mOpen && (<>
<div className="ov" role="dialog" aria-modal="true" aria-labelledby="tm-t"><div className="modal" style={{ maxWidth: '520px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}><h2 id="tm-t" style={{ margin: '0' }}>{mTitle}</h2><button className="x" type="button" aria-label="إغلاق" onClick={close}>×</button></div>
 {showInfo && (<>
  <label className="f"><span>الاسم الظاهر</span><input type="text" value={mName} onChange={onName} placeholder="مثال: كرم" /></label>
  <label className="f"><span>اسم الدخول</span><input type="text" dir="ltr" value={mUser} onChange={onUser} placeholder="karam" autoComplete="off" /></label>
  <p className="hint" style={{ margin: '-8px 0 0' }}>بالأحرف الإنجليزية والأرقام، 3 أحرف على الأقل.</p>
 </>)}
 {showPass && (<>
  <label className="f"><span>{passLabel}</span><input type="password" value={mPass} onChange={onPass} autoComplete="new-password" /></label>
  <label className="f"><span>تأكيد كلمة المرور</span><input type="password" value={mPass2} onChange={onPass2} autoComplete="new-password" /></label>
  <p className="hint" style={{ margin: '-8px 0 0' }}>8 أحرف على الأقل.</p>
 </>)}
 {err && (<><div className="err" role="alert">{err}</div></>)}
 <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={close}>تراجع</button><button className="btn pri" type="button" onClick={save}>{saveTxt}</button></div>
</div></div>
</>)}

{cOpen && (<>
<div className="ov" role="dialog" aria-modal="true" aria-labelledby="tc-t"><div className="modal" style={{ maxWidth: '480px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}><h2 id="tc-t" style={{ margin: '0' }}>{cTitle}</h2><button className="x" type="button" aria-label="إغلاق" onClick={close}>×</button></div>
 <p style={{ margin: '0', fontSize: '14px', lineHeight: '22px', color: '#4A5A70' }}>{cText}</p>
 <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={close}>تراجع</button><button className={cBtnCls} type="button" onClick={confirm}>{cBtn}</button></div>
</div></div>
</>)}
    </div>
  );
}
