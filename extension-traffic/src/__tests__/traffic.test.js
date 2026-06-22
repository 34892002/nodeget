import { describe, it, expect } from 'vitest'

// ── 模拟纯逻辑函数 ──

const PERIOD_LABELS = {
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  never: '不限流量',
}

function periodLabel(period) {
  return PERIOD_LABELS[period] || '每月'
}

function parsePeriod(raw) {
  if (['hourly', 'daily', 'weekly', 'monthly', 'never'].includes(raw)) return raw
  return 'monthly'
}

function parseTrafficConfig(kvData) {
  const limitGb = Number(kvData.metadata_traffic_limit)
  const period = String(kvData.metadata_traffic_period || '')
  if (!Number.isFinite(limitGb) || limitGb <= 0) return null
  return {
    trafficLimitGb: limitGb,
    trafficPeriod: parsePeriod(period),
  }
}

function calcTrafficPercent(totalReceived, totalTransmitted, limitGb) {
  const GB = 1073741824
  const used = totalReceived + totalTransmitted
  const limit = limitGb * GB
  return (used / limit) * 100
}

function trafficStatus(percent) {
  if (percent >= 100) return 'over'
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warning'
  return 'normal'
}

// ── 测试 ──

describe('parsePeriod', () => {
  it('有效周期直接返回', () => {
    expect(parsePeriod('hourly')).toBe('hourly')
    expect(parsePeriod('daily')).toBe('daily')
    expect(parsePeriod('weekly')).toBe('weekly')
    expect(parsePeriod('monthly')).toBe('monthly')
    expect(parsePeriod('never')).toBe('never')
  })

  it('无效周期默认 monthly', () => {
    expect(parsePeriod('')).toBe('monthly')
    expect(parsePeriod('xxx')).toBe('monthly')
    expect(parsePeriod('DAILY')).toBe('monthly')
  })
})

describe('periodLabel', () => {
  it('返回正确的中文标签', () => {
    expect(periodLabel('hourly')).toBe('每小时')
    expect(periodLabel('daily')).toBe('每天')
    expect(periodLabel('weekly')).toBe('每周')
    expect(periodLabel('monthly')).toBe('每月')
    expect(periodLabel('never')).toBe('不限流量')
  })

  it('未知周期默认每月', () => {
    expect(periodLabel('xxx')).toBe('每月')
    expect(periodLabel('')).toBe('每月')
  })
})

describe('parseTrafficConfig', () => {
  it('正常配置解析', () => {
    const result = parseTrafficConfig({
      metadata_traffic_limit: 1000,
      metadata_traffic_period: 'monthly',
    })
    expect(result).toEqual({
      trafficLimitGb: 1000,
      trafficPeriod: 'monthly',
    })
  })

  it('limit 为 0 返回 null', () => {
    expect(parseTrafficConfig({
      metadata_traffic_limit: 0,
      metadata_traffic_period: 'daily',
    })).toBeNull()
  })

  it('limit 为负数返回 null', () => {
    expect(parseTrafficConfig({
      metadata_traffic_limit: -100,
      metadata_traffic_period: 'daily',
    })).toBeNull()
  })

  it('limit 为空返回 null', () => {
    expect(parseTrafficConfig({
      metadata_traffic_period: 'daily',
    })).toBeNull()
  })

  it('limit 为非数字返回 null', () => {
    expect(parseTrafficConfig({
      metadata_traffic_limit: 'abc',
      metadata_traffic_period: 'daily',
    })).toBeNull()
  })

  it('无效周期默认 monthly', () => {
    const result = parseTrafficConfig({
      metadata_traffic_limit: 500,
      metadata_traffic_period: 'invalid',
    })
    expect(result.trafficPeriod).toBe('monthly')
  })

  it('周期为空默认 monthly', () => {
    const result = parseTrafficConfig({
      metadata_traffic_limit: 500,
    })
    expect(result.trafficPeriod).toBe('monthly')
  })
})

describe('calcTrafficPercent', () => {
  const GB = 1073741824

  it('500GB 用量 / 1000GB 上限 = 50%', () => {
    const percent = calcTrafficPercent(500 * GB, 0, 1000)
    expect(percent).toBeCloseTo(50, 1)
  })

  it('收发合计计算', () => {
    const percent = calcTrafficPercent(300 * GB, 200 * GB, 1000)
    expect(percent).toBeCloseTo(50, 1)
  })

  it('超出 100%', () => {
    const percent = calcTrafficPercent(1100 * GB, 0, 1000)
    expect(percent).toBeCloseTo(110, 1)
  })

  it('零流量', () => {
    const percent = calcTrafficPercent(0, 0, 1000)
    expect(percent).toBe(0)
  })

  it('精确满额', () => {
    const percent = calcTrafficPercent(1000 * GB, 0, 1000)
    expect(percent).toBeCloseTo(100, 1)
  })
})

describe('trafficStatus', () => {
  it('正常 (<75%)', () => {
    expect(trafficStatus(0)).toBe('normal')
    expect(trafficStatus(50)).toBe('normal')
    expect(trafficStatus(74.9)).toBe('normal')
  })

  it('警告 (75-90%)', () => {
    expect(trafficStatus(75)).toBe('warning')
    expect(trafficStatus(85)).toBe('warning')
    expect(trafficStatus(89.9)).toBe('warning')
  })

  it('危险 (90-100%)', () => {
    expect(trafficStatus(90)).toBe('critical')
    expect(trafficStatus(95)).toBe('critical')
    expect(trafficStatus(99.9)).toBe('critical')
  })

  it('超出 (>=100%)', () => {
    expect(trafficStatus(100)).toBe('over')
    expect(trafficStatus(150)).toBe('over')
  })
})
