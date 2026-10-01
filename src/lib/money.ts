/**
 * Event money. Each event has its own currency for planning; the Plotline subscription itself is always billed in USD.
 * Rates are rough units-per-USD, only used to turn the USD template costs into a starting estimate
 * and to offer an approximate conversion when an event's currency changes.
 */
export const CURRENCIES: Record<string, { name: string; perUsd: number }> = {
  USD: { name: 'US dollar', perUsd: 1 },
  AUD: { name: 'Australian dollar', perUsd: 1.52 },
  NZD: { name: 'New Zealand dollar', perUsd: 1.68 },
  CAD: { name: 'Canadian dollar', perUsd: 1.37 },
  GBP: { name: 'British pound', perUsd: 0.76 },
  EUR: { name: 'Euro', perUsd: 0.88 },
  CHF: { name: 'Swiss franc', perUsd: 0.82 },
  SEK: { name: 'Swedish krona', perUsd: 9.6 },
  NOK: { name: 'Norwegian krone', perUsd: 10.2 },
  DKK: { name: 'Danish krone', perUsd: 6.6 },
  PLN: { name: 'Polish złoty', perUsd: 3.7 },
  AED: { name: 'UAE dirham', perUsd: 3.67 },
  SAR: { name: 'Saudi riyal', perUsd: 3.75 },
  QAR: { name: 'Qatari riyal', perUsd: 3.64 },
  ILS: { name: 'Israeli shekel', perUsd: 3.5 },
  ZAR: { name: 'South African rand', perUsd: 18 },
  INR: { name: 'Indian rupee', perUsd: 86 },
  SGD: { name: 'Singapore dollar', perUsd: 1.3 },
  HKD: { name: 'Hong Kong dollar', perUsd: 7.8 },
  MYR: { name: 'Malaysian ringgit', perUsd: 4.3 },
  THB: { name: 'Thai baht', perUsd: 33 },
  PHP: { name: 'Philippine peso', perUsd: 57 },
  IDR: { name: 'Indonesian rupiah', perUsd: 16300 },
  JPY: { name: 'Japanese yen', perUsd: 148 },
  KRW: { name: 'South Korean won', perUsd: 1380 },
  CNY: { name: 'Chinese yuan', perUsd: 7.2 },
  MXN: { name: 'Mexican peso', perUsd: 18.8 },
  BRL: { name: 'Brazilian real', perUsd: 5.5 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)
export const currencyOptions = CURRENCY_CODES.map((c) => ({ value: c, label: `${c} · ${CURRENCIES[c].name}` }))

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const BY_REGION: Record<string, string> = {
  AU: 'AUD', NZ: 'NZD', CA: 'CAD', GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS',
  ZA: 'ZAR', IN: 'INR', SG: 'SGD', HK: 'HKD', MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR', JP: 'JPY', KR: 'KRW', CN: 'CNY', MX: 'MXN', BR: 'BRL',
  ...Object.fromEntries(EURO.map((r) => [r, 'EUR'])),
}

/** A sensible default from the browser's locale, e.g. en-AU → AUD. */
export const localCurrency = () => {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? ''
    return BY_REGION[region] ?? 'USD'
  } catch {
    return 'USD'
  }
}

export const isCurrency = (c: unknown): c is string => typeof c === 'string' && c in CURRENCIES

const formats = new Map<string, Intl.NumberFormat>()
const formatter = (currency: string, cents: boolean, display: 'symbol' | 'code' = 'symbol') => {
  const code = isCurrency(currency) ? currency : 'USD'
  const key = `${code}:${cents}:${display}`
  let f = formats.get(key)
  if (!f) {
    // The viewer's own locale, so an Australian sees AUD as "$" and USD as "USD"/"US$".
    f = new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: display, maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 })
    formats.set(key, f)
  }
  return f
}

export const formatMoney = (n: number, currency: string, cents = false): string => formatter(currency, cents).format(Number.isFinite(n) ? n : 0)

export type Money = (n: number, cents?: boolean) => string
export const moneyFor =
  (currency: string): Money =>
  (n, cents = false) =>
    formatMoney(n, currency, cents)

/** For jsPDF's built-in fonts, which only cover Latin-1 (+ €): falls back to "INR 1,200" where the symbol can't print. */
export const pdfMoneyFor =
  (currency: string): Money =>
  (n, cents = false) => {
    const s = formatMoney(n, currency, cents)
    return /[^\u0020-\u00ff€]/.test(s.replace(/[\u00a0\u202f]/g, ' ')) ? formatter(currency, cents, 'code').format(Number.isFinite(n) ? n : 0).replace(/[\u00a0\u202f]/g, ' ') : s.replace(/\u202f/g, ' ')
  }

/** "$", "A$", "€" — for column headers like "$/hr". */
export const currencySymbol = (currency: string) => formatter(currency, false).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency

/** Approximate conversion between two event currencies, rounded to a tidy figure. */
export const convert = (n: number, from: string, to: string) => {
  if (!n || from === to || !isCurrency(from) || !isCurrency(to)) return n
  return tidy((n / CURRENCIES[from].perUsd) * CURRENCIES[to].perUsd)
}

/** Round a converted amount so it reads like an estimate rather than an FX result. */
export const tidy = (n: number) => {
  const a = Math.abs(n)
  const step = a >= 100000 ? 1000 : a >= 10000 ? 100 : a >= 1000 ? 50 : a >= 100 ? 5 : 1
  return Math.round(n / step) * step
}

export const toNumber = (v: string): number => {
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
