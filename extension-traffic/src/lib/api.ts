import { WebSocketRPCClient } from './wsRpcClient'

const search = location.hash.replace(/^#/, '')
const params = new URLSearchParams(search)
export const token = params.get('token') || ''
export const agentUuid = params.get('node') || ''

const wsOrigin = params.get('ws') || `wss://${location.host}`
export const client = new WebSocketRPCClient(wsOrigin)
client.connect()

// ── Agent UUID ──

export async function listAgentUuids(): Promise<string[]> {
  const r = await client.rpc<{ uuids?: string[] }>('nodeget-server_list_all_agent_uuid', { token })
  return (r as any)?.uuids || []
}

// ── KV ──

interface KvItem {
  namespace: string
  key: string
  value: unknown
}

export async function kvGetMulti(
  items: { namespace: string; key: string }[],
): Promise<KvItem[]> {
  if (!items.length) return []
  return client.rpc<KvItem[]>('kv_get_multi_value', {
    token,
    namespace_key: items,
  })
}

export async function kvSetValue(
  namespace: string,
  key: string,
  value: unknown,
): Promise<void> {
  await client.rpc('kv_set_value', {
    token,
    namespace,
    key,
    value,
  })
}

// ── Dynamic Summary (latest) ──

interface DynamicSummary {
  uuid: string
  timestamp: number
  total_received?: number
  total_transmitted?: number
}

export async function dynamicSummaryMulti(
  uuids: string[],
  fields: string[],
): Promise<DynamicSummary[]> {
  if (!uuids.length) return []
  return client.rpc<DynamicSummary[]>('agent_dynamic_summary_multi_last_query', {
    token,
    uuids,
    fields,
  })
}

// ── Metadata KV helpers ──

const META_KEYS = [
  'metadata_name',
  'metadata_region',
  'metadata_traffic_limit',
  'metadata_traffic_period',
  'metadata_traffic_reset_day',
]

export interface NodeTrafficConfig {
  uuid: string
  name: string
  region: string
  trafficLimit: number | null
  trafficPeriod: 'monthly' | 'daily'
  trafficResetDay: number
  totalReceived: number
  totalTransmitted: number
}

export async function fetchAllNodes(): Promise<NodeTrafficConfig[]> {
  const uuids = await listAgentUuids()
  if (!uuids.length) return []

  // Fetch metadata KV
  const kvItems = uuids.flatMap(u => META_KEYS.map(k => ({ namespace: u, key: k })))
  const [kvData, dynData] = await Promise.all([
    kvGetMulti(kvItems),
    dynamicSummaryMulti(uuids, ['total_received', 'total_transmitted']),
  ])

  // Group KV by uuid
  const kvMap = new Map<string, Record<string, unknown>>()
  for (const row of kvData) {
    if (!row || row.value == null) continue
    let bucket = kvMap.get(row.namespace)
    if (!bucket) kvMap.set(row.namespace, (bucket = {}))
    bucket[row.key] = row.value
  }

  // Group dynamic by uuid
  const dynMap = new Map<string, { total_received?: number; total_transmitted?: number }>()
  for (const row of dynData) {
    dynMap.set(row.uuid, row)
  }

  return uuids.map(uuid => {
    const kv = kvMap.get(uuid) || {}
    const dyn = dynMap.get(uuid) || {}
    const limit = Number(kv.metadata_traffic_limit)
    const period = String(kv.metadata_traffic_period || '')
    const resetDay = Number(kv.metadata_traffic_reset_day)

    return {
      uuid,
      name: kv.metadata_name ? String(kv.metadata_name) : uuid.slice(0, 8),
      region: kv.metadata_region ? String(kv.metadata_region) : '',
      trafficLimit: Number.isFinite(limit) && limit > 0 ? limit : null,
      trafficPeriod: period === 'daily' ? 'daily' : 'monthly',
      trafficResetDay: Number.isFinite(resetDay) && resetDay >= 1 && resetDay <= 31 ? resetDay : 1,
      totalReceived: dyn.total_received ?? 0,
      totalTransmitted: dyn.total_transmitted ?? 0,
    }
  })
}

export async function saveTrafficConfig(
  uuid: string,
  config: {
    trafficLimit: number
    trafficPeriod: 'monthly' | 'daily'
    trafficResetDay: number
  },
): Promise<void> {
  await Promise.all([
    kvSetValue(uuid, 'metadata_traffic_limit', config.trafficLimit),
    kvSetValue(uuid, 'metadata_traffic_period', config.trafficPeriod),
    kvSetValue(uuid, 'metadata_traffic_reset_day', config.trafficResetDay),
  ])
}

export async function clearTrafficConfig(uuid: string): Promise<void> {
  await Promise.all([
    kvSetValue(uuid, 'metadata_traffic_limit', null),
    kvSetValue(uuid, 'metadata_traffic_period', null),
    kvSetValue(uuid, 'metadata_traffic_reset_day', null),
  ])
}
