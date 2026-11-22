-- 0005: دفتر القيود. المصدر الوحيد للأرصدة.
-- موجب = دخل الحساب، سالب = خرج منه.
-- يُكتب بالـ Triggers فقط: لا كتابة مباشرة من أي دور، حتى مالك القاعدة.
-- (أعمدة الزبون والمكتب تُضاف في المرحلة الرابعة مع جداولها.)

CREATE TYPE ledger_source AS ENUM (
  'TRANSFER', 'EXPENSE', 'DEBT', 'DEBT_PAYMENT', 'CUSTOMER_ADJUSTMENT'
);

CREATE TABLE ledger_entries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_at    timestamptz NOT NULL,
  currency    text NOT NULL REFERENCES currencies (code),
  account_id  uuid NOT NULL REFERENCES accounts (id),
  amount      numeric(18,4) NOT NULL CHECK (amount <> 0),
  source_type ledger_source NOT NULL,
  source_id   uuid NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, entry_at);
CREATE INDEX ledger_entries_source_idx ON ledger_entries (source_type, source_id);

-- الحارس: القيد لا يُعدَّل أبداً، ولا يُضاف أو يُحذف إلا من داخل Trigger حركة مالية.
CREATE FUNCTION ledger_entries_guard() RETURNS trigger
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
  -- العمق 1 = كتابة مباشرة. العمق 2 فأكثر = من داخل Trigger جدول حركات.
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'MD005',
      MESSAGE = 'لا كتابة مباشرة على دفتر القيود. القيود تولّدها الحركات المالية فقط.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  -- عملة القيد = عملة الحساب (العملات لا تُخلط).
  IF NEW.currency <> (SELECT a.currency FROM accounts a WHERE a.id = NEW.account_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD007',
      MESSAGE = 'عملة القيد لا تطابق عملة الحساب.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard();

CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_entries_guard();

-- دالتان تستعملهما Triggers الحركات المالية في المراحل القادمة.
CREATE FUNCTION ledger_post(
  p_account_id  uuid,
  p_amount      numeric,
  p_source_type ledger_source,
  p_source_id   uuid,
  p_entry_at    timestamptz,
  p_description text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO ledger_entries (entry_at, currency, account_id, amount, source_type, source_id, description)
  SELECT p_entry_at, a.currency, a.id, p_amount, p_source_type, p_source_id, p_description
  FROM accounts a
  WHERE a.id = p_account_id
$$;

CREATE FUNCTION ledger_clear(p_source_type ledger_source, p_source_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  DELETE FROM ledger_entries WHERE source_type = p_source_type AND source_id = p_source_id
$$;

REVOKE ALL ON FUNCTION ledger_post(uuid, numeric, ledger_source, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger_clear(ledger_source, uuid) FROM PUBLIC;

-- رصيد كل حساب = الافتتاحي + مجموع القيود.
CREATE VIEW v_account_balances AS
SELECT
  a.id AS account_id,
  a.name,
  a.type,
  a.currency,
  a.status,
  a.initial_balance,
  COALESCE(sum(l.amount), 0)::numeric(18,4) AS movements_total,
  (a.initial_balance + COALESCE(sum(l.amount), 0))::numeric(18,4) AS balance
FROM accounts a
LEFT JOIN ledger_entries l ON l.account_id = a.id
GROUP BY a.id;

-- هل على الحساب أي حركة؟
-- كل مرحلة تضيف جدول حركات تعيد تعريف هذه الدالة (CREATE OR REPLACE) لتشمل جدولها،
-- حتى تُحتسب الحركات الملغاة أيضاً (الإلغاء يحذف القيود ويُبقي صف الحركة).
CREATE FUNCTION account_has_movements(p_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.account_id = p_account_id)
$$;

-- الحساب الذي عليه حركة: لا يُحذف، ولا تتغير عملته، ويُقفل رصيده الافتتاحي.
CREATE FUNCTION accounts_guard_movements() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.currency = OLD.currency
     AND NEW.initial_balance = OLD.initial_balance THEN
    RETURN NEW;
  END IF;
  IF account_has_movements(v_id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'لا يمكن حذف حساب عليه حركات. يمكن تغيير حالته فقط.';
    ELSIF NEW.currency <> OLD.currency THEN
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'لا يمكن تغيير عملة حساب عليه حركات.';
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'MD004',
        MESSAGE = 'الرصيد الافتتاحي مقفل بعد أول حركة على الحساب. التصحيح يكون بحركة تسوية مع سبب.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER accounts_guard_movements BEFORE UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_guard_movements();
