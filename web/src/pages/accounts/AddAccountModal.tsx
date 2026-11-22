import { useState } from 'react';
import { api } from '../../api';
import { SECTIONS, type SectionId } from '../../accountTypes';
import { errorMessage, type Provider } from './data';

const NEW = '@new';

interface Props {
  providers: Provider[];
  /** القسم والجهة المختاران مسبقاً (من «+ حساب في …»). */
  initial: { section: SectionId; providerId?: string };
  onClose(): void;
  onSaved(flash: string, section: SectionId): void;
}

/**
 * نافذة «إضافة حساب» المختصرة من لوحة Accounts.dc.html.
 * مؤقتة: تُستبدل بنموذج «إضافة حساب جديد» الكامل في المرحلة 2ب.
 */
export function AddAccountModal({ providers, initial, onClose, onSaved }: Props) {
  const [sectionId, setSectionId] = useState<SectionId>(initial.section);
  const [providerChoice, setProviderChoice] = useState(initial.providerId ?? '');
  const [providerName, setProviderName] = useState('');
  const [name, setName] = useState('');
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const section = SECTIONS.find((s) => s.id === sectionId)!;
  const options = providers.filter((p) => section.types.includes(p.type));
  const choice = providerChoice || options[0]?.id || NEW;
  const isNew = choice === NEW;
  const provider = options.find((p) => p.id === choice);
  // عملات الحساب من عملات جهته فقط.
  const available = isNew ? section.newCurrencies : (provider?.currencies ?? []);
  const selected = currencies.filter((c) => available.includes(c));

  const clear = () => setError('');

  async function save() {
    if (busy) return;
    setBusy(true); // التحقق كله في الخادم، بترتيب رسائل التصميم
    try {
      const result = await api<{ title: string; section: string; providerName: string }>('POST', '/api/accounts', {
        ...(isNew ? { newProvider: { name: providerName, type: section.newType } } : { providerId: choice }),
        name,
        currencies: selected.map((currency) => ({ currency, initialBalance: opening[currency] ?? '' })),
      });
      onSaved(
        `أُضيف «${result.title}» تحت ${result.section}، ويظهر تلقائياً في صفحة ${result.providerName} إن وُجدت.`,
        sectionId,
      );
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="ov" role="dialog" aria-modal="true" aria-label="إضافة حساب">
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', lineHeight: '32px', fontWeight: 700 }}>إضافة حساب</h2>
            <p className="cap" style={{ margin: '2px 0 0', fontSize: '13px' }}>
              يظهر تحت نوعه ومنصته، وفي صفحة المنصة إن وُجدت، وتدخل أرصدته في خزنة كل عملة
            </p>
          </div>
          <button className="x" type="button" aria-label="إغلاق" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '12px' }}>
          <label className="f">
            النوع
            <select
              value={sectionId}
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
              placeholder="مثال: بنك القدس"
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
            placeholder="مثال: حساب أحمد"
          />
          <span className="hint">غالباً باسم صاحبه، أو «حساب المكتب»</span>
        </label>

        {available.length > 0 ? (
          <div className="f">
            <span>العملات في الحساب</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {available.map((currency) => {
                const on = selected.includes(currency);
                return (
                  <button
                    key={currency}
                    type="button"
                    className={on ? 'chipf on' : 'chipf'}
                    aria-pressed={on}
                    onClick={() => {
                      setCurrencies(on ? selected.filter((c) => c !== currency) : [...selected, currency]);
                      clear();
                    }}
                  >
                    {currency}
                  </button>
                );
              })}
            </div>
            <span className="hint">لكل عملة رصيد وكشف مستقل داخل نفس الحساب</span>
          </div>
        ) : (
          <span className="hint">تطبيقات البطاقات بدون أرصدة في النظام. تُسجَّل بيانات الحساب فقط.</span>
        )}

        {selected.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px' }}>
            {selected.map((currency) => (
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

        {error ? <div className="err" role="alert">{error}</div> : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '6px', borderTop: '1px solid #EDF1F5' }}>
          <button className="btn" type="button" onClick={onClose}>إلغاء</button>
          <button className="btn pri" type="button" onClick={() => void save()} disabled={busy}>حفظ الحساب</button>
        </div>
      </div>
    </div>
  );
}
