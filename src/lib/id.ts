export const uid = (prefix = ''): string =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
