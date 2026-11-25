-- 0013: قرارات 25/11/2026.
--   (أ) لا يوجد «مستخدمون» منفصلون عن «فريق العمل»: جدول users هو فريق العمل، وكلهم بصلاحيات كاملة.
--   (ب) الجهات تُدار من شاشة «الجهات»: إضافة وتعديل وحذف وإيقاف، والقواعد تُفرض هنا.

-- ═════════════════════════ (أ) فريق العمل ═════════════════════════

-- 1. حذف الأدوار والصلاحيات: الكل بصلاحيات كاملة.
DROP FUNCTION auth_create_user(text, text, text, user_role);
DROP TRIGGER users_permissions_row ON users;
DROP FUNCTION users_create_permissions();
DROP TABLE user_permissions;
ALTER TABLE users DROP COLUMN role;
DROP TYPE user_role;

CREATE FUNCTION auth_create_user(p_username text, p_password text, p_full_name text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO users (username, password_hash, full_name)
  VALUES (btrim(p_username), auth_hash_password(p_password), btrim(p_full_name))
  RETURNING id
$$;
REVOKE ALL ON FUNCTION auth_create_user(text, text, text) FROM PUBLIC;

-- 2. «المسؤول عنه» يشير إلى فريق العمل (users) بدل قائمة الأسماء القديمة (staff_members).
--    اسم يطابق عضواً موجوداً: تُربط حساباته به.
--    اسم بلا عضو مطابق: يُنشأ له عضو موقوف بكلمة مرور عشوائية لا يعرفها أحد،
--    فيبقى «المسؤول عنه» محفوظاً، ويُفعَّل لاحقاً من شاشة «فريق العمل».
ALTER TABLE accounts DROP CONSTRAINT accounts_responsible_id_fkey;

DO $$
DECLARE
  s      record;
  v_user uuid;
BEGIN
  FOR s IN SELECT id, name FROM staff_members ORDER BY created_at LOOP
    SELECT u.id INTO v_user FROM users u WHERE u.full_name = s.name ORDER BY u.created_at LIMIT 1;
    IF v_user IS NULL THEN
      INSERT INTO users (username, password_hash, full_name, is_active)
      VALUES (
        'member.' || substr(replace(s.id::text, '-', ''), 21, 12),
        crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
        s.name,
        false
      )
      RETURNING id INTO v_user;
    END IF;
    UPDATE accounts SET responsible_id = v_user WHERE responsible_id = s.id;
  END LOOP;
END;
$$;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES users (id);
DROP TABLE staff_members;

-- 3. اسم الدخول: أحرف إنجليزية صغيرة وأرقام، 3 على الأقل. يُفرض على الإضافة والتعديل فقط،
--    فأسماء الدخول الموجودة تبقى تعمل حتى تُغيَّر.
CREATE FUNCTION users_validate_username() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username = OLD.username THEN
    RETURN NEW;
  END IF;
  NEW.username := lower(btrim(NEW.username::text));
  IF NEW.username::text !~ '^[a-z0-9._]{3,}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'MD012',
      MESSAGE = 'اسم الدخول بالأحرف الإنجليزية والأرقام فقط، 3 أحرف على الأقل.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_validate_username BEFORE INSERT OR UPDATE OF username ON users
  FOR EACH ROW EXECUTE FUNCTION users_validate_username();

-- 4. قواعد فريق العمل:
--    - العضو المسؤول عن حسابات أو له أي أثر في سجل التدقيق (حتى تسجيل الدخول) لا يُحذف، بل يُوقَف.
--    - لا أحد يحذف نفسه أو يوقف نفسه.
--    - يبقى عضو نشط واحد على الأقل.
--    - إيقاف العضو يُنهي جلساته فوراً.
CREATE FUNCTION users_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.id = app_current_user_id() THEN
      RAISE EXCEPTION USING ERRCODE = 'MD013', MESSAGE = 'لا يمكن حذف العضو الحالي.';
    END IF;
    IF EXISTS (SELECT 1 FROM accounts a WHERE a.responsible_id = OLD.id)
       OR EXISTS (SELECT 1 FROM audit_logs g WHERE g.user_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD013',
        MESSAGE = 'لا يمكن حذف عضو له حسابات أو حركات في النظام. يمكن إيقافه بدلاً من الحذف.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_active AND NOT NEW.is_active AND OLD.id = app_current_user_id() THEN
    RAISE EXCEPTION USING ERRCODE = 'MD013', MESSAGE = 'لا يمكن إيقاف العضو الحالي.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_guard BEFORE UPDATE OF is_active OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_guard();

CREATE FUNCTION users_after_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active THEN
    DELETE FROM sessions s WHERE s.user_id = NEW.id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.is_active) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD013', MESSAGE = 'يجب أن يبقى عضو نشط واحد على الأقل.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER users_after_change AFTER UPDATE OF is_active OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_after_change();

-- 5. صلاحيات دور التطبيق: إدارة فريق العمل من الشاشة.
--    كلمات المرور تبقى عبر دوال auth_* فقط، والتطبيق لا يقرأ password_hash.
GRANT UPDATE (username, full_name, is_active), DELETE ON users TO madinah_app;
GRANT EXECUTE ON FUNCTION auth_create_user(text, text, text) TO madinah_app;
GRANT EXECUTE ON FUNCTION auth_set_password(uuid, text) TO madinah_app;

-- ═════════════════════════ (ب) الجهات ═════════════════════════

ALTER TABLE providers ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- الأنواع ثابتة، ولكل نوع عملاته المسموحة وقالب حقوله.
CREATE FUNCTION provider_type_currencies(p_type account_type) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'BANK'             THEN ARRAY['ILS', 'USD', 'JOD', 'EUR']
    WHEN 'PAYMENT_PLATFORM' THEN ARRAY['USD', 'EUR', 'ILS', 'JOD']
    WHEN 'PAYPAL'           THEN ARRAY['USD', 'EUR', 'ILS', 'JOD']
    WHEN 'USDT_PLATFORM'    THEN ARRAY['USDT']
    WHEN 'EG_WALLET'        THEN ARRAY['EGP']
    WHEN 'PS_WALLET'        THEN ARRAY['ILS', 'USD']
    ELSE ARRAY[]::text[]  -- تطبيقات البطاقات: بلا عملات ولا أرصدة
  END
$$;

CREATE FUNCTION provider_type_template(p_type account_type) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'BANK' THEN 'bank' WHEN 'PAYMENT_PLATFORM' THEN 'emi' WHEN 'PAYPAL' THEN 'paypal'
    WHEN 'CARD_APP' THEN 'cardapp' WHEN 'USDT_PLATFORM' THEN 'crypto'
    WHEN 'EG_WALLET' THEN 'vf' WHEN 'PS_WALLET' THEN 'plw'
  END
$$;

CREATE OR REPLACE FUNCTION providers_validate() RETURNS trigger
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
  IF NOT (NEW.currencies <@ provider_type_currencies(NEW.type)) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD006', MESSAGE = 'عملة غير مسموحة لهذا النوع من الجهات.';
  END IF;
  RETURN NEW;
END;
$$;

-- قواعد التعديل والحذف:
--   - الحذف لجهة بلا حسابات فقط (بما فيها الأساسية). جهة PayPal ثابتة: خزنتها وعمولة المكاتب مربوطتان بها.
--   - النوع لا يتغير إذا على الجهة حسابات، ونوع PayPal لا يتغير أبداً.
--   - العملة التي عليها حسابات لا تُحذف من الجهة.
CREATE FUNCTION providers_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'PAYPAL' THEN
      RAISE EXCEPTION USING ERRCODE = 'MD015', MESSAGE = 'جهة PayPal ثابتة في النظام ولا تُحذف.';
    END IF;
    IF EXISTS (SELECT 1 FROM accounts a WHERE a.provider_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD015',
        MESSAGE = 'لا يمكن حذف جهة عليها حسابات. يمكن إيقافها بدلاً من الحذف.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.type <> OLD.type THEN
    IF OLD.type = 'PAYPAL' OR NEW.type = 'PAYPAL' THEN
      RAISE EXCEPTION USING ERRCODE = 'MD015', MESSAGE = 'نوع جهة PayPal ثابت ولا يتغير.';
    END IF;
    IF EXISTS (SELECT 1 FROM accounts a WHERE a.provider_id = OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'MD015', MESSAGE = 'لا يتغير النوع لأن على الجهة حسابات.';
    END IF;
    NEW.template := provider_type_template(NEW.type);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM account_currencies ac JOIN accounts a ON a.id = ac.account_id
    WHERE a.provider_id = OLD.id AND NOT (ac.currency = ANY (NEW.currencies))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD015', MESSAGE = 'العملة التي عليها حسابات لا تُحذف من الجهة.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER providers_guard BEFORE UPDATE OR DELETE ON providers
  FOR EACH ROW EXECUTE FUNCTION providers_guard();

-- الحساب الجديد (أو المنقول): جهته نشطة، و«المسؤول عنه» عضو نشط في فريق العمل.
CREATE FUNCTION accounts_validate_refs() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.provider_id <> OLD.provider_id)
     AND NOT (SELECT p.is_active FROM providers p WHERE p.id = NEW.provider_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD016',
      MESSAGE = 'الجهة موقوفة. لا يُضاف تحتها حساب جديد.';
  END IF;
  IF NEW.responsible_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsible_id IS DISTINCT FROM OLD.responsible_id)
     AND NOT (SELECT u.is_active FROM users u WHERE u.id = NEW.responsible_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD014',
      MESSAGE = '«المسؤول عنه» يجب أن يكون عضواً نشطاً في فريق العمل.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_validate_refs BEFORE INSERT OR UPDATE OF provider_id, responsible_id ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_validate_refs();

GRANT UPDATE, DELETE ON providers TO madinah_app;
