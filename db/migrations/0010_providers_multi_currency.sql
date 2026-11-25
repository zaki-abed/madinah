-- 0010: الحساب متعدد العملات (قرار 22/11/2026).
--   providers (الجهات) ← accounts (الحسابات) ← account_currencies (عملات الحساب)
-- القيود تُربط بـ account_currencies، فيبقى كل رصيد بعملة واحدة.
-- اسم الحساب فريد داخل جهته فقط.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts) THEN
    RAISE EXCEPTION 'توجد حسابات في الجدول القديم. هذا الـ migration يفترض أن جدول الحسابات فارغ.';
  END IF;
END;
$$;

-- ───────────── إزالة ما يعتمد على النموذج القديم (حساب بعملة واحدة) ─────────────
DROP VIEW v_account_balances;
DROP TRIGGER accounts_guard_movements ON accounts;
DROP TRIGGER accounts_validate ON accounts;
DROP FUNCTION accounts_guard_movements();
DROP FUNCTION accounts_validate();
DROP FUNCTION ledger_post(uuid, numeric, ledger_source, uuid, timestamptz, text);
DROP FUNCTION account_has_movements(uuid);

-- ───────────── فريق العمل: «المسؤول عنه في المكتب» ─────────────
-- قائمة مستقلة عن مستخدمي النظام، وتُدار من النظام.
CREATE TABLE staff_members (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  name       text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── الجهات ─────────────
CREATE TABLE providers (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  name       text NOT NULL CHECK (btrim(name) <> ''),
  type       account_type NOT NULL,
  -- قالب حقول الحساب في نموذج «إضافة حساب».
  template   text NOT NULL CHECK (template IN ('bank', 'paypal', 'emi', 'cardapp', 'crypto', 'vf', 'ip', 'plw')),
  -- العملات المتاحة لحسابات هذه الجهة. فارغة = بلا أرصدة (تطبيقات البطاقات).
  currencies text[] NOT NULL DEFAULT '{}',
  is_builtin boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_card_app_no_currencies CHECK (type <> 'CARD_APP' OR currencies = '{}')
);

CREATE UNIQUE INDEX providers_name_key ON providers (lower(name));
-- PayPal جهة واحدة فقط (خزنة مستقلة).
CREATE UNIQUE INDEX providers_single_paypal ON providers (type) WHERE type = 'PAYPAL';

CREATE FUNCTION providers_validate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.currencies) AS x(code)
    WHERE NOT EXISTS (SELECT 1 FROM currencies c WHERE c.code = x.code AND c.allows_accounts)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD006', MESSAGE = 'عملة غير معرّفة في عملات الجهة.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER providers_validate BEFORE INSERT OR UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION providers_validate();

INSERT INTO providers (name, type, template, currencies, is_builtin) VALUES
  ('بنك فلسطين',    'BANK',             'bank',    '{ILS,USD,JOD}', true),
  ('البنك العربي',  'BANK',             'bank',    '{ILS,USD,JOD}', true),
  ('PayPal',        'PAYPAL',           'paypal',  '{USD,EUR}',     true),
  ('Cash Plus',     'PAYMENT_PLATFORM', 'emi',     '{USD,JOD,EUR}', true),
  ('KAST',          'CARD_APP',         'cardapp', '{}',            true),
  ('nsave',         'CARD_APP',         'cardapp', '{}',            true),
  ('Binance',       'USDT_PLATFORM',    'crypto',  '{USDT}',        true),
  ('Bybit',         'USDT_PLATFORM',    'crypto',  '{USDT}',        true),
  ('Kraken',        'USDT_PLATFORM',    'crypto',  '{USDT}',        true),
  ('Vodafone Cash', 'EG_WALLET',        'vf',      '{EGP}',         true),
  ('InstaPay',      'EG_WALLET',        'ip',      '{EGP}',         true),
  ('JAWWAL Pay',    'PS_WALLET',        'plw',     '{ILS,USD}',     true),
  ('PalPay',        'PS_WALLET',        'plw',     '{ILS,USD}',     true),
  ('Maalchat',      'PS_WALLET',        'plw',     '{ILS,USD}',     true);

