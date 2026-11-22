-- 0007: سجل التدقيق. يُملأ تلقائياً بالـ Triggers (قبل/بعد)، وكلمات المرور لا تُحفظ فيه.

CREATE TYPE audit_action AS ENUM (
  'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'REOPEN', 'INVENTORY'
);

CREATE TABLE audit_logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action     audit_action NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at);

-- Trigger عام. المعامل الأول (اختياري) اسم عمود المفتاح، والافتراضي id.
CREATE FUNCTION audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c_hidden constant text[] := ARRAY['password_hash'];
  c_noise  constant text[] := ARRAY['updated_at', 'last_login_at'];
  v_pk      text := COALESCE(TG_ARGV[0], 'id');
  v_before  jsonb;
  v_after   jsonb;
  v_details text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_before := to_jsonb(OLD) - c_hidden; END IF;
  IF TG_OP <> 'DELETE' THEN v_after  := to_jsonb(NEW) - c_hidden; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) -> 'password_hash') IS DISTINCT FROM (to_jsonb(NEW) -> 'password_hash') THEN
      v_details := 'تغيير كلمة المرور';
    ELSIF (v_before - c_noise) = (v_after - c_noise) THEN
      RETURN NULL;  -- لا تغيير فعلي (مثل تحديث وقت آخر دخول)
    END IF;
  END IF;

  INSERT INTO audit_logs (user_id, action, entity, entity_id, details, before, after)
  VALUES (
    app_current_user_id(),
    (CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END)::audit_action,
    TG_TABLE_NAME,
    COALESCE(v_after, v_before) ->> v_pk,
    v_details,
    v_before,
    v_after
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row();

CREATE TRIGGER user_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION audit_row('user_id');

CREATE TRIGGER accounts_audit AFTER INSERT OR UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION audit_row();
