import { describe, expect, it } from 'vitest'
import { formatRupees, monthKey, parseAmountToPaise } from './accounting'

describe('accounting amount helpers', () => {
  it('stores decimal rupees as integer paise', () => {
    expect(parseAmountToPaise('1,250.55')).toBe(125055)
  })

  it('rejects zero and invalid amounts', () => {
    expect(() => parseAmountToPaise('0')).toThrow()
    expect(() => parseAmountToPaise('not money')).toThrow()
  })

  it('formats paise using the INR locale', () => {
    expect(formatRupees(10050)).toContain('100.50')
  })

  it('trims whitespace before parsing', () => {
    expect(parseAmountToPaise('  500  ')).toBe(50000)
  })

  it('rejects negative amounts', () => {
    expect(() => parseAmountToPaise('-10')).toThrow()
  })
})

describe('monthKey', () => {
  it('groups dates by their year-month', () => {
    expect(monthKey('2025-03-15')).toBe('2025-03')
    expect(monthKey('2025-03-31')).toBe(monthKey('2025-03-01'))
    expect(monthKey('2025-04-01')).not.toBe(monthKey('2025-03-31'))
  })
})