-- ───────────── الحسابات: تتبع جهة، وبلا عملة ولا رصيد ─────────────
ALTER TABLE accounts
  DROP CONSTRAINT accounts_name_key,
  DROP COLUMN type,
  DROP COLUMN currency,
  DROP COLUMN initial_balance,
  ADD COLUMN provider_id    uuid NOT NULL REFERENCES providers (id),
  ADD COLUMN responsible_id uuid REFERENCES staff_members (id),
  -- بيانات الجهة حسب قالبها (IBAN، البريد، رقم المحفظة…). تُعبَّأ من نموذج «إضافة حساب».
  ADD COLUMN details        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  ADD CONSTRAINT accounts_provider_name_key UNIQUE (provider_id, name);

-- ───────────── عملات الحساب: وحدة الرصيد والكشف ─────────────
CREATE TABLE account_currencies (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id      uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  currency        text NOT NULL REFERENCES currencies (code),
  initial_balance numeric(18,4) NOT NULL DEFAULT 0,
  opening_date    date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jerusalem')::date),
  created_by      uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, currency)
);

CREATE INDEX account_currencies_currency_idx ON account_currencies (currency);

CREATE TRIGGER account_currencies_touch BEFORE UPDATE ON account_currencies
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ───────────── دفتر القيود يُربط بعملة الحساب ─────────────
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_account_id_fkey;
ALTER TABLE ledger_entries RENAME COLUMN account_id TO account_currency_id;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_account_currency_id_fkey
  FOREIGN KEY (account_currency_id) REFERENCES account_currencies (id);
ALTER INDEX ledger_entries_account_idx RENAME TO ledger_entries_account_currency_idx;

CREATE OR REPLACE FUNCTION ledger_entries_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING ERRCODE = 'MD005',
      MESSAGE = 'لا يمكن تفريغ دفتر القيود.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = 'MD005',
      MESSAGE = 'القيد لا يُعدَّل. أي تغيير يكون عبر الحركة المالية نفسها.';
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'MD005',
      MESSAGE = 'لا كتابة مباشرة على دفتر القيود. القيود تولّدها الحركات المالية فقط.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.currency <> (SELECT ac.currency FROM account_currencies ac WHERE ac.id = NEW.account_currency_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD007',
      MESSAGE = 'عملة القيد لا تطابق عملة الحساب.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION ledger_post(
  p_account_currency_id uuid,
  p_amount              numeric,
  p_source_type         ledger_source,
  p_source_id           uuid,
  p_entry_at            timestamptz,
  p_description         text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO ledger_entries (entry_at, currency, account_currency_id, amount, source_type, source_id, description)
  SELECT p_entry_at, ac.currency, ac.id, p_amount, p_source_type, p_source_id, p_description
  FROM account_currencies ac
  WHERE ac.id = p_account_currency_id
$$;

REVOKE ALL ON FUNCTION ledger_post(uuid, numeric, ledger_source, uuid, timestamptz, text) FROM PUBLIC;

-- ───────────── هل توجد حركات؟ ─────────────
-- كل مرحلة تضيف جدول حركات تعيد تعريف الدالة الأولى (CREATE OR REPLACE) لتشمل جدولها،
-- حتى تُحتسب الحركات الملغاة أيضاً (الإلغاء يحذف القيود ويُبقي صف الحركة).
CREATE FUNCTION account_currency_has_movements(p_account_currency_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.account_currency_id = p_account_currency_id)
$$;

CREATE FUNCTION account_has_movements(p_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_currencies ac
    WHERE ac.account_id = p_account_id AND account_currency_has_movements(ac.id)
  )
$$;

-- ───────────── قواعد عملات الحساب ─────────────
-- العملة من عملات الجهة فقط.
CREATE FUNCTION account_currencies_validate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounts a JOIN providers p ON p.id = a.provider_id
    WHERE a.id = NEW.account_id AND NEW.currency = ANY (p.currencies)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD006',
      MESSAGE = 'هذه العملة غير متاحة لحسابات هذه الجهة.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER account_currencies_validate BEFORE INSERT OR UPDATE OF currency, account_id ON account_currencies
  FOR EACH ROW EXECUTE FUNCTION account_currencies_validate();

