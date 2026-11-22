// المبالغ نصوص عشرية كما تأتي من الخادم (numeric). كل الحساب هنا بأعداد صحيحة (BigInt) بلا float.

const SCALE = 4;

function toUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = BigInt(whole + (fraction + '0'.repeat(SCALE)).slice(0, SCALE));
  return negative ? -units : units;
}

function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const text = (negative ? -units : units).toString().padStart(SCALE + 1, '0');
  return `${negative ? '-' : ''}${text.slice(0, -SCALE)}.${text.slice(-SCALE)}`;
}

/** مجموع مبالغ بنفس العملة. */
export function sumAmounts(values: string[]): string {
  return fromUnits(values.reduce((total, value) => total + toUnits(value), 0n));
}

export const isNegative = (value: string) => toUnits(value) < 0n;

/** العرض: فواصل آلاف ورقمان عشريان (تقريب نصف لأعلى). السالب بعلامة −. */
export function formatAmount(value: string, options: { sign?: boolean } = {}): string {
  const units = toUnits(value);
  const negative = units < 0n;
  const cents = ((negative ? -units : units) + 50n) / 100n;
  const integer = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = (cents % 100n).toString().padStart(2, '0');
  const prefix = cents === 0n ? '' : negative ? '−' : options.sign ? '+' : '';
  return `${prefix}${integer}.${decimals}`;
}
