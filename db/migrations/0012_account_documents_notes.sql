-- 0012: وثائق الحساب وملاحظاته (من نموذج «إضافة حساب جديد»).

-- الوثيقة تُسجَّل بنوعها وباسم مَن (مثل «جواز سفر · أحمد») بدون رفع ملف. إرفاق الملف مؤجل.
CREATE TABLE account_documents (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  doc_type    text NOT NULL CHECK (btrim(doc_type) <> ''),
  holder_name text NOT NULL CHECK (btrim(holder_name) <> ''),
  expiry_date date,
  note        text,
  created_by  uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_documents_account_idx ON account_documents (account_id);
CREATE INDEX account_documents_identity_idx ON account_documents (doc_type, holder_name);

-- ملاحظات داخلية لا تظهر خارج المكتب.
CREATE TABLE account_notes (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (btrim(body) <> ''),
  created_by uuid REFERENCES users (id) DEFAULT app_current_user_id(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_notes_account_idx ON account_notes (account_id);

CREATE TRIGGER account_documents_audit AFTER INSERT OR UPDATE OR DELETE ON account_documents
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER account_notes_audit AFTER INSERT OR UPDATE OR DELETE ON account_notes
  FOR EACH ROW EXECUTE FUNCTION audit_row();

GRANT SELECT, INSERT, UPDATE, DELETE ON account_documents TO madinah_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_notes TO madinah_app;
