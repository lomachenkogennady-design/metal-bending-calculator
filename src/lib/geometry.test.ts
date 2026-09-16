import { describe, it, expect } from 'vitest'
import { buildProfile } from './geometry'

const uProfile = {
  id: 'u',
  flanges: [40, 80, 40],
  turns: [1, 1],
  cs: [[1, 1], [1, 1]] as [number, number][],
}

describe('buildProfile — П-образный', () => {
  const g = buildProfile(uProfile, 2, 2.56, [90, 90])

  it('полигон не пустой', () => {
    expect(g.polygon.length).toBeGreaterThan(0)
  })

  it('bbox корректен', () => {
    expect(g.bbox.maxX - g.bbox.minX).toBeGreaterThan(0)
    expect(g.bbox.maxY - g.bbox.minY).toBeGreaterThan(0)
  })

  it('толщина и радиус сохранены', () => {
    expect(g.thickness).toBe(2)
    expect(g.radius).toBeCloseTo(2.56, 2)
  })

  it('замкнутость = false', () => {
    expect(g.closed).toBe(false)
  })
})

describe('buildProfile — защита от невалидных данных', () => {
  it('flanges = [] — пустой полигон, не падает', () => {
    const g = buildProfile({ ...uProfile, flanges: [] }, 2, 2.56, [])
    expect(g.polygon).toEqual([])
  })

  it('flanges = [40] — пустой полигон, не падает', () => {
    const g = buildProfile({ ...uProfile, flanges: [40] }, 2, 2.56, [])
    expect(g.polygon).toEqual([])
  })

  it('закрытый профиль короче 3 полок — пустой полигон', () => {
    const g = buildProfile(
      { ...uProfile, flanges: [30, 60], closed: true },
      2, 2.56, [90]
    )
    expect(g.polygon).toEqual([])
  })
})
