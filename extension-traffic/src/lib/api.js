import { WebSocketRPCClient } from './wsRpcClient'

const search = location.hash.replace(/^#/, '')
const params = new URLSearchParams(search)
export const token = params.get('token') || ''
export const agentUuid = params.get('node') || ''

const wsOrigin = params.get('ws') || `wss://${location.host}`
export const client = new WebSocketRPCClient(wsOrigin)
client.connect()

// ── Agent UUID ──

export async function listAgentUuids() {
  const r = await client.rpc('nodeget-server_list_all_agent_uuid', { token })
  return r?.uuids || []
}

// ── KV ──

export async function kvGetMulti(items) {
  if (!items.length) return []
  return client.rpc('kv_get_multi_value', {
    token,
    namespace_key: items,
  })
}

export async function kvSetValue(namespace, key, value) {
  await client.rpc('kv_set_value', {
    token,
    namespace,
    key,
    value,
  })
}

// ── Dynamic Summary (latest) ──

export async function dynamicSummaryMulti(uuids, fields) {
  if (!uuids.length) return []
  return client.rpc('agent_dynamic_summary_multi_last_query', {
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
  'metadata_billing_mode',
  'metadata_traffic_price',
  'metadata_traffic_include',
  'metadata_traffic_used',
]

export async function fetchAllNodes() {
  const uuids = await listAgentUuids()
  if (!uuids.length) return []

  const kvItems = uuids.flatMap(u => META_KEYS.map(k => ({ namespace: u, key: k })))
  const [kvData, dynData] = await Promise.all([
    kvGetMulti(kvItems),
    dynamicSummaryMulti(uuids, ['total_received', 'total_transmitted']),
  ])

  const kvMap = new Map()
  for (const row of kvData) {
    if (!row || row.value == null) continue
    let bucket = kvMap.get(row.namespace)
    if (!bucket) kvMap.set(row.namespace, (bucket = {}))
    bucket[row.key] = row.value
  }

  const dynMap = new Map()
  for (const row of dynData) {
    dynMap.set(row.uuid, row)
  }

  return uuids.map(uuid => {
    const kv = kvMap.get(uuid) || {}
    const dyn = dynMap.get(uuid) || {}
    const billingMode = kv.metadata_billing_mode === 'payg' ? 'payg' : 'quota'
    const limitGb = Number(kv.metadata_traffic_limit)
    const period = String(kv.metadata_traffic_period || '')
    const price = Number(kv.metadata_traffic_price)
    const include = Number(kv.metadata_traffic_include)

    return {
      uuid,
      name: kv.metadata_name ? String(kv.metadata_name) : uuid.slice(0, 8),
      region: kv.metadata_region ? String(kv.metadata_region) : '',
      billingMode,
      trafficLimitGb: Number.isFinite(limitGb) && limitGb > 0 ? limitGb : null,
      trafficPeriod: parsePeriod(period),
      trafficPrice: Number.isFinite(price) && price > 0 ? price : null,
      trafficInclude: Number.isFinite(include) && include > 0 ? include : null,
      trafficUsed: Number(kv.metadata_traffic_used) || 0,
      totalReceived: dyn.total_received ?? 0,
      totalTransmitted: dyn.total_transmitted ?? 0,
    }
  })
}

function parsePeriod(raw) {
  if (['hourly', 'daily', 'weekly', 'monthly', 'never'].includes(raw)) return raw
  return 'monthly'
}

export async function saveTrafficConfig(uuid, config) {
  await Promise.all([
    kvSetValue(uuid, 'metadata_billing_mode', config.billingMode || 'quota'),
    kvSetValue(uuid, 'metadata_traffic_limit', config.trafficLimitGb),
    kvSetValue(uuid, 'metadata_traffic_period', config.trafficPeriod),
    kvSetValue(uuid, 'metadata_traffic_price', config.trafficPrice),
    kvSetValue(uuid, 'metadata_traffic_include', config.trafficInclude),
  ])
}

export async function clearTrafficConfig(uuid) {
  await Promise.all([
    kvSetValue(uuid, 'metadata_billing_mode', null),
    kvSetValue(uuid, 'metadata_traffic_limit', null),
    kvSetValue(uuid, 'metadata_traffic_period', null),
    kvSetValue(uuid, 'metadata_traffic_price', null),
    kvSetValue(uuid, 'metadata_traffic_include', null),
    kvSetValue(uuid, 'metadata_traffic_used', null),
    kvSetValue(uuid, 'metadata_traffic_period_start', null),
    kvSetValue(uuid, 'metadata_traffic_period_base', null),
  ])
}
