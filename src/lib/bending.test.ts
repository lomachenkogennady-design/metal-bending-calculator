import { describe, it, expect } from 'vitest'
import { calculate, kFactor, recommendedV, innerRadiusFromV, minFlange } from './bending'

const baseInput = {
  materialId: 'stainless',
  thickness: 2,
  profileId: 'u',
  flanges: [40, 80, 40],
  angles: [90, 90],
  length: 1000,
  vMatrix: 16,
  quantity: 64,
  pressTon: 100,
  metalPrice: 550,
  pricePerMeter: 50,
  setupCost: 500,
}

describe('calculate — П-образный AISI 304 t=2 V=16', () => {
  const r = calculate(baseInput as any)

  it('развёртка = 152,3 мм', () => {
    expect(r.flat).toBeCloseTo(152.3, 1)
  })

  it('усилие гибки = 21 т', () => {
    expect(r.forceTon).toBeCloseTo(21, 0)
  })

  it('вес детали = 2,41 кг', () => {
    expect(r.weightPiece).toBeCloseTo(2.41, 2)
  })

  it('вес партии = 154,2 кг', () => {
    expect(r.weightBatch).toBeCloseTo(154.2, 1)
  })

  it('внутренний радиус R = 2,56 мм', () => {
    expect(r.innerRadius).toBeCloseTo(2.56, 2)
  })

  it('K-фактор = 0,40', () => {
    expect(r.kFactor).toBeCloseTo(0.40, 2)
  })

  it('металл = 90 770 ₽ (154,2 × 550 × 1,07)', () => {
    expect(r.cost.metal).toBeCloseTo(90770, 0)
  })

  it('итого с НДС ≈ 119 158 ₽', () => {
    expect(r.cost.total).toBeCloseTo(119158, 0)
  })
})

describe('Справочные функции', () => {
  it('kFactor для R/t = 1,28 → 0,40', () => {
    expect(kFactor(2.56, 2)).toBe(0.40)
  })

  it('recommendedV(2) = 16', () => {
    expect(recommendedV(2)).toBe(16)
  })

  it('innerRadiusFromV(16) = 2,56', () => {
    expect(innerRadiusFromV(16)).toBeCloseTo(2.56, 2)
  })

  it('minFlange(16, 2) = 10', () => {
    expect(minFlange(16, 2)).toBe(10)
  })
})

describe('Граничные случаи', () => {
  it('пустые flanges — не падает', () => {
    expect(() => calculate({ ...baseInput, flanges: [] } as any)).not.toThrow()
  })

  it('0 длины — предупреждение', () => {
    const r = calculate({ ...baseInput, length: 0 } as any)
    expect(r.ok).toBe(false)
  })

  it('превышение тоннажа — warning level=error', () => {
    const r = calculate({ ...baseInput, pressTon: 10 } as any)
    const hasError = r.warnings.some((w) => w.level === 'error')
    expect(hasError).toBe(true)
  })

  it('угол 45° — принимается', () => {
    const r = calculate({ ...baseInput, angles: [45, 45] } as any)
    expect(r.flat).toBeGreaterThan(0)
  })
})
