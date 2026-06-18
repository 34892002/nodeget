import { useState, useEffect, useCallback } from 'react'
import { fetchAllNodes, saveTrafficConfig, clearTrafficConfig, type NodeTrafficConfig } from './lib/api'

function bytes(n: number): string {
  if (n >= 1099511627776) return (n / 1099511627776).toFixed(2) + ' TB'
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB'
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

function parseSizeInput(input: string): number | null {
  const s = input.trim().toUpperCase()
  const m = s.match(/^([\d.]+)\s*(TB|GB|MB|KB|B)?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2] || 'GB'
  const multipliers: Record<string, number> = {
    TB: 1099511627776,
    GB: 1073741824,
    MB: 1048576,
    KB: 1024,
    B: 1,
  }
  return Math.round(n * multipliers[unit])
}

interface EditingState {
  limitInput: string
  period: 'monthly' | 'daily'
  resetDay: number
}

export default function App() {
  const [nodes, setNodes] = useState<NodeTrafficConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, EditingState>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const loadNodes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllNodes()
      setNodes(data)
      // Initialize editing state for nodes with existing config
      const init: Record<string, EditingState> = {}
      for (const n of data) {
        if (n.trafficLimit) {
          init[n.uuid] = {
            limitInput: bytes(n.trafficLimit),
            period: n.trafficPeriod,
            resetDay: n.trafficResetDay,
          }
        }
      }
      setEditing(init)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadNodes() }, [loadNodes])

  const startEdit = (uuid: string) => {
    const n = nodes.find(x => x.uuid === uuid)
    setEditing(prev => ({
      ...prev,
      [uuid]: {
        limitInput: n?.trafficLimit ? bytes(n.trafficLimit) : '',
        period: n?.trafficPeriod || 'monthly',
        resetDay: n?.trafficResetDay || 1,
      },
    }))
  }

  const handleSave = async (uuid: string) => {
    const state = editing[uuid]
    if (!state) return
    const limitBytes = parseSizeInput(state.limitInput)
    if (!limitBytes) {
      alert('请输入有效的流量上限，例如: 1TB, 500GB, 30GB')
      return
    }
    setSaving(prev => ({ ...prev, [uuid]: true }))
    try {
      await saveTrafficConfig(uuid, {
        trafficLimit: limitBytes,
        trafficPeriod: state.period,
        trafficResetDay: state.resetDay,
      })
      await loadNodes()
    } catch (e: any) {
      alert('保存失败: ' + (e.message || e))
    } finally {
      setSaving(prev => ({ ...prev, [uuid]: false }))
    }
  }

  const handleClear = async (uuid: string) => {
    if (!confirm('确定清除该节点的流量配置？')) return
    setSaving(prev => ({ ...prev, [uuid]: true }))
    try {
      await clearTrafficConfig(uuid)
      setEditing(prev => {
        const next = { ...prev }
        delete next[uuid]
        return next
      })
      await loadNodes()
    } catch (e: any) {
      alert('清除失败: ' + (e.message || e))
    } finally {
      setSaving(prev => ({ ...prev, [uuid]: false }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p>加载节点中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-lg max-w-md">
          <p className="font-semibold mb-2">加载失败</p>
          <p className="text-sm">{error}</p>
          <button onClick={loadNodes} className="mt-3 text-sm text-red-600 underline">重试</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">流量监控配置</h1>
          <p className="text-sm text-gray-500 mt-1">
            为每个节点配置流量上限，状态展示页面将显示流量进度条
          </p>
        </div>

        {nodes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无节点</div>
        ) : (
          <div className="space-y-4">
            {nodes.map(node => (
              <NodeRow
                key={node.uuid}
                node={node}
                editState={editing[node.uuid]}
                isSaving={saving[node.uuid]}
                onStartEdit={() => startEdit(node.uuid)}
                onSave={() => handleSave(node.uuid)}
                onClear={() => handleClear(node.uuid)}
                onChange={(state) => setEditing(prev => ({ ...prev, [node.uuid]: state }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NodeRow({
  node,
  editState,
  isSaving,
  onStartEdit,
  onSave,
  onClear,
  onChange,
}: {
  node: NodeTrafficConfig
  editState?: EditingState
  isSaving: boolean
  onStartEdit: () => void
  onSave: () => void
  onClear: () => void
  onChange: (state: EditingState) => void
}) {
  const isConfigured = node.trafficLimit != null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{node.name}</span>
            {node.region && (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {node.region}
              </span>
            )}
            {isConfigured && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                已配置
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{node.uuid}</p>
          {isConfigured && !editState && (
            <div className="mt-2 text-sm text-gray-600">
              <span className="font-medium">{bytes(node.trafficLimit!)}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span>{node.trafficPeriod === 'daily' ? '每天' : '每月'}</span>
              {node.trafficPeriod === 'monthly' && (
                <span className="text-gray-400 ml-1">（{node.trafficResetDay}号重置）</span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          {!editState ? (
            <>
              <button
                onClick={onStartEdit}
                className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
              >
                {isConfigured ? '修改' : '配置'}
              </button>
              {isConfigured && (
                <button
                  onClick={onClear}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  清除
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => onChange(undefined as any)}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {editState && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">流量上限</label>
              <input
                type="text"
                value={editState.limitInput}
                onChange={e => onChange({ ...editState, limitInput: e.target.value })}
                placeholder="例如: 1TB, 500GB, 30GB"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">周期类型</label>
              <select
                value={editState.period}
                onChange={e => onChange({ ...editState, period: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="monthly">每月</option>
                <option value="daily">每天</option>
              </select>
            </div>
            {editState.period === 'monthly' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">每月重置日</label>
                <select
                  value={editState.resetDay}
                  onChange={e => onChange({ ...editState, resetDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} 号</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
