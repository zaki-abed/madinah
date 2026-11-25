/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/**
 * عرض نموذج «إضافة حساب جديد». الهيكل والأصناف والنصوص منقولة من لوحة AddAccount.dc.html،
 * وكل القيم والأفعال تأتي من useAddAccount (بنفس أسماء منطق اللوحة).
 */
export function AddAccountView({ vm }: { vm: any }) {
  const { hasDraft, resumeDraft, dropDraft, busy, pmNoCurs, P, S, addCard, addDoc, addLim, appearsIn, applyPresets, auditLine, backEdit, baseChips, calcChips, calcHint, canDraft, cardRows, catChips, copyAll, copyAllCls, copyAllTxt, curChips, curFixed, curFixedNote, curRows, customGroup, customName, disableSec, docRows, enableSec, err, flash, goNext, goPrev, hasErr, hasFlash, hasIssues, hasLimRows, hasPresets, hasPrev, hasProv, hasTplNa, hasTplOpt, hasTplPlus, hasWarns, headSub, isCustom, isPM, isS1, isS2, isS3, issues, issuesHead, lc, limModeChips, limRows, linkChips, navGroups, nextLabel, noCards, noDocs, noIssues, noLimMsg, noPrev, noProv, noProvs, notSaved, onCustomName, onQ, pageHref, pageLabel, pm, pmCats, pmClose, pmCurs, pmErr, pmHasErr, pmName, pmSave, presetLabel, prevLabel, provGroups, pv, q, restart, save, saveDraft, saved, savedLine, showWs, steps, thrChips, toS1, toS2, tplCore, tplNa, tplNaTitle, tplOpt, unkLimMsg, warns, wsChips } = vm;
  return (
<main className="main pg-addacc">
  <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '16px', justifyContent: 'space-between' }}>
    <div>
      <Link to="/accounts" className="cap" style={{ textDecoration: 'none', fontWeight: '600' }}>الحسابات والخزائن ›</Link>
      <h1 style={{ margin: '2px 0 0', fontSize: '32px', lineHeight: '44px', fontWeight: '700' }}>إضافة حساب جديد</h1>
      <p className="sub" style={{ margin: '4px 0 0' }}>{headSub}</p>
    </div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {canDraft && (<><button type="button" className="btn" onClick={saveDraft}>حفظ كمسودة</button></>)}
      <Link className="btn" to="/accounts">إلغاء</Link>
    </div>
  </header>

  <nav className="steps" aria-label="مراحل الإضافة">{steps.map((s: any, s_i: number) => (<Fragment key={s_i}>{s.line && (<><span className="sline" aria-hidden="true"></span></>)}<button type="button" className={s.cls} onClick={s.go} aria-current={s.cur}><span className="n">{s.n}</span>{s.label}</button></Fragment>))}</nav>

  {hasDraft && (<>
    <div className="flash" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
      <span style={{ flex: '1', minWidth: '220px' }}>توجد مسودة محفوظة على هذا المتصفح.</span>
      <button type="button" className="btn mb" onClick={resumeDraft}>متابعة المسودة</button>
      <button type="button" className="btn ghost mb" onClick={dropDraft}>تجاهلها</button>
    </div>
  </>)}
  {hasFlash && (<><div className="flash" role="status">{flash}</div></>)}
  {hasErr && (<><div className="errb" role="alert">{err}</div></>)}

  {/* ========== 1. اختيار الجهة ========== */}
  {isS1 && (<>
  <div className="l2">
    <div className="colm">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <label className="search"><span className="vh">بحث عن جهة</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" value={q} onChange={onQ} placeholder="ابحث عن بنك أو منصة أو محفظة" /></label>
        <div className="chips" role="group" aria-label="نوع الجهة">{catChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div>
      </div>
      {provGroups.map((g: any, g_i: number) => (<Fragment key={g_i}>
        <section className="pgrp" aria-label={g.name}>
          <div className="pgh">{g.name}</div>
          <div className="pgrid">{g.provs.map((p: any, p_i: number) => (<Fragment key={p_i}><button type="button" className={p.cls} aria-pressed={p.pressed} onClick={p.go}><span className="pav" style={p.av}>{p.ini}</span><span className="pcb"><b>{p.name}{p.isNew && (<><span className="newtag">جديدة</span></>)}</b><span className="cap">{p.sub}</span></span></button></Fragment>))}</div>
        </section>
      </Fragment>))}
      {noProvs && (<><div className="card empty">لا توجد جهة بهذا الاسم. يمكن اختيار «جهة أخرى» وتحديد قالبها.</div></>)}
    </div>

    <aside className="cols" aria-label="قالب الجهة المختارة">
      {hasProv && (<>
      <div className="card panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span className="pav" style={pv.av}>{pv.ini}</span><div style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: '18px', lineHeight: '26px' }}>{pv.name}</b><span className="cap">{pv.sub}</span></div></div>
        {isCustom && (<>
          <div className="fw"><div className="flab"><span>اسم الجهة</span><b className="rq" aria-hidden="true">*</b></div><input className="inp" type="text" value={customName} onChange={onCustomName} placeholder="مثال: Payoneer" aria-label="اسم الجهة" /></div>
          <div className="cap" style={{ fontSize: '13px' }}>تُضاف تحت: <b style={{ color: '#142B4A' }}>{customGroup}</b></div>
          <div className="fw"><div className="flab"><span>قالب الحقول</span></div><div className="chips" role="group" aria-label="أقرب نوع">{baseChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">تأخذ الجهة الجديدة أقسام هذا القالب وحقوله، وبعدها تُضاف حساباتها من نفس المكان.</span></div>
        </>)}
        <div className="tdiv" aria-hidden="true"></div>
        <div className="tpk"><h4>رح تعبّي</h4>{tplCore.map((t: any, t_i: number) => (<Fragment key={t_i}><div className="tstep"><i aria-hidden="true">{t.n}</i><span>{t.label}</span></div></Fragment>))}</div>
        {hasTplOpt && (<><div className="tpk"><h4>اختياري</h4><div className="chips">{tplOpt.map((t: any, t_i: number) => (<Fragment key={t_i}><span className="tchip opt">{t.label}</span></Fragment>))}</div></div></>)}
        {hasTplNa && (<><div className="tpk"><h4>{tplNaTitle}</h4><div className="chips">{tplNa.map((t: any, t_i: number) => (<Fragment key={t_i}><span className="tchip na">{t.label}{t.plus && (<> <b aria-hidden="true">+</b></>)}</span></Fragment>))}</div>{hasTplPlus && (<><span className="cap"><b style={{ color: '#0E7C70' }}>+</b> يمكن تفعيله لحساب واحد عند الحاجة</span></>)}</div></>)}
        <div className="tdiv" aria-hidden="true"></div>
        <button type="button" className="btn pri" onClick={toS2}>متابعة إلى البيانات ←</button>
      </div>
      </>)}
      {noProv && (<>
      <div className="card empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9FB0C6" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6V4h12v2"/></svg><b style={{ color: '#142B4A' }}>اختر الجهة أولاً</b><span>تظهر هنا الأقسام المناسبة لها: الأساسي منها والاختياري وما لا ينطبق.</span></div>
      </>)}
    </aside>
  </div>
  </>)}

  {/* ========== 2. البيانات ========== */}
  {isS2 && (<>
  <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
    <span className="pav" style={pv.av}>{pv.ini}</span>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '0' }}><b style={{ fontSize: '16px' }}>{pv.name}</b><span className="cap">{pv.catName}</span></div>
    <button type="button" className="btn ghost mb" onClick={toS1}>تغيير الجهة</button>
  </div>

  <div className="ws">
    <aside className="snav" aria-label="أقسام النموذج">
      {navGroups.map((g: any, g_i: number) => (<Fragment key={g_i}>
        <div className="sng"><div className="sngt">{g.title}</div>{g.items.map((i: any, i_i: number) => (<Fragment key={i_i}><button type="button" className={i.cls} onClick={i.go} aria-current={i.cur}><span>{i.label}</span><span className={i.bcls}>{i.badge}</span></button></Fragment>))}</div>
      </Fragment>))}
    </aside>

    <section className="card scard" aria-label={S.title}>
      <div className="sh">
        <div style={{ flex: '1', minWidth: '240px' }}><h2>{S.title}</h2><div className="cap" style={{ fontSize: '13px' }}>{S.desc}</div></div>
        <span className={S.pill}>{S.lvl}</span>
      </div>

      {/* قسم لا ينطبق */}
      {S.isNa && (<>
        <div className="note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><span>{S.naNote}</span></div>
        {S.canEnable && (<><button type="button" className="btn addr" onClick={enableSec}>تفعيل القسم لهذا الحساب فقط</button></>)}
      </>)}

      {/* قسم يُبنى في مرحلة لاحقة */}
      {S.isSoon && (<>
        <div className="note sec2"><span>{S.soonNote}</span></div>
      </>)}

      {/* مجموعات الحقول */}
      {S.isForm && (<>
        {S.groups.map((g: any, g_i: number) => (<Fragment key={g_i}>
          <div className={g.cls}>
            {g.hasTitle && (<><div className="fgh"><span>{g.title}</span>{g.removable && (<><button type="button" className="btn ghost mb rowx" onClick={g.remove}>إزالة</button></>)}</div></>)}
            {g.hasHelp && (<><div className="note lockn">{g.help}</div></>)}
            <div className="fgrid">{g.fields.map((f: any, f_i: number) => (<Fragment key={f_i}>
              <div className={f.wcls}>
                <div className="flab"><span>{f.label}</span>{f.req && (<><b className="rq" aria-hidden="true">*</b></>)}{f.opt && (<><span className="optl">اختياري</span></>)}</div>
                {f.isText && (<><input className={f.inCls} type="text" value={f.val} onChange={f.on} placeholder={f.ph} aria-label={f.label} /></>)}
                {f.isDate && (<><input className="inp" type="date" value={f.val} onChange={f.on} aria-label={f.label} /></>)}
                {f.isArea && (<><textarea className="inp area" value={f.val} onChange={f.on} placeholder={f.ph} aria-label={f.label}></textarea></>)}
                {f.isChips && (<><div className="chips" role="group" aria-label={f.label}>{f.chips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></>)}
                {f.adder && (<>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="inp" type="text" style={{ flex: '1 1 160px', maxWidth: '240px' }} value={f.adder.val} onChange={f.adder.on} placeholder="اسم جديد في فريق العمل" aria-label="اسم جديد في فريق العمل" />
                    <button type="button" className="btn mb" onClick={f.adder.add}>+ إضافة اسم</button>
                  </div>
                  {f.adder.err && (<span className="ferr">{f.adder.err}</span>)}
                </>)}
                {f.hasHelp && (<><span className="hint">{f.help}</span></>)}
                {f.hasErr && (<><span className="ferr">{f.err}</span></>)}
                {f.hasWarn && (<><span className="fwarn">{f.warn}</span></>)}
              </div>
            </Fragment>))}</div>
          </div>
        </Fragment>))}
        {S.canAddGroup && (<><button type="button" className="btn addr" onClick={S.addGroup}>{S.addGroupLabel}</button></>)}
      </>)}

      {/* العملات */}
      {S.isCurs && (<>
        <div className="fw"><div className="flab"><span>العملات المتاحة في الحساب</span><b className="rq" aria-hidden="true">*</b></div><div className="chips" role="group" aria-label="العملات">{curChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></div>
        {curFixed && (<><div className="note lockn">{curFixedNote}</div></>)}
        {curRows.map((r: any, r_i: number) => (<Fragment key={r_i}>
          <div className="crow">
            <div style={{ display: 'flex', flexDirection: 'column' }}><b className="en" style={{ fontSize: '16px' }}>{r.cur}</b><span className="cap">{r.name}</span></div>
            <div className="fw"><div className="flab"><span>الرصيد الافتتاحي</span></div><input className="inp en" type="text" value={r.val} onChange={r.on} placeholder="0.00" aria-label={r.aria} />{r.hasErr && (<><span className="ferr">{r.err}</span></>)}</div>
            <div className="fw"><div className="flab"><span>بتاريخ</span></div><input className="inp" type="date" value={r.date} onChange={r.onDate} aria-label="تاريخ الرصيد الافتتاحي" /></div>
          </div>
        </Fragment>))}
        <div className="note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><span>الرصيد الافتتاحي يظهر كأول سطر في كشف الحساب، ويُحسب ضمن خزنة العملة نفسها في «الحسابات والخزائن».</span></div>
      </>)}

      {/* الحدود */}
      {S.isLimits && (<>
        <div className="l2" style={{ gap: '16px' }}>
          <div className="colm" style={{ flexBasis: '420px', gap: '12px' }}>
            <div className="chips" role="group" aria-label="وجود ليميت">{limModeChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div>
            {hasLimRows && (<>
              {limRows.map((l: any, l_i: number) => (<Fragment key={l_i}>
                <div className="row">
                  <div className="rowh"><b>{l.title}</b><span className="cap">{l.reset}</span><button type="button" className="btn ghost mb rowx" onClick={l.remove}>إزالة</button></div>
                  <div className="fgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
                    <div className="fw"><div className="flab"><span>الاتجاه</span></div><div className="chips">{l.dirs.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></div>
                    <div className="fw"><div className="flab"><span>الفترة</span></div><div className="chips">{l.pers.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></div>
                    <div className="fw"><div className="flab"><span>الحد</span><b className="rq" aria-hidden="true">*</b></div><div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{l.known && (<><input className="inp en" type="text" value={l.max} onChange={l.onMax} placeholder="0" aria-label="قيمة الحد" /><div className="chips" style={{ flexWrap: 'nowrap' }}>{l.curs.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></>)}<button type="button" className={l.unkCls} aria-pressed={l.unkP} onClick={l.toggleUnk}>غير معرّف</button></div>{l.hasErr && (<><span className="ferr">{l.err}</span></>)}</div>
                  </div>
                </div>
              </Fragment>))}
              <div className="fw"><div className="flab"><span>طريقة الاحتساب</span></div><div className="chips">{calcChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">{calcHint}</span></div>
              {showWs && (<><div className="fw"><div className="flab"><span>بداية الأسبوع</span></div><div className="chips">{wsChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">يتجدد الحد الأسبوعي في هذا اليوم. في PayPal يبدأ الأسبوع يوم الاثنين.</span></div></>)}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button type="button" className="btn mb" onClick={addLim}>+ إضافة حد</button>{hasPresets && (<><button type="button" className="btn ghost mb" onClick={applyPresets}>{presetLabel}</button></>)}</div>
              <div className="fw"><div className="flab"><span>التنبيه عند الوصول إلى</span></div><div className="chips">{thrChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">يتحول الكرت للأصفر عند هذه النسبة، وللأحمر عند الوصول للحد.</span></div>
            </>)}
            {noLimMsg && (<><div className="note">سيظهر في صفحة الحساب: «لا يوجد ليميت لهذا الحساب»، ويمكن إضافته لاحقاً من «حدود الحسابات».</div></>)}
            {unkLimMsg && (<><div className="note sec2">الليميت غير معروف بعد. يُحفظ الحساب، ويظهر في كرت الليميت «غير معرّف»، ويمكن تحديده لاحقاً من «حدود الحسابات».</div></>)}
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="cap" style={{ fontWeight: '600' }}>هكذا سيظهر كرت الليميت</span>
            <div className="lc" style={lc.border} aria-label="معاينة كرت الليميت">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div><b style={{ fontSize: '16px', lineHeight: '24px' }}>{lc.name}</b><div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}><span className="pill teal">{lc.type}</span></div></div>
                <span className={lc.statePill}>{lc.state}</span>
              </div>
              {lc.none && (<><div style={{ background: '#F5F7FA', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', color: '#3A4A60', textAlign: 'center' }}>{lc.noneText}</div></>)}
              {lc.lims.map((l: any, l_i: number) => (<Fragment key={l_i}>
                <div className="lm">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span><b>{l.title}</b> <span className="cap">· {l.reset}</span></span><span className="amt" style={{ color: '#136A43', fontWeight: '600' }}>0%</span></div>
                  <div className="lbar"><span style={{ width: '0%', background: '#16B8A6' }}></span><i style={l.mark}></i></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#4A5A70' }}><span className="amt">{l.usedTxt}</span><span>{l.leftTxt}</span></div>{l.hasEff && (<><span className="cap" style={{ color: '#7A5200', fontWeight: '600' }}>{l.eff}</span></>)}
                </div>
              </Fragment>))}
            </div>
          </div>
        </div>
      </>)}

      {/* الوثائق */}
      {S.isDocs && (<>
        {S.canDisable && (<><div className="note" style={{ alignItems: 'center', flexWrap: 'wrap' }}><span style={{ flex: '1', minWidth: '220px' }}>فُعّل هذا القسم لهذا الحساب فقط، لأنه لا ينطبق عادةً على هذه الجهة.</span><button type="button" className="btn mb" onClick={disableSec}>تراجع عن التفعيل</button></div></>)}
        <div className="note sec2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>تُسجَّل الوثيقة المستخدمة بنوعها وباسم مَن، مثل «جواز سفر · أحمد»، بدون رفع الملف. إرفاق الملف اختياري، وتظهر الوثائق في تبويب «التوثيق» داخل صفحة الحساب.</span></div>
        {noDocs && (<><div className="note">لم تُضف وثائق بعد.</div></>)}
        {docRows.map((d: any, d_i: number) => (<Fragment key={d_i}>
          <div className="row">
            <div className="rowh"><b>وثيقة {d.n}</b><span className={d.stPill}>{d.st}</span><button type="button" className="btn ghost mb rowx" onClick={d.remove}>حذف من المسودة</button></div>
            <div className="fgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div className="fw"><div className="flab"><span>نوع الوثيقة</span><b className="rq" aria-hidden="true">*</b></div><select className="inp" value={d.dtype} onChange={d.onType} aria-label="نوع الوثيقة"><option value="">اختر النوع</option>{d.typeOpts.map((o: any, o_i: number) => (<Fragment key={o_i}><option value={o}>{o}</option></Fragment>))}</select></div>
              <div className="fw"><div className="flab"><span>باسم</span><b className="rq" aria-hidden="true">*</b></div><input className="inp" type="text" value={d.who} onChange={d.onWho} placeholder="مثال: أحمد" aria-label="باسم" /></div>
              <div className="fw"><div className="flab"><span>تاريخ الانتهاء</span><span className="optl">اختياري</span></div><input className="inp" type="date" value={d.expiry} onChange={d.onExpiry} aria-label="تاريخ الانتهاء" /></div>
            </div>
            {d.hasText && (<><div className="note lockn" style={{ flexDirection: 'column', gap: '2px' }}><b>✓ تم استخدام {d.text}</b>{d.hasShared && (<><span className="cap" style={{ color: '#0A5F56' }}>{d.shared}</span></>)}</div></>)}
            {d.showNoteIn && (<><div className="fw"><div className="flab"><span>ملاحظة</span><span className="optl">اختياري</span></div><input className="inp" type="text" value={d.dnote} onChange={d.onNote} placeholder="مثال: قُدّم عند فتح الحساب" aria-label="ملاحظة" /></div></>)}
            {d.hasFile && (<><div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}><span className="dfile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg><span className="en">{d.file}</span></span><button type="button" className="btn ghost mb" onClick={d.clear}>إزالة الملف</button></div></>)}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {d.canAddNote && (<><button type="button" className="btn ghost mb" onClick={d.addNote}>+ إضافة ملاحظة</button></>)}
              {d.noFile && (<><button type="button" className="btn ghost mb" onClick={d.upload}>+ إرفاق ملف</button></>)}
            </div>
          </div>
        </Fragment>))}
        <button type="button" className="btn addr mb" onClick={addDoc}>+ إضافة وثيقة</button>
      </>)}

      {/* البطاقات */}
      {S.isCards && (<>
        {S.canDisable && (<><div className="note" style={{ alignItems: 'center', flexWrap: 'wrap' }}><span style={{ flex: '1', minWidth: '220px' }}>فُعّل هذا القسم لهذا الحساب فقط، لأنه لا ينطبق عادةً على هذه الجهة.</span><button type="button" className="btn mb" onClick={disableSec}>تراجع عن التفعيل</button></div></>)}
        <div className="note sec2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg><span>لا يُسجَّل رقم البطاقة الكامل ولا رمز CVV. يكفي آخر 4 أرقام وتاريخ الانتهاء للتعرّف على البطاقة.</span></div>
        {cardRows.map((c: any, c_i: number) => (<Fragment key={c_i}>
          <div className="row">
            <div className="rowh"><b className="en">{c.title}</b><span className={c.stPill}>{c.status}</span><button type="button" className="btn ghost mb rowx" onClick={c.remove}>إزالة من المسودة</button></div>
            <div className="fgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
              <div className="fw"><div className="flab"><span>نوع البطاقة</span></div><div className="chips">{c.kinds.map((k: any, k_i: number) => (<Fragment key={k_i}><button type="button" className={k.cls} aria-pressed={k.pressed} onClick={k.go}>{k.label}</button></Fragment>))}</div></div>
              <div className="fw"><div className="flab"><span>الشبكة</span></div><div className="chips">{c.nets.map((k: any, k_i: number) => (<Fragment key={k_i}><button type="button" className={k.cls} aria-pressed={k.pressed} onClick={k.go}>{k.label}</button></Fragment>))}</div></div>
              <div className="fw"><div className="flab"><span>اسم حامل البطاقة</span></div><input className="inp en" type="text" value={c.holder} onChange={c.onHolder} placeholder="كما هو مطبوع" aria-label="اسم حامل البطاقة" /></div>
              <div className="fw"><div className="flab"><span>آخر 4 أرقام</span><b className="rq" aria-hidden="true">*</b></div><input className="inp en" type="text" value={c.last4} onChange={c.onLast4} placeholder="4821" aria-label="آخر 4 أرقام" />{c.hasErr4 && (<><span className="ferr">{c.err4}</span></>)}</div>
              <div className="fw"><div className="flab"><span>الانتهاء</span><b className="rq" aria-hidden="true">*</b></div><input className="inp en" type="text" value={c.exp} onChange={c.onExp} placeholder="MM/YY" aria-label="تاريخ الانتهاء" />{c.hasErrE && (<><span className="ferr">{c.errE}</span></>)}</div>
              <div className="fw"><div className="flab"><span>الحالة</span></div><div className="chips">{c.sts.map((k: any, k_i: number) => (<Fragment key={k_i}><button type="button" className={k.cls} aria-pressed={k.pressed} onClick={k.go}>{k.label}</button></Fragment>))}</div></div>
            </div>
          </div>
        </Fragment>))}
        {noCards && (<><div className="note">لا توجد بطاقات بعد.</div></>)}
        <button type="button" className="btn addr mb" onClick={addCard}>+ إضافة بطاقة</button>
      </>)}

      {/* الربط */}
      {S.isLinks && (<>
        <div className="fw"><div className="flab"><span>الحسابات المربوطة بهذا الحساب</span></div><div className="chips" role="group" aria-label="الحسابات المربوطة">{linkChips.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">الربط يظهر في الحسابين معاً، وفي جدول «خريطة الربط» بصفحة البطاقات والربط.</span></div>
      </>)}

      <div className="sfoot">
        {hasPrev && (<><button type="button" className="btn" onClick={goPrev}>→ {prevLabel}</button></>)}
        {noPrev && (<><span></span></>)}
        <button type="button" className="btn pri" onClick={goNext}>{nextLabel} ←</button>
      </div>
    </section>
  </div>
  </>)}

  {/* ========== 3. المراجعة ========== */}
  {isS3 && (<>
  {saved && (<>
    <div className="card svdone">
      <span className="ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <h2 style={{ margin: '0', fontSize: '22px' }}>أُضيف «{P.title}»</h2>
      <p className="sub" style={{ margin: '0', maxWidth: '560px' }}>{savedLine}</p>
      <span className="cap">سجل التدقيق: {auditLine}</span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}><Link className="btn pri" to={pageHref}>{pageLabel}</Link><button type="button" className="btn" onClick={restart}>إضافة حساب آخر</button></div>
    </div>
  </>)}
  {notSaved && (<>
  <div className="l2">
    <div className="colm">
      <div className="note lockn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>هذه معاينة صفحة الحساب بعد الحفظ. البيانات نفسها التي أُدخلت في النموذج، بلا نسخ ثانية.</span></div>
      <article className="card prof" aria-label="معاينة صفحة الحساب">
        <div className="profh">
          <span className="pav" style={pv.av}>{pv.ini}</span>
          <div style={{ flex: '1', minWidth: '200px', display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: '20px', lineHeight: '30px' }}>{P.title}</b><span style={{ fontSize: '13px', color: '#B8C4D4' }}>{P.sub}</span></div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}><span className={P.stPill}>{P.status}</span>{P.hasDocBadge && (<><span className={P.docPill}>{P.docBadge}</span></>)}</div>
        </div>
        <div className="pblk" style={{ borderTop: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}><h3>بيانات الحساب</h3><button type="button" className={copyAllCls} onClick={copyAll}>{copyAllTxt}</button></div>
          <div className="pfs">{P.fields.map((f: any, f_i: number) => (<Fragment key={f_i}><div className="pf"><span className="pfl">{f.label}</span><div className="pfv"><b className={f.vcls}>{f.val}</b>{f.share && (<><button type="button" className={f.bcls} onClick={f.copy} aria-label={f.aria}>{f.btn}</button></>)}</div></div></Fragment>))}</div>
        </div>
        <div className="pblk"><h3>الأرصدة</h3><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{P.curs.map((c: any, c_i: number) => (<Fragment key={c_i}><div className="ctab"><span className="cap" style={{ fontWeight: '600' }}>رصيد {c.cur}</span><b className="amt" style={{ fontSize: '20px', lineHeight: '28px' }}>{c.bal}</b><span className="cap">افتتاحي بتاريخ <span className="amt">{c.date}</span></span></div></Fragment>))}</div></div>
        {P.showLim && (<><div className="pblk"><h3>الليميت</h3><div style={{ maxWidth: '420px' }}>
          <div className="lc" style={lc.border}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}><b style={{ fontSize: '16px', lineHeight: '24px' }}>{lc.name}</b><span className={lc.statePill}>{lc.state}</span></div>
            {lc.none && (<><div style={{ background: '#F5F7FA', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', color: '#3A4A60', textAlign: 'center' }}>{lc.noneText}</div></>)}
            {lc.lims.map((l: any, l_i: number) => (<Fragment key={l_i}><div className="lm"><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span><b>{l.title}</b> <span className="cap">· {l.reset}</span></span><span className="amt" style={{ color: '#136A43', fontWeight: '600' }}>0%</span></div><div className="lbar"><span style={{ width: '0%', background: '#16B8A6' }}></span><i style={l.mark}></i></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#4A5A70' }}><span className="amt">{l.usedTxt}</span><span>{l.leftTxt}</span></div>{l.hasEff && (<><span className="cap" style={{ color: '#7A5200', fontWeight: '600' }}>{l.eff}</span></>)}</div></Fragment>))}
          </div></div></div></>)}
        {P.showDocs && (<><div className="pblk"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}><h3>التوثيق</h3><span className="cap">يظهر كاملاً في تبويب «الوثائق والملاحظات»</span></div><div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{P.docs.map((d: any, d_i: number) => (<Fragment key={d_i}><div className="li"><span style={{ flex: '1' }}>{d.label}</span><span className={d.stPill}>{d.st}</span></div></Fragment>))}</div></div></>)}
        {P.showCards && (<><div className="pblk"><h3>البطاقات</h3><div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{P.cards.map((c: any, c_i: number) => (<Fragment key={c_i}><div className="li"><b className="en">{c.title}</b><span className="cap">{c.meta}</span><span className={c.stPill} style={{ marginInlineStart: 'auto' }}>{c.status}</span></div></Fragment>))}</div></div></>)}
        {P.showLinks && (<><div className="pblk"><h3>الحساب مربوط مع</h3><div className="chips">{P.links.map((l: any, l_i: number) => (<Fragment key={l_i}><span className="pill info">{l.name}</span></Fragment>))}</div></div></>)}
        {P.showOps && (<><div className="pblk"><h3>التشغيل</h3><div className="pfs">{P.ops.map((f: any, f_i: number) => (<Fragment key={f_i}><div className="pf"><span className="pfl">{f.label}</span><b style={{ fontSize: '14px' }}>{f.val}</b></div></Fragment>))}</div></div></>)}
      </article>
    </div>

    <aside className="cols" aria-label="قبل الحفظ">
      <div className="card panel">
        <b style={{ fontSize: '16px' }}>قبل الحفظ</b>
        {hasIssues && (<>
          <span className="cap" style={{ fontSize: '13px' }}>{issuesHead}</span>
          {issues.map((i: any, i_i: number) => (<Fragment key={i_i}><div className="iss"><span><b>{i.sec}:</b> {i.label}</span><button type="button" className="go" onClick={i.go}>اذهب ←</button></div></Fragment>))}
        </>)}
        {noIssues && (<><div className="note lockn">كل الحقول المطلوبة مكتملة.</div></>)}
        {hasWarns && (<>
          <span className="cap" style={{ fontSize: '13px', fontWeight: '600' }}>تنبيهات لا تمنع الحفظ</span>
          {warns.map((w: any, w_i: number) => (<Fragment key={w_i}><div className="li" style={{ fontSize: '13px' }}>{w.t}</div></Fragment>))}
        </>)}
        <div className="li" style={{ fontSize: '13px', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}><b>سيظهر الحساب في</b><span>{appearsIn}</span></div>
        <button type="button" className="btn pri" onClick={save} disabled={busy}>حفظ الحساب</button>
        <button type="button" className="btn" onClick={backEdit}>→ رجوع للتعديل</button>
      </div>
    </aside>
  </div>
  </>)}
  </>)}

  {isPM && (<>
  <div className="pmov" role="dialog" aria-modal="true" aria-label="إضافة جهة">
    <div className="pmd">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}><div><h2>إضافة جهة</h2><span className="cap" style={{ fontSize: '13px' }}>البيانات المشتركة بين كل حسابات هذه الجهة. تُعبّأ مرة واحدة، وبعدها تُضاف الحسابات تحتها.</span></div><button type="button" className="btn mb" onClick={pmClose} aria-label="إغلاق">×</button></div>
      <div className="fw"><div className="flab"><span>اسم الجهة</span><b className="rq" aria-hidden="true">*</b></div><input className="inp" type="text" value={pm.name} onChange={pmName} placeholder="مثال: بنك القدس" aria-label="اسم الجهة" /></div>
      <div className="fw"><div className="flab"><span>المجموعة</span></div><div className="chips" role="group" aria-label="المجموعة">{pmCats.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div></div>
      {pmNoCurs && (<div className="note">تطبيقات البطاقات بدون أرصدة في النظام، فلا تُحدَّد لها عملات.</div>)}
      {!pmNoCurs && (<div className="fw"><div className="flab"><span>العملات المتاحة</span><b className="rq" aria-hidden="true">*</b></div><div className="chips" role="group" aria-label="العملات المتاحة">{pmCurs.map((c: any, c_i: number) => (<Fragment key={c_i}><button type="button" className={c.cls} aria-pressed={c.pressed} onClick={c.go}>{c.label}</button></Fragment>))}</div><span className="hint">تظهر جاهزة عند إضافة أي حساب تحت هذه الجهة.</span></div>)}
      {pmHasErr && (<><div className="errb" role="alert">{pmErr}</div></>)}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}><button type="button" className="btn" onClick={pmClose}>إلغاء</button><button type="button" className="btn pri" onClick={pmSave}>حفظ الجهة والمتابعة ←</button></div>
    </div>
  </div>
  </>)}
</main>
  );
}
