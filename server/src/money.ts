// المبالغ نصوص عشرية (numeric) من القاعدة وإليها. لا تُحوَّل إلى float في أي مكان.

const AMOUNT = /^-?\d{1,14}(\.\d{1,4})?$/;

/** يقرأ مبلغاً أدخله المستخدم ("1,250.50"). الفارغ = صفر. يعيد null إن لم يكن رقماً صالحاً. */
export function parseAmount(input: unknown): string | null {
  if (input === undefined || input === null) return '0';
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const text = String(input).replace(/[,\s]/g, '');
  if (text === '') return '0';
  return AMOUNT.test(text) ? text : null;
}

/** عرض المبلغ: فواصل آلاف ورقمان عشريان (تقريب نصف لأعلى)، بحساب صحيح بلا float. */
export function formatAmount(value: string): string {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const scaled = BigInt(whole + (fraction + '000').slice(0, 3)); // بالألف
  const cents = (scaled + 5n) / 10n;
  const integer = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = (cents % 100n).toString().padStart(2, '0');
  const zero = cents === 0n;
  return `${negative && !zero ? '-' : ''}${integer}.${decimals}`;
}
