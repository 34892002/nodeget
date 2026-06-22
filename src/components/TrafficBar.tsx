import { Wifi, DollarSign } from 'lucide-react'
import { Progress } from './ui/progress'
import { bytes, pct, trafficPeriodLabel } from '../utils/format'
import { trafficColor } from '../utils/cn'
import type { TrafficConfig } from '../types'

const GB = 1073741824

interface Props {
  traffic: TrafficConfig | null
  totalReceived: number
  totalTransmitted: number
  compact?: boolean
}

export function TrafficBar({ traffic, totalReceived, totalTransmitted, compact }: Props) {
  const used = totalReceived + totalTransmitted

  // No config at all
  if (!traffic) {
    return null
  }

  // Payg mode
  if (traffic.billingMode === 'payg') {
    const included = traffic.trafficInclude ?? 0
    const price = traffic.trafficPrice ?? 0
    const usedGb = used / GB
    const billableGb = Math.max(0, usedGb - included)
    const cost = billableGb * price

    if (compact) {
      return (
        <div className="min-w-0" title="按量计费">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              流量计费
            </span>
            <span className="font-mono text-amber-500 font-semibold">
              ¥{cost.toFixed(2)}
            </span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground mt-1.5 truncate">
            已用 {usedGb.toFixed(1)} GB{included > 0 ? ` / 含 ${included} GB` : ''}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            流量计费
          </span>
          <span className="text-xs text-muted-foreground">
            ¥{price}/GB
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono font-medium">
            {usedGb.toFixed(2)} GB
          </span>
          {included > 0 && (
            <span className="text-muted-foreground">含 {included} GB 免费</span>
          )}
        </div>
        {included > 0 && (
          <Progress
            value={Math.min((usedGb / included) * 100, 100)}
            indicatorClassName={usedGb > included ? 'bg-amber-500' : 'bg-blue-500'}
            className="h-2.5"
          />
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {included > 0 && usedGb <= included ? (
              '在免费额度内'
            ) : included > 0 ? (
              <span className="text-amber-500">已超出免费额度</span>
            ) : (
              '按使用量计费'
            )}
          </span>
          <span className="font-mono text-amber-500">预估 ¥{cost.toFixed(2)}</span>
        </div>
      </div>
    )
  }

  // Unlimited (quota + never)
  if (!traffic.trafficLimitGb) {
    if (compact) {
      return (
        <div className="min-w-0" title="不限流量">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              流量
            </span>
            <span className="font-mono text-muted-foreground">∞</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted" />
          <div className="font-mono text-[11px] text-muted-foreground mt-1 truncate">
            {bytes(used)} / ∞
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Wifi className="h-4 w-4" />
            流量使用
          </span>
          <span className="text-xs text-muted-foreground">
            不限流量
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono font-medium">
            {bytes(used)}
          </span>
          <span className="text-muted-foreground">/ ∞</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>不限流量</span>
          <span className="font-mono">{bytes(used)}</span>
        </div>
      </div>
    )
  }

  // Quota mode with limit
  const limit = traffic.trafficLimitGb * GB
  const percent = (used / limit) * 100
  const over = percent >= 100
  const color = trafficColor(percent)

  if (compact) {
    return (
      <div className="min-w-0" title={trafficPeriodLabel(traffic.trafficPeriod)}>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Wifi className="h-3 w-3" />
            流量
          </span>
          <span className={`font-mono ${over ? 'text-rose-500 font-semibold' : ''}`}>
            {pct(Math.min(percent, 100))}
          </span>
        </div>
        <Progress
          value={Math.min(percent, 100)}
          indicatorClassName={color}
          className="mt-1 h-1.5"
        />
        <div className="font-mono text-[11px] text-muted-foreground mt-1 truncate">
          {bytes(used)} / {bytes(limit)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Wifi className="h-4 w-4" />
          流量使用
        </span>
        <span className="text-xs text-muted-foreground">
          {trafficPeriodLabel(traffic.trafficPeriod)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={`font-mono font-medium ${over ? 'text-rose-500' : ''}`}>
          {bytes(used)}
        </span>
        <span className="text-muted-foreground">/ {bytes(limit)}</span>
      </div>
      <Progress
        value={Math.min(percent, 100)}
        indicatorClassName={color}
        className="h-2.5"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {over ? (
            <span className="text-rose-500 font-medium">已超出限制!</span>
          ) : percent >= 90 ? (
            <span className="text-rose-500">即将用尽</span>
          ) : percent >= 75 ? (
            <span className="text-amber-500">用量较高</span>
          ) : (
            '用量正常'
          )}
        </span>
        <span className="font-mono">{pct(percent)}</span>
      </div>
    </div>
  )
}
