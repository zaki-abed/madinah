-- 0009: صلاحيات دور التطبيق (madinah_app). الدور يُنشئه أمر: npm run db:setup
-- القاعدة: التطبيق يأخذ أقل ما يحتاجه فقط. كل migration لاحق يمنح صلاحيات جداوله صراحةً.

GRANT USAGE ON SCHEMA public TO madinah_app;

-- بيانات مرجعية
GRANT SELECT ON currencies TO madinah_app;

-- المستخدمون: قراءة بدون password_hash. الإنشاء وتغيير كلمة المرور عبر دوال auth_* فقط.
GRANT SELECT (id, username, full_name, role, is_active, last_login_at, created_at, updated_at)
  ON users TO madinah_app;
GRANT SELECT ON user_permissions TO madinah_app;

-- الحسابات: الحذف يمر على حارس القاعدة (مرفوض إن وُجدت حركات).
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO madinah_app;

-- دفتر القيود والتدقيق: قراءة فقط.
GRANT SELECT ON ledger_entries TO madinah_app;
GRANT SELECT ON v_account_balances TO madinah_app;
GRANT SELECT ON audit_logs TO madinah_app;

-- الجلسات وتسجيل الدخول
GRANT SELECT, INSERT, DELETE ON sessions TO madinah_app;
GRANT EXECUTE ON FUNCTION auth_login(text, text) TO madinah_app;
