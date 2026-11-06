/**
 * 本机事件日志（v1.4 纯单机版）
 *
 * - 用户已确认「暂不接后端，只做单机游戏」，因此本模块**不具备任何网络上报能力**：
 *   没有 transport、没有 endpoint、没有 wx.request，也没有配置入口。
 * - track(event, payload) 只把事件写进本机 wx.setStorageSync 环形缓冲（上限 50 条），
 *   供本机漏斗观察（如设置页 / 无头测试读取 summary）。数据永不出端。
 * - 隐私红线：payload 仅接受 number / boolean / 短 string，绝不采集 openid、昵称、位置等。
 * - 与既有 task.track（本机任务漏斗）并存：漏斗仍由 storage.incTaskTrack 记录，互不干扰。
 *
 * 历史：v1.3 曾有 configure({endpoint}) / setTransport / flush 三个「后端就绪后再接」的桩，
 * 但业务侧从未调用。v1.4 确认纯单机后整体移除，避免留下一行看似可开关的联网代码。
 */
const ANALYTICS_KEY = 'maze_analytics_v1'
const MAX_BUFFER = 50

// 业务事件白名单：新增事件先登记，防止拼写漂移。仅保留塔防与已迁入的外围系统事件。
const TRACK_EVENTS = [
  'ach_unlock', 'season_claim', 'checkin', 'intro_seen',
  'td_start', 'td_end', 'td_wave', 'td_bless'
]

let enabled = true

function loadBuffer() {
  try {
    const b = wx.getStorageSync(ANALYTICS_KEY)
    return Array.isArray(b) ? b : []
  } catch (e) { return [] }
}
function saveBuffer(b) {
  try { wx.setStorageSync(ANALYTICS_KEY, b) } catch (e) {}
}

// 只保留标量，限制键数与长度，防止把大对象 / 隐私字段写进本地存储
function sanitize(p) {
  const out = {}
  if (!p || typeof p !== 'object') return out
  let n = 0
  for (const k in p) {
    if (n >= 8) break
    const v = p[k]
    if (typeof v === 'number' && isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, 32)
    else continue
    n++
  }
  return out
}

function setEnabled(v) { enabled = !!v }
function isEnabled() { return enabled }

function track(event, payload) {
  if (!enabled) return { queued: 0, reason: 'disabled' }
  if (TRACK_EVENTS.indexOf(event) === -1) return { queued: 0, reason: 'unknown_event' }
  const buf = loadBuffer()
  buf.push({ e: event, t: Date.now(), p: sanitize(payload) })
  while (buf.length > MAX_BUFFER) buf.shift()
  saveBuffer(buf)
  return { queued: loadBuffer().length }
}

function summary() {
  const buf = loadBuffer()
  const byEvent = {}
  for (let i = 0; i < buf.length; i++) byEvent[buf[i].e] = (byEvent[buf[i].e] || 0) + 1
  return {
    buffered: buf.length,
    byEvent: byEvent,
    enabled: enabled
  }
}

function clear() { saveBuffer([]) }

// 测试 / 换环境用：清空本机缓冲并复位开关
function reset() {
  enabled = true
  saveBuffer([])
}

module.exports = {
  ANALYTICS_KEY: ANALYTICS_KEY, MAX_BUFFER: MAX_BUFFER, TRACK_EVENTS: TRACK_EVENTS,
  track: track, setEnabled: setEnabled, isEnabled: isEnabled,
  summary: summary, clear: clear, reset: reset, loadBuffer: loadBuffer
}
