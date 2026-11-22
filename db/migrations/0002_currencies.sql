-- 0002: العملات (مع JOD حسب قرار 22/11/2026).
-- allows_accounts: هل يُسمح بفتح حسابات بهذه العملة. (بديل is_cash في التصميم القديم: لا كاش في النظام.)

CREATE TABLE currencies (
  code            text PRIMARY KEY CHECK (code ~ '^[A-Z]{3,5}$'),
  name_ar         text NOT NULL,
  symbol          text,
  decimals        smallint NOT NULL DEFAULT 2,
  allows_accounts boolean NOT NULL DEFAULT true
);

INSERT INTO currencies (code, name_ar, symbol, allows_accounts) VALUES
  ('ILS',  'شيكل',        '₪',   true),
  ('USD',  'دولار',       '$',   true),
  ('EUR',  'يورو',        '€',   true),
  ('EGP',  'جنيه مصري',   'ج.م', true),
  ('JOD',  'دينار أردني', 'د.أ', true),
  ('USDT', 'تيثر USDT',   '₮',   true);
