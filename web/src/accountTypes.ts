// الأنواع والحالات والأقسام كما تظهر في لوحة «الحسابات والخزائن».

export type AccountType =
  | 'BANK' | 'PAYPAL' | 'PAYMENT_PLATFORM' | 'EG_WALLET' | 'PS_WALLET' | 'USDT_PLATFORM' | 'CARD_APP';
export type AccountStatus = 'ACTIVE' | 'RESTRICTED' | 'FROZEN' | 'CLOSED';

export const STATUSES: AccountStatus[] = ['ACTIVE', 'RESTRICTED', 'FROZEN', 'CLOSED'];
export const STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: 'نشط',
  RESTRICTED: 'مقيّد',
  FROZEN: 'مجمّد',
  CLOSED: 'مغلق',
};
export const STATUS_PILL: Record<AccountStatus, string> = {
  ACTIVE: 'pill ok',
  RESTRICTED: 'pill warn',
  FROZEN: 'pill info',
  CLOSED: 'pill neutral',
};

export type SectionId = 'bank' | 'pay' | 'cards' | 'crypto' | 'wallet' | 'palwallet';

export interface Section {
  id: SectionId;
  name: string;
  sub: string;
  /** تسمية الجهات في هذا القسم: [مفرد، مثنى، جمع]. */
  providersWord: [string, string, string];
  icon: string;
  iconStyle: { background: string; color: string };
  /** الأنواع التي تظهر تحت القسم. PayPal نوع مستقل في القاعدة ويظهر مع منصات الدفع. */
  types: AccountType[];
  /** نوع الجهة الجديدة المضافة من هذا القسم. */
  newType: Exclude<AccountType, 'PAYPAL'>;
  /** العملات الافتراضية لجهة جديدة من هذا القسم (نفس قوالب الخادم). */
  newCurrencies: string[];
  /** صفحة حسابات القسم. */
  page: string | null;
  /** تسمية النوع المختصرة في جداول الخزائن. */
  typeLabel: string;
}

export const SECTIONS: Section[] = [
  { id: 'bank', name: 'البنوك', sub: 'الحسابات البنكية', providersWord: ['بنك واحد', 'بنكان', 'بنوك'], icon: 'M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18', iconStyle: { background: '#E6EEF7', color: '#1F3F66' }, types: ['BANK'], newType: 'BANK', newCurrencies: ['ILS', 'USD', 'JOD'], page: '/banks', typeLabel: 'بنك' },
  { id: 'pay', name: 'منصات الدفع والتحويل', sub: 'رصيد وتحويلات', providersWord: ['منصة واحدة', 'منصتان', 'منصات'], icon: 'M7 7h13l-3-3M17 17H4l3 3', iconStyle: { background: '#DDF5F2', color: '#0A5F56' }, types: ['PAYPAL', 'PAYMENT_PLATFORM'], newType: 'PAYMENT_PLATFORM', newCurrencies: ['USD', 'EUR'], page: null, typeLabel: 'منصة دفع' },
  { id: 'cards', name: 'تطبيقات البطاقات', sub: 'بطاقات وربط', providersWord: ['منصة واحدة', 'منصتان', 'منصات'], icon: 'M3 7h18v10H3zM3 11h18M7 15h3', iconStyle: { background: '#EAEAF6', color: '#3B3D7A' }, types: ['CARD_APP'], newType: 'CARD_APP', newCurrencies: [], page: '/cards', typeLabel: 'تطبيق بطاقات' },
  { id: 'crypto', name: 'منصات USDT', sub: 'USDT فقط', providersWord: ['منصة واحدة', 'منصتان', 'منصات'], icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.5 9h7M12 9v7', iconStyle: { background: '#FDF0D5', color: '#7A5200' }, types: ['USDT_PLATFORM'], newType: 'USDT_PLATFORM', newCurrencies: ['USDT'], page: '/usdt-platforms', typeLabel: 'منصة' },
  { id: 'wallet', name: 'المحافظ المصرية', sub: 'كل محفظة حساب مستقل', providersWord: ['نوع محافظ واحد', 'نوعا محافظ', 'أنواع محافظ'], icon: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2', iconStyle: { background: '#EEF1F5', color: '#3A4A60' }, types: ['EG_WALLET'], newType: 'EG_WALLET', newCurrencies: ['EGP'], page: '/egyptian-wallets', typeLabel: 'محفظة' },
  { id: 'palwallet', name: 'المحافظ الفلسطينية', sub: 'شيكل ودولار · كل محفظة حساب مستقل', providersWord: ['نوع محافظ واحد', 'نوعا محافظ', 'أنواع محافظ'], icon: 'M4 7a2 2 0 0 1 2-2h11v4M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14.5h.01', iconStyle: { background: '#E2F4EC', color: '#136A43' }, types: ['PS_WALLET'], newType: 'PS_WALLET', newCurrencies: ['ILS', 'USD'], page: '/palestinian-wallets', typeLabel: 'محفظة' },
];

export const sectionOf = (type: AccountType): Section => SECTIONS.find((s) => s.types.includes(type))!;

/** صفحة حسابات الجهة، إن وُجدت. */
export function providerPage(provider: { name: string; type: AccountType }): string | null {
  if (provider.type === 'PAYPAL') return '/paypal';
  if (provider.name === 'Cash Plus') return '/cash-plus';
  return sectionOf(provider.type).page;
}

/** «حساب واحد / حسابان / 3 حسابات». */
export const accountsCount = (n: number) => (n === 1 ? 'حساب واحد' : n === 2 ? 'حسابان' : `${n} حسابات`);

/** «بنك واحد / بنكان / 3 بنوك». */
export const countWord = (n: number, [one, two, many]: [string, string, string]) =>
  n === 1 ? one : n === 2 ? two : `${n} ${many}`;

/** حرف الجهة في مربعها: «بنك فلسطين» ← ب، «البنك العربي» ← ع، «PayPal» ← P. */
export function providerInitial(name: string): string {
  const core = name.trim().replace(/^البنك\s+/, '').replace(/^ال/, '');
  return (core.charAt(0) || name.charAt(0)).toUpperCase();
}
