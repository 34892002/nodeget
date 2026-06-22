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

// ── 计费模式解析 (对应 useNodes.ts parseTraffic) ──

const VALID_PERIODS = ['hourly', 'daily', 'weekly', 'monthly', 'never']

function parseTrafficWithBilling(kvData) {
  const billingMode = kvData.metadata_billing_mode === 'payg' ? 'payg' : 'quota'
  const price = Number(kvData.metadata_traffic_price)
  const include = Number(kvData.metadata_traffic_include)
  const limitGb = Number(kvData.metadata_traffic_limit)
  const period = String(kvData.metadata_traffic_period || '')

  if (billingMode === 'payg') {
    return {
      billingMode: 'payg',
      trafficLimitGb: Number.isFinite(limitGb) && limitGb > 0 ? limitGb : null,
      trafficPeriod: VALID_PERIODS.includes(period) ? period : 'never',
      trafficPrice: Number.isFinite(price) && price > 0 ? price : null,
      trafficInclude: Number.isFinite(include) && include > 0 ? include : null,
    }
  }

  if (!Number.isFinite(limitGb) || limitGb <= 0) return null
  return {
    billingMode: 'quota',
    trafficLimitGb: limitGb,
    trafficPeriod: VALID_PERIODS.includes(period) ? period : 'monthly',
    trafficPrice: null,
    trafficInclude: null,
  }
}

// ── 按量计费费用计算 ──

function calcPaygCost(totalReceived, totalTransmitted, price, includeGb) {
  const GB = 1073741824
  const usedGb = (totalReceived + totalTransmitted) / GB
  const included = includeGb || 0
  const billableGb = Math.max(0, usedGb - included)
  return billableGb * price
}

function calcBillableGb(totalReceived, totalTransmitted, includeGb) {
  const GB = 1073741824
  const usedGb = (totalReceived + totalTransmitted) / GB
  const included = includeGb || 0
  return Math.max(0, usedGb - included)
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

describe('parseTrafficWithBilling', () => {
  it('quota 模式正常解析', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'quota',
      metadata_traffic_limit: 1000,
      metadata_traffic_period: 'monthly',
    })
    expect(result).toEqual({
      billingMode: 'quota',
      trafficLimitGb: 1000,
      trafficPeriod: 'monthly',
      trafficPrice: null,
      trafficInclude: null,
    })
  })

  it('payg 模式正常解析', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'payg',
      metadata_traffic_price: 0.5,
      metadata_traffic_include: 100,
    })
    expect(result).toEqual({
      billingMode: 'payg',
      trafficLimitGb: null,
      trafficPeriod: 'never',
      trafficPrice: 0.5,
      trafficInclude: 100,
    })
  })

  it('payg 模式无免费额度', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'payg',
      metadata_traffic_price: 1,
    })
    expect(result.billingMode).toBe('payg')
    expect(result.trafficPrice).toBe(1)
    expect(result.trafficInclude).toBeNull()
  })

  it('payg 模式单价无效返回 null', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'payg',
      metadata_traffic_price: -1,
    })
    expect(result.trafficPrice).toBeNull()
  })

  it('payg 模式可带有效 limit', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'payg',
      metadata_traffic_limit: 500,
      metadata_traffic_price: 0.8,
    })
    expect(result.billingMode).toBe('payg')
    expect(result.trafficLimitGb).toBe(500)
    expect(result.trafficPrice).toBe(0.8)
  })

  it('payg 模式无效 period 默认 never', () => {
    const result = parseTrafficWithBilling({
      metadata_billing_mode: 'payg',
      metadata_traffic_price: 0.5,
      metadata_traffic_period: 'invalid',
    })
    expect(result.trafficPeriod).toBe('never')
  })

  it('quota 模式 limit 为 0 返回 null', () => {
    expect(parseTrafficWithBilling({
      metadata_billing_mode: 'quota',
      metadata_traffic_limit: 0,
    })).toBeNull()
  })

  it('无 billing_mode 字段默认 quota', () => {
    const result = parseTrafficWithBilling({
      metadata_traffic_limit: 200,
      metadata_traffic_period: 'weekly',
    })
    expect(result.billingMode).toBe('quota')
    expect(result.trafficLimitGb).toBe(200)
  })
})

describe('calcPaygCost', () => {
  const GB = 1073741824

  it('无免费额度：全部计费', () => {
    const cost = calcPaygCost(200 * GB, 0, 0.5, 0)
    expect(cost).toBeCloseTo(100, 1)
  })

  it('有免费额度：未超出免费额度费用为 0', () => {
    const cost = calcPaygCost(50 * GB, 0, 0.5, 100)
    expect(cost).toBe(0)
  })

  it('有免费额度：超出部分计费', () => {
    const cost = calcPaygCost(200 * GB, 0, 0.5, 100)
    expect(cost).toBeCloseTo(50, 1)
  })

  it('收发合计计算', () => {
    const cost = calcPaygCost(100 * GB, 100 * GB, 1, 150)
    expect(cost).toBeCloseTo(50, 1)
  })

  it('零流量费用为 0', () => {
    const cost = calcPaygCost(0, 0, 0.5, 100)
    expect(cost).toBe(0)
  })
})

describe('calcBillableGb', () => {
  const GB = 1073741824

  it('无免费额度：全部可计费', () => {
    expect(calcBillableGb(200 * GB, 0, 0)).toBeCloseTo(200, 1)
  })

  it('未超出免费额度：可计费为 0', () => {
    expect(calcBillableGb(50 * GB, 0, 100)).toBe(0)
  })

  it('超出免费额度：超出部分', () => {
    expect(calcBillableGb(200 * GB, 0, 100)).toBeCloseTo(100, 1)
  })

  it('精确满额：可计费为 0', () => {
    expect(calcBillableGb(100 * GB, 0, 100)).toBeCloseTo(0, 1)
  })
})

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
