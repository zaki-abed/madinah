-- 0008: تسجيل الدخول والجلسات.
-- التطبيق لا يقرأ password_hash أبداً: التحقق وتعيين كلمة المرور داخل دوال القاعدة.

-- الجلسات. الرمز نفسه لا يُحفظ: يُحفظ SHA-256 له فقط.
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  remember   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- عدّاد المحاولات الخاطئة لكل اسم مستخدم (سواء كان موجوداً أم لا).
CREATE TABLE login_throttle (
  username       citext PRIMARY KEY,
  failed_count   integer NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until   timestamptz
);

-- تعيين كلمة المرور (bcrypt، 12 جولة).
CREATE FUNCTION auth_hash_password(p_password text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION USING ERRCODE = 'MD010',
      MESSAGE = 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
  END IF;
  IF octet_length(p_password) > 72 THEN
    RAISE EXCEPTION USING ERRCODE = 'MD010',
      MESSAGE = 'كلمة المرور طويلة جداً.';
  END IF;
  RETURN crypt(p_password, gen_salt('bf', 12));
END;
$$;

CREATE FUNCTION auth_create_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      user_role DEFAULT 'EMPLOYEE'
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO users (username, password_hash, full_name, role)
  VALUES (btrim(p_username), auth_hash_password(p_password), btrim(p_full_name), p_role)
  RETURNING id
$$;

CREATE FUNCTION auth_set_password(p_user_id uuid, p_password text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE users SET password_hash = auth_hash_password(p_password) WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'MD011', MESSAGE = 'المستخدم غير موجود.';
  END IF;
  -- تغيير كلمة المرور يُنهي كل الجلسات المفتوحة.
  DELETE FROM sessions WHERE user_id = p_user_id;
  DELETE FROM login_throttle WHERE username = (SELECT username FROM users WHERE id = p_user_id);
END;
$$;

-- تسجيل الدخول. النتيجة:
--   OK      + user_id        : البيانات صحيحة والحساب نشط.
--   INVALID                  : اسم مستخدم أو كلمة مرور غير صحيحة (أو مستخدم معطّل).
--   LOCKED  + locked_until   : قفل 15 دقيقة بعد 5 محاولات خاطئة متتالية.
-- تُستدعى كعبارة مستقلة (autocommit) حتى يُحفظ عدّاد المحاولات الخاطئة.
CREATE FUNCTION auth_login(p_username text, p_password text)
RETURNS TABLE (status text, user_id uuid, locked_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_attempts constant integer  := 5;
  c_lock_for     constant interval := interval '15 minutes';
  v_name   citext := btrim(COALESCE(p_username, ''));
  v_user   users%ROWTYPE;
  v_thr    login_throttle%ROWTYPE;
  v_ok     boolean := false;
  v_count  integer;
  v_locked timestamptz;
BEGIN
  DELETE FROM login_throttle t
  WHERE t.last_failed_at < now() - interval '1 day';

  INSERT INTO login_throttle (username) VALUES (v_name) ON CONFLICT DO NOTHING;
  SELECT * INTO v_thr FROM login_throttle t WHERE t.username = v_name FOR UPDATE;

  IF v_thr.locked_until IS NOT NULL AND v_thr.locked_until > now() THEN
    RETURN QUERY SELECT 'LOCKED'::text, NULL::uuid, v_thr.locked_until;
    RETURN;
  END IF;

  SELECT * INTO v_user FROM users u WHERE u.username = v_name;
  IF FOUND THEN
    v_ok := v_user.is_active
            AND v_user.password_hash = crypt(COALESCE(p_password, ''), v_user.password_hash);
  ELSE
    -- نفس كلفة الحساب تقريباً حتى لا يكشف زمن الرد وجود اسم المستخدم.
    PERFORM crypt(COALESCE(p_password, ''), gen_salt('bf', 12));
  END IF;

  IF v_ok THEN
    DELETE FROM login_throttle t WHERE t.username = v_name;
    UPDATE users SET last_login_at = now() WHERE id = v_user.id;
    INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
    VALUES (v_user.id, 'LOGIN', 'users', v_user.id::text, 'تسجيل دخول');
    RETURN QUERY SELECT 'OK'::text, v_user.id, NULL::timestamptz;
    RETURN;
  END IF;

  -- محاولة خاطئة. العدّاد يبدأ من جديد إذا مضى على آخر خطأ أكثر من مدة القفل.
  v_count := CASE
    WHEN v_thr.last_failed_at IS NULL OR v_thr.last_failed_at < now() - c_lock_for THEN 1
    ELSE v_thr.failed_count + 1
  END;
  v_locked := CASE WHEN v_count >= c_max_attempts THEN now() + c_lock_for END;

  UPDATE login_throttle t
  SET failed_count   = CASE WHEN v_locked IS NULL THEN v_count ELSE 0 END,
      last_failed_at = now(),
      locked_until   = v_locked
  WHERE t.username = v_name;

  IF v_locked IS NOT NULL THEN
    RETURN QUERY SELECT 'LOCKED'::text, NULL::uuid, v_locked;
  ELSE
    RETURN QUERY SELECT 'INVALID'::text, NULL::uuid, NULL::timestamptz;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION auth_hash_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_create_user(text, text, text, user_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_set_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_login(text, text) FROM PUBLIC;
