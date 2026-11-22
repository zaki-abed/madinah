-- 0004: الحسابات. لا يوجد نوع CASH (لا كاش في النظام)، ولا يوجد عمود رصيد:
-- الرصيد يُحسب في v_account_balances من دفتر القيود.

CREATE TYPE account_type AS ENUM (
  'BANK',              -- بنك
  'PAYPAL',            -- PayPal (خزنة مستقلة)
  'PAYMENT_PLATFORM',  -- منصة دفع وتحويل
  'EG_WALLET',         -- محفظة مصرية
  'PS_WALLET',         -- محفظة فلسطينية
  'USDT_PLATFORM',     -- منصة USDT
  'CARD_APP'           -- تطبيق بطاقات
);

CREATE TYPE account_status AS ENUM (
  'ACTIVE',      -- نشط
  'RESTRICTED',  -- مقيّد
  'FROZEN',      -- مجمّد
  'CLOSED'       -- مغلق
);

CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  name            text NOT NULL CHECK (btrim(name) <> ''),
  type            account_type NOT NULL,
  currency        text NOT NULL REFERENCES currencies (code),
  initial_balance numeric(18,4) NOT NULL DEFAULT 0,
  color           text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  status          account_status NOT NULL DEFAULT 'ACTIVE',
  created_by      uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE INDEX accounts_currency_idx ON accounts (currency);

CREATE TRIGGER accounts_touch BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- العملة يجب أن تسمح بفتح حسابات.
CREATE FUNCTION accounts_validate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT (SELECT c.allows_accounts FROM currencies c WHERE c.code = NEW.currency) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD006',
      MESSAGE = 'لا يُسمح بفتح حسابات بهذه العملة.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_validate BEFORE INSERT OR UPDATE OF currency ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_validate();
