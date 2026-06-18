<template>
  <div class="min-h-screen bg-gray-50 p-4 sm:p-6">
    <div class="max-w-4xl mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="min-h-screen flex items-center justify-center text-gray-500">
        <div class="text-center">
          <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p>加载节点中...</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="min-h-screen flex items-center justify-center">
        <div class="bg-red-50 text-red-700 p-6 rounded-lg max-w-md">
          <p class="font-semibold mb-2">加载失败</p>
          <p class="text-sm">{{ error }}</p>
          <button @click="loadNodes" class="mt-3 text-sm text-red-600 underline">重试</button>
        </div>
      </div>

      <!-- Content -->
      <template v-else>
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900">流量监控配置</h1>
          <p class="text-sm text-gray-500 mt-1">
            为每个节点配置流量上限，状态展示页面将显示流量进度条
          </p>
        </div>

        <div v-if="nodes.length === 0" class="text-center py-12 text-gray-400">暂无节点</div>

        <div v-else class="space-y-4">
          <div v-for="node in nodes" :key="node.uuid" class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-900 truncate">{{ node.name }}</span>
                  <span v-if="node.region" class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {{ node.region }}
                  </span>
                  <span v-if="node.trafficLimitGb" class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                    已配置
                  </span>
                </div>
                <p class="text-xs text-gray-400 font-mono mt-0.5">{{ node.uuid }}</p>
                <div v-if="node.trafficLimitGb && !editing[node.uuid]" class="mt-2 text-sm text-gray-600">
                  <span class="font-medium">{{ node.trafficLimitGb }} GB</span>
                  <span class="text-gray-400 mx-1">/</span>
                  <span>{{ periodLabel(node.trafficPeriod) }}</span>
                </div>
              </div>

              <div class="flex gap-2 shrink-0">
                <template v-if="!editing[node.uuid]">
                  <button
                    @click="startEdit(node.uuid)"
                    class="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    {{ node.trafficLimitGb ? '修改' : '配置' }}
                  </button>
                  <button
                    v-if="node.trafficLimitGb"
                    @click="handleClear(node.uuid)"
                    :disabled="saving[node.uuid]"
                    class="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    清除
                  </button>
                </template>
                <button
                  v-else
                  @click="cancelEdit(node.uuid)"
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>

            <!-- Edit form -->
            <div v-if="editing[node.uuid]" class="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">流量上限 (GB)</label>
                  <input
                    type="number"
                    v-model.number="editing[node.uuid].limitGb"
                    placeholder="例如: 1000"
                    min="1"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">流量重置</label>
                  <select
                    v-model="editing[node.uuid].period"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="hourly">每小时</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                    <option value="never">从不</option>
                  </select>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="handleSave(node.uuid)"
                  :disabled="saving[node.uuid]"
                  class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {{ saving[node.uuid] ? '保存中...' : '保存' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { fetchAllNodes, saveTrafficConfig, clearTrafficConfig } from './lib/api'

const PERIOD_LABELS = {
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  never: '从不',
}

function periodLabel(period) {
  return PERIOD_LABELS[period] || '每月'
}

const nodes = ref([])
const loading = ref(true)
const error = ref(null)
const editing = reactive({})
const saving = reactive({})

async function loadNodes() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchAllNodes()
    nodes.value = data
    for (const n of data) {
      if (n.trafficLimitGb) {
        editing[n.uuid] = {
          limitGb: n.trafficLimitGb,
          period: n.trafficPeriod,
        }
      }
    }
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}

function startEdit(uuid) {
  const n = nodes.value.find(x => x.uuid === uuid)
  editing[uuid] = {
    limitGb: n?.trafficLimitGb || null,
    period: n?.trafficPeriod || 'monthly',
  }
}

function cancelEdit(uuid) {
  delete editing[uuid]
}

async function handleSave(uuid) {
  const state = editing[uuid]
  if (!state) return
  if (!state.limitGb || state.limitGb <= 0) {
    alert('请输入有效的流量上限 (GB)')
    return
  }
  saving[uuid] = true
  try {
    await saveTrafficConfig(uuid, {
      trafficLimitGb: state.limitGb,
      trafficPeriod: state.period,
    })
    await loadNodes()
  } catch (e) {
    alert('保存失败: ' + (e.message || e))
  } finally {
    saving[uuid] = false
  }
}

async function handleClear(uuid) {
  if (!confirm('确定清除该节点的流量配置？')) return
  saving[uuid] = true
  try {
    await clearTrafficConfig(uuid)
    delete editing[uuid]
    await loadNodes()
  } catch (e) {
    alert('清除失败: ' + (e.message || e))
  } finally {
    saving[uuid] = false
  }
}

onMounted(loadNodes)
</script>
