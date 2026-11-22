/** رمز مكتب المدينة (من لوحة Mark.dc.html): قوس أبيض، مسار تيل، ونقطة كهرمانية. */
export function Mark({ size }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M14 54 V30 A18 18 0 0 1 50 30 V54" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      <path d="M24 54 V35 A8 8 0 0 1 40 35 V54" fill="none" stroke="#16B8A6" strokeWidth="7" strokeLinecap="round" />
      <circle cx="32" cy="12" r="4.5" fill="#F2B84B" />
    </svg>
  );
}
