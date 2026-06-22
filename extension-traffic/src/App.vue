<template>
  <div class="min-h-screen bg-white dark:bg-gray-950 p-4 sm:p-6 transition-colors">
    <div class="max-w-5xl mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="min-h-screen flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div class="text-center">
          <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p>加载节点中...</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="min-h-screen flex items-center justify-center">
        <div class="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-6 rounded-lg max-w-md border border-red-200 dark:border-red-800">
          <p class="font-semibold mb-2">加载失败</p>
          <p class="text-sm">{{ error }}</p>
          <button @click="loadNodes" class="mt-3 text-sm text-red-600 dark:text-red-400 underline">重试</button>
        </div>
      </div>

      <!-- Content -->
      <template v-else>
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">流量监控配置</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            为每个节点配置流量上限或按量计费，状态展示页面将显示对应信息
          </p>
        </div>

        <div v-if="nodes.length === 0" class="text-center py-12 text-gray-400 dark:text-gray-500">暂无节点</div>

        <!-- Table -->
        <div v-else class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th class="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">名称</th>
                  <th class="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">地区</th>
                  <th class="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">计费方式</th>
                  <th class="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">已使用</th>
                  <th class="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">配置详情</th>
                  <th class="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="node in nodes"
                  :key="node.uuid"
                  class="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  @click="openModal(node)"
                >
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900 dark:text-gray-100">{{ node.name }}</span>
                      <span
                        v-if="node.billingMode === 'payg'"
                        class="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded"
                      >
                        按量计费
                      </span>
                      <span
                        v-else-if="node.trafficLimitGb"
                        class="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded"
                      >
                        流量额度
                      </span>
                      <span
                        v-else
                        class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded"
                      >
                        无限流量
                      </span>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 sm:hidden">{{ node.region }}</p>
                  </td>
                  <td class="px-4 py-3 hidden sm:table-cell">
                    <span v-if="node.region" class="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                      {{ node.region }}
                    </span>
                  </td>
                  <td class="px-4 py-3 hidden md:table-cell">
                    <span v-if="node.billingMode === 'payg'" class="text-xs text-amber-600 dark:text-amber-400">
                      {{ node.trafficPrice ? `¥${node.trafficPrice}/GB` : '未设单价' }}
                    </span>
                    <span v-else-if="node.trafficLimitGb" class="text-xs text-gray-600 dark:text-gray-400">
                      {{ node.trafficLimitGb }} GB / {{ periodLabel(node.trafficPeriod) }}
                    </span>
                    <span v-else class="text-xs text-gray-400 dark:text-gray-500">∞</span>
                  </td>
                  <td class="px-4 py-3 font-mono text-gray-700 dark:text-gray-300 hidden md:table-cell">
                    {{ formatBytes(node.totalReceived + node.totalTransmitted) }}
                  </td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell text-xs">
                    <template v-if="node.billingMode === 'payg'">
                      <span v-if="node.trafficInclude">含 {{ node.trafficInclude }} GB 免费</span>
                      <span v-else>无免费额度</span>
                    </template>
                    <template v-else-if="node.trafficLimitGb">
                      {{ periodLabel(node.trafficPeriod) }}
                    </template>
                    <template v-else>不限流量</template>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button
                      class="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      @click.stop="openModal(node)"
                    >
                      配置
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="duration-200 ease-out"
        leave-active-class="duration-150 ease-in"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="modalNode"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <!-- Backdrop - no click to close -->
          <div class="absolute inset-0 bg-black/50 dark:bg-black/70" />

          <!-- Dialog -->
          <Transition
            enter-active-class="duration-200 ease-out"
            leave-active-class="duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            enter-to-class="scale-100 opacity-100"
            leave-from-class="scale-100 opacity-100"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="modalNode"
              class="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md transition-colors"
            >
              <!-- Header -->
              <div class="px-6 pt-6 pb-2">
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ modalNode.name }}</h2>
                  <span v-if="modalNode.region" class="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                    {{ modalNode.region }}
                  </span>
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1">{{ modalNode.uuid }}</p>
                <div class="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>已使用: <b class="font-mono text-gray-700 dark:text-gray-300">{{ formatBytes(modalNode.totalReceived + modalNode.totalTransmitted) }}</b></span>
                </div>
              </div>

              <!-- Body -->
              <div class="px-6 py-4 space-y-4">
                <!-- Billing mode toggle -->
                <div>
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-2">计费方式</label>
                  <div class="flex gap-2">
                    <button
                      @click="modalBillingMode = 'quota'"
                      :class="[
                        'flex-1 px-3 py-2 text-sm rounded-md border transition-colors text-center',
                        modalBillingMode === 'quota'
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      ]"
                    >
                      <div class="font-medium">流量额度</div>
                      <div class="text-[10px] mt-0.5 opacity-70">设置流量上限和重置周期</div>
                    </button>
                    <button
                      @click="modalBillingMode = 'payg'"
                      :class="[
                        'flex-1 px-3 py-2 text-sm rounded-md border transition-colors text-center',
                        modalBillingMode === 'payg'
                          ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      ]"
                    >
                      <div class="font-medium">按量计费</div>
                      <div class="text-[10px] mt-0.5 opacity-70">设置单价和免费额度</div>
                    </button>
                  </div>
                </div>

                <!-- Quota mode fields -->
                <template v-if="modalBillingMode === 'quota'">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">流量上限 (GB)</label>
                      <input
                        type="number"
                        v-model.number="modalLimitGb"
                        placeholder="例如: 1000"
                        min="1"
                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">流量重置</label>
                      <select
                        v-model="modalPeriod"
                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="hourly">每小时</option>
                        <option value="daily">每天</option>
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                        <option value="never">不限流量</option>
                      </select>
                    </div>
                  </div>

                  <p v-if="modalPeriod === 'never'" class="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
                    选择「不限流量」时，流量上限仅用于展示已用量，不会限制节点访问。
                  </p>
                </template>

                <!-- Payg mode fields -->
                <template v-if="modalBillingMode === 'payg'">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">单价 (元/GB)</label>
                      <input
                        type="number"
                        v-model.number="modalPrice"
                        placeholder="例如: 0.5"
                        min="0"
                        step="0.01"
                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">免费额度 (GB)</label>
                      <input
                        type="number"
                        v-model.number="modalInclude"
                        placeholder="例如: 100"
                        min="0"
                        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                  </div>

                  <p class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
                    按量计费模式下，已使用的总流量乘以单价计算费用。设置免费额度后，超出部分才开始计费。
                  </p>
                </template>

                <!-- Validation error -->
                <p v-if="modalError" class="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                  {{ modalError }}
                </p>
              </div>

              <!-- Footer -->
              <div class="px-6 pb-6 pt-2 flex items-center justify-between gap-2">
                <button
                  v-if="hasExistingConfig"
                  @click="handleClear"
                  :disabled="modalSaving"
                  class="px-4 py-2 text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                >
                  {{ modalSaving ? '清除中...' : '清除配置' }}
                </button>
                <div v-else />
                <div class="flex gap-2">
                  <button
                    @click="closeModal"
                    class="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    @click="handleSave"
                    :disabled="modalSaving"
                    class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {{ modalSaving ? '保存中...' : '保存' }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchAllNodes, saveTrafficConfig, clearTrafficConfig } from './lib/api'

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

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return val.toFixed(i > 1 ? 2 : 0) + ' ' + units[i]
}

