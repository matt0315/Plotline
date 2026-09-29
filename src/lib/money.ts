const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export const money = (n: number, cents = false): string => (cents ? usdCents : usd).format(Number.isFinite(n) ? n : 0)

export const toNumber = (v: string): number => {
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
