-- 0006: قواعد الإلغاء العامة. تُربط بكل جدول حركات مالية عند إنشائه:
--   SELECT enable_cancel_rules('transfers');
-- الجدول يجب أن يحتوي الأعمدة: cancelled_at timestamptz، cancelled_by uuid، cancel_reason text.
--
-- ما تفرضه:
--   1. لا DELETE أبداً. الإلغاء فقط.
--   2. الإلغاء = تعبئة cancelled_at و cancelled_by و cancel_reason معاً، والسبب إلزامي وغير فارغ.
--   3. الإلغاء لا يغيّر أي حقل آخر في العملية.
--   4. العملية الملغاة لا تُعدَّل ولا يُتراجع عن إلغائها.
-- عكس الأثر المالي (حذف قيود العملية) يقوم به Trigger القيود الخاص بكل جدول.

CREATE FUNCTION cancel_forbid_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'MD002',
    MESSAGE = 'لا حذف للعمليات المالية. يمكن إلغاء العملية فقط مع ذكر السبب.';
END;
$$;

CREATE FUNCTION cancel_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c_cancel_cols constant text[] := ARRAY['cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'MD003',
      MESSAGE = 'العملية ملغاة ولا يمكن تعديلها.';
  END IF;

  IF NEW.cancelled_at IS NULL AND NEW.cancelled_by IS NULL AND NEW.cancel_reason IS NULL THEN
    RETURN NEW;  -- عملية سارية
  END IF;

  -- من هنا: العملية تُلغى الآن.
  NEW.cancel_reason := btrim(COALESCE(NEW.cancel_reason, ''));
  IF NEW.cancel_reason = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'MD001',
      MESSAGE = 'سبب الإلغاء إلزامي.';
  END IF;
  NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  NEW.cancelled_by := COALESCE(NEW.cancelled_by, app_current_user_id());
  IF NEW.cancelled_by IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'MD001',
      MESSAGE = 'لا يمكن الإلغاء بدون تحديد المستخدم الذي ألغى.';
  END IF;

  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - c_cancel_cols) <> (to_jsonb(OLD) - c_cancel_cols) THEN
    RAISE EXCEPTION USING ERRCODE = 'MD003',
      MESSAGE = 'الإلغاء لا يغيّر بيانات العملية. يُسجَّل السبب فقط.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION enable_cancel_rules(p_table regclass) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text := (SELECT relname FROM pg_class WHERE oid = p_table);
BEGIN
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I CHECK (
       (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
       OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
           AND cancel_reason IS NOT NULL AND btrim(cancel_reason) <> %L)
     )', p_table, v_name || '_cancel_complete', '');
  -- الاسم يبدأ بـ a_ ليعمل قبل باقي الـ BEFORE Triggers على الجدول.
  EXECUTE format(
    'CREATE TRIGGER a_cancel_guard BEFORE INSERT OR UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION cancel_guard()', p_table);
  EXECUTE format(
    'CREATE TRIGGER a_cancel_forbid_delete BEFORE DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION cancel_forbid_delete()', p_table);
  EXECUTE format(
    'CREATE TRIGGER a_cancel_forbid_truncate BEFORE TRUNCATE ON %s
       FOR EACH STATEMENT EXECUTE FUNCTION cancel_forbid_delete()', p_table);
END;
$$;

REVOKE ALL ON FUNCTION enable_cancel_rules(regclass) FROM PUBLIC;
