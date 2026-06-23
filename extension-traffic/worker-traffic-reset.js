/**
 * 流量周期重置 Worker
 *
 * 由 Crontab 定时触发（建议每小时运行一次）
 * 职责：
 *   1. 遍历所有 Agent UUID
 *   2. 读取每个节点的流量配置和周期数据
 *   3. 获取当前累计流量
 *   4. 判断当前周期是否过期 → 过期则重置
 *   5. 计算当前周期已用流量写入 KV
 *
 * 新增 KV 字段：
 *   metadata_traffic_period_start  — 当前周期开始时间戳（毫秒）
 *   metadata_traffic_period_base   — 周期开始时的累计流量值（字节）
 *   metadata_traffic_used          — 当前周期已用流量（字节），供前端直接读取
 */

const PERIOD_MS = {
  hourly: 3600_000,
  daily: 86400_000,
  weekly: 604800_000,
  monthly: 2592000_000, // 30 天
  never: Infinity,
};

export default {
  async onCron(params, env, ctx) {
    const token = env?.token;
    if (!token) return { ok: false, error: "env.token is required" };

    // 1. 列出所有 Agent UUID
    const uuidsRes = await nodeget("nodeget-server_list_all_agent_uuid", { token });
    const uuids = uuidsRes?.result?.uuids || [];
    if (!uuids.length) return { ok: true, processed: 0 };

    let processed = 0;
    let reset = 0;

    for (const uuid of uuids) {
      try {
        // 2. 读取流量配置
        const metaRes = await nodeget("kv_get_multi_value", {
          token,
          namespace_key: [
            { namespace: uuid, key: "metadata_traffic_limit" },
            { namespace: uuid, key: "metadata_traffic_period" },
            { namespace: uuid, key: "metadata_billing_mode" },
            { namespace: uuid, key: "metadata_traffic_period_start" },
            { namespace: uuid, key: "metadata_traffic_period_base" },
          ],
        });
        const rows = metaRes?.result || [];
        const kv = {};
        for (const row of rows) {
          if (row && row.value != null) kv[row.key] = row.value;
        }

        // payg 模式或无流量配置，跳过
        if (kv.metadata_billing_mode === "payg") continue;
        const period = String(kv.metadata_traffic_period || "");
        if (!PERIOD_MS[period]) continue;

        // 不限流量也跳过
        if (period === "never") continue;

        const limitGb = Number(kv.metadata_traffic_limit);
        if (!Number.isFinite(limitGb) || limitGb <= 0) continue;

        // 3. 获取当前累计流量
        const dynRes = await nodeget("agent_dynamic_summary_multi_last_query", {
          token,
          uuids: [uuid],
          fields: ["total_received", "total_transmitted"],
        });
        const dynRows = dynRes?.result || [];
        if (!dynRows.length) continue;

        const row = dynRows[0];
        const totalTraffic = (row.total_received || 0) + (row.total_transmitted || 0);
        const now = Date.now();

        // 4. 判断周期是否过期
        const periodStart = Number(kv.metadata_traffic_period_start) || 0;
        const periodBase = Number(kv.metadata_traffic_period_base) || 0;
        const periodDuration = PERIOD_MS[period];

        let newStart = periodStart;
        let newBase = periodBase;

        if (!periodStart || now - periodStart >= periodDuration) {
          // 周期过期或首次运行，记录新起点
          newStart = now;
          newBase = totalTraffic;
          reset++;

          // 写入新的周期起点和基准值
          await nodeget("kv_set_value", {
            token,
            namespace: uuid,
            key: "metadata_traffic_period_start",
            value: newStart,
          });
          await nodeget("kv_set_value", {
            token,
            namespace: uuid,
            key: "metadata_traffic_period_base",
            value: newBase,
          });
        }

        // 5. 计算当前周期已用流量并写入 KV
        const periodUsed = Math.max(0, totalTraffic - newBase);
        await nodeget("kv_set_value", {
          token,
          namespace: uuid,
          key: "metadata_traffic_used",
          value: periodUsed,
        });

        processed++;
      } catch (e) {
        nodegetLog?.warn?.(`traffic-reset error for ${uuid}: ${e?.message || e}`);
      }
    }

    return { ok: true, processed, reset };
  },

  async onCall(params, env, ctx) {
    // 手动调用时也执行同样的逻辑
    return this.onCron(params, env, ctx);
  },
};