const nodes = ref([])
const loading = ref(true)
const error = ref(null)

// Modal state
const modalNode = ref(null)
const modalBillingMode = ref('quota')
const modalLimitGb = ref(null)
const modalPeriod = ref('monthly')
const modalPrice = ref(null)
const modalInclude = ref(null)
const modalSaving = ref(false)
const modalError = ref('')

const hasExistingConfig = computed(() => {
  const n = modalNode.value
  if (!n) return false
  // 有任何配置就算有：payg 模式，或有 trafficLimitGb，或 billingMode 被显式设置过
  return n.billingMode === 'payg' || !!n.trafficLimitGb
})

async function loadNodes() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchAllNodes()
    nodes.value = data
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}

function openModal(node) {
  modalNode.value = node
  modalBillingMode.value = node.billingMode || 'quota'
  modalLimitGb.value = node.trafficLimitGb || null
  modalPeriod.value = node.trafficPeriod || 'monthly'
  modalPrice.value = node.trafficPrice || null
  modalInclude.value = node.trafficInclude || null
  modalError.value = ''
}

function closeModal() {
  modalNode.value = null
  modalSaving.value = false
  modalError.value = ''
}

function validate() {
  if (modalBillingMode.value === 'payg') {
    if (!modalPrice.value || modalPrice.value <= 0) {
      modalError.value = '请输入有效的单价 (元/GB)'
      return false
    }
  } else {
    if (modalPeriod.value !== 'never') {
      if (!modalLimitGb.value || modalLimitGb.value <= 0) {
        modalError.value = '请输入有效的流量上限 (GB)'
        return false
      }
    }
  }
  return true
}

async function handleSave() {
  modalError.value = ''
  const node = modalNode.value
  if (!node) return
  if (!validate()) return

  const limitGb = modalBillingMode.value === 'payg'
    ? null
    : modalPeriod.value === 'never' ? (modalLimitGb.value || 1) : modalLimitGb.value

  modalSaving.value = true
  try {
    await saveTrafficConfig(node.uuid, {
      billingMode: modalBillingMode.value,
      trafficLimitGb: limitGb,
      trafficPeriod: modalBillingMode.value === 'payg' ? 'never' : modalPeriod.value,
      trafficPrice: modalBillingMode.value === 'payg' ? modalPrice.value : null,
      trafficInclude: modalBillingMode.value === 'payg' ? (modalInclude.value || null) : null,
    })
    await loadNodes()
    const updated = nodes.value.find(n => n.uuid === node.uuid)
    if (updated) {
      modalNode.value = updated
    } else {
      closeModal()
    }
    modalError.value = ''
  } catch (e) {
    modalError.value = '保存失败: ' + (e.message || e)
  } finally {
    modalSaving.value = false
  }
}

async function handleClear() {
  modalError.value = ''
  const node = modalNode.value
  if (!node) return

  modalSaving.value = true
  try {
    await clearTrafficConfig(node.uuid)
    await loadNodes()
    // 刷新 modalNode 为清除后的新对象
    const updated = nodes.value.find(n => n.uuid === node.uuid)
    if (updated) {
      modalNode.value = updated
      modalBillingMode.value = updated.billingMode || 'quota'
      modalLimitGb.value = updated.trafficLimitGb || null
      modalPeriod.value = updated.trafficPeriod || 'monthly'
      modalPrice.value = updated.trafficPrice || null
      modalInclude.value = updated.trafficInclude || null
    } else {
      closeModal()
    }
    modalError.value = ''
  } catch (e) {
    modalError.value = '清除失败: ' + (e.message || e)
  } finally {
    modalSaving.value = false
  }
}

onMounted(loadNodes)
</script>
