-- 0003: المستخدمون والصلاحيات.

CREATE TYPE user_role AS ENUM ('ADMIN', 'EMPLOYEE');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  username      citext NOT NULL UNIQUE CHECK (btrim(username::text) <> ''),
  -- bcrypt عبر pgcrypto: crypt(password, gen_salt('bf', 12)). لا تُحفظ كلمة المرور نصاً أبداً.
  password_hash text NOT NULL CHECK (password_hash ~ '^\$2[abxy]?\$'),
  full_name     text NOT NULL CHECK (btrim(full_name) <> ''),
  role          user_role NOT NULL DEFAULT 'EMPLOYEE',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- صف واحد لكل مستخدم، ويُحذف مع المستخدم.
CREATE TABLE user_permissions (
  user_id       uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  can_edit      boolean NOT NULL DEFAULT true,
  can_delete    boolean NOT NULL DEFAULT false,
  view_reports  boolean NOT NULL DEFAULT false,
  manage_users  boolean NOT NULL DEFAULT false,
  view_balances boolean NOT NULL DEFAULT true,
  view_profit   boolean NOT NULL DEFAULT false
);

CREATE FUNCTION users_create_permissions() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_permissions (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER users_permissions_row AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION users_create_permissions();
