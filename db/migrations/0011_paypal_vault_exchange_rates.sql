-- 0011: خزنة PayPal وأسعار التحويل (قرار 22/11/2026).

-- ───────────── خزنة PayPal تجمع كل حسابات PayPal بكل عملاتها ─────────────
-- عملات PayPal غير الدولار لا تدخل في خزائن عملاتها (يورو PayPal لا يدخل خزنة اليورو).
CREATE OR REPLACE VIEW v_account_currency_balances AS
SELECT
  ac.id AS account_currency_id,
  ac.account_id,
  ac.currency,
  ac.initial_balance,
  ac.opening_date,
  COALESCE(sum(l.amount), 0)::numeric(18,4) AS movements_total,
  (ac.initial_balance + COALESCE(sum(l.amount), 0))::numeric(18,4) AS balance,
  CASE WHEN p.type = 'PAYPAL' THEN 'PAYPAL' ELSE ac.currency END AS vault_key
FROM account_currencies ac
JOIN accounts a ON a.id = ac.account_id
JOIN providers p ON p.id = a.provider_id
LEFT JOIN ledger_entries l ON l.account_currency_id = ac.id
GROUP BY ac.id, p.type;

-- ───────────── أسعار التحويل: للعرض والعلم فقط ─────────────
-- تُجلب من الإنترنت مرة يومياً وتُحفظ هنا.
-- لا تُستعمل في أي حساب مالي أو رصيد أو قيد: لا يقرأ هذا الجدول أي عرض أرصدة ولا أي Trigger،
-- والأرصدة الحقيقية تبقى بعملتها الأصلية. يُستعمل فقط لعرض مجموع تقريبي بالدولار في خزنة PayPal.
CREATE TABLE exchange_rates (
  currency   text NOT NULL REFERENCES currencies (code),
  -- تاريخ السعر كما أعلنه المصدر (قد يسبق يوم الجلب في العطل).
  rate_date  date NOT NULL,
  -- كم دولاراً تساوي وحدة واحدة من العملة.
  usd_rate   numeric(18,8) NOT NULL CHECK (usd_rate > 0),
  source     text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, rate_date),
  CHECK (currency <> 'USD')
);

COMMENT ON TABLE exchange_rates IS
  'أسعار تقريبية من الإنترنت للعرض فقط. ممنوع استعمالها في أي حساب مالي أو رصيد أو قيد.';

GRANT SELECT, INSERT, UPDATE ON exchange_rates TO madinah_app;
