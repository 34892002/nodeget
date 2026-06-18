import { Wifi } from 'lucide-react'
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
  if (!traffic?.trafficLimitGb) return null

  const used = totalReceived + totalTransmitted
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