-- بعد أول حركة: العملة لا تُحذف، والرصيد الافتتاحي وتاريخه يُقفلان.
CREATE FUNCTION account_currencies_guard_movements() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.currency = OLD.currency
     AND NEW.account_id = OLD.account_id
     AND NEW.initial_balance = OLD.initial_balance
     AND NEW.opening_date = OLD.opening_date THEN
    RETURN NEW;
  END IF;
  IF account_currency_has_movements(OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'لا يمكن حذف عملة عليها حركات.';
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'الرصيد الافتتاحي مقفل بعد أول حركة على العملة. التصحيح يكون بحركة تسوية مع سبب.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER account_currencies_guard_movements BEFORE UPDATE OR DELETE ON account_currencies
  FOR EACH ROW EXECUTE FUNCTION account_currencies_guard_movements();

-- ───────────── قواعد الحساب ─────────────
-- حساب عليه حركة: لا يُحذف ولا يُنقل إلى جهة أخرى. والنقل يتطلب أن تكون عملاته متاحة في الجهة الجديدة.
CREATE FUNCTION accounts_guard_movements() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF account_has_movements(OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'لا يمكن حذف حساب عليه حركات. يمكن تغيير حالته إلى «مغلق» بدلاً من الحذف.';
    END IF;
    RETURN OLD;
  END IF;

  NEW.name := btrim(NEW.name);
  IF NEW.provider_id <> OLD.provider_id THEN
    IF account_has_movements(OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'لا يمكن نقل حساب عليه حركات إلى جهة أخرى.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM account_currencies ac, providers p
      WHERE ac.account_id = OLD.id AND p.id = NEW.provider_id AND NOT (ac.currency = ANY (p.currencies))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD006',
        MESSAGE = 'في الحساب عملة غير متاحة في الجهة الجديدة.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_guard_movements BEFORE UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_guard_movements();

-- ───────────── الأرصدة والخزائن ─────────────
-- رصيد كل عملة في كل حساب = الافتتاحي + مجموع القيود.
-- الخزنة = مجموع أرصدة عملتها في كل الحسابات. دولار PayPal خزنة مستقلة (PAYPAL).
CREATE VIEW v_account_currency_balances AS
SELECT
  ac.id AS account_currency_id,
  ac.account_id,
  ac.currency,
  ac.initial_balance,
  ac.opening_date,
  COALESCE(sum(l.amount), 0)::numeric(18,4) AS movements_total,
  (ac.initial_balance + COALESCE(sum(l.amount), 0))::numeric(18,4) AS balance,
  CASE WHEN p.type = 'PAYPAL' AND ac.currency = 'USD' THEN 'PAYPAL' ELSE ac.currency END AS vault_key
FROM account_currencies ac
JOIN accounts a ON a.id = ac.account_id
JOIN providers p ON p.id = a.provider_id
LEFT JOIN ledger_entries l ON l.account_currency_id = ac.id
GROUP BY ac.id, p.type;

-- ───────────── سجل تغيير حالة الحساب ─────────────
CREATE TABLE account_status_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  from_status account_status,
  to_status   account_status NOT NULL,
  -- أرصدة الحساب لحظة التغيير: [{"currency": "USD", "balance": "100.0000"}]
  balances    jsonb NOT NULL DEFAULT '[]',
  changed_by  uuid REFERENCES users (id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_status_history_account_idx ON account_status_history (account_id, id);

CREATE FUNCTION accounts_log_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NULL;
  END IF;
  INSERT INTO account_status_history (account_id, from_status, to_status, balances, changed_by)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('currency', b.currency, 'balance', b.balance::text) ORDER BY b.currency)
      FROM v_account_currency_balances b WHERE b.account_id = NEW.id
    ), '[]'),
    app_current_user_id()
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER accounts_log_status AFTER INSERT OR UPDATE OF status ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_log_status();

-- ───────────── التدقيق ─────────────
CREATE TRIGGER providers_audit AFTER INSERT OR UPDATE OR DELETE ON providers
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER staff_members_audit AFTER INSERT OR UPDATE OR DELETE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER account_currencies_audit AFTER INSERT OR UPDATE OR DELETE ON account_currencies
  FOR EACH ROW EXECUTE FUNCTION audit_row();

-- ───────────── صلاحيات دور التطبيق ─────────────
GRANT SELECT, INSERT ON providers TO madinah_app;
GRANT SELECT, INSERT, UPDATE ON staff_members TO madinah_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_currencies TO madinah_app;
GRANT SELECT ON account_status_history TO madinah_app;
GRANT SELECT ON v_account_currency_balances TO madinah_app;
