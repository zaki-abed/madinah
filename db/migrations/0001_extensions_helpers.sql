-- 0001: الإضافات والدوال المساعدة العامة.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- هوية المستخدم الحالي. يضبطها الخادم في بداية كل transaction:
--   SET LOCAL app.user_id = '<uuid>'
CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- يحدّث updated_at تلقائياً عند أي تعديل.
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
