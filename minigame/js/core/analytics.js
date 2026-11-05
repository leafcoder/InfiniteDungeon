/**
 * 埋点上报抽象层（v1.11 批次20）
 * - 业务侧统一调用 track(event, payload)，与具体后端完全解耦
 * - 默认无 transport：事件写入本地环形缓冲（上限 50），零网络请求、零副作用
 * - 后端就绪后只需 setTransport(fn) 或 configure({endpoint})，业务侧无需改动
 * - 后端不可用（transport 返回 false / 抛错）→ 事件保留在缓冲，下次自动重试
 * - 隐私红线：payload 仅接受 number / boolean / 短 string，绝不采集 openid、昵称、位置等
 * - 与既有 task.track（本机任务漏斗）并存：漏斗仍由 storage.incTaskTrack 记录，互不干扰
 */
const ANALYTICS_KEY = 'maze_analytics_v1'
const MAX_BUFFER = 50

// 业务事件白名单：新增事件先登记，防止拼写漂移
const TRACK_EVENTS = [
  'level_win', 'level_fail', 'daily_win', 'weekly_win', 'festival_win',
  'endless_depth', 'ach_unlock', 'season_claim', 'checkin',
  'mutation_win', 'ngplus_enter', 'intro_seen'
]

let transport = null
let endpoint = ''
let lastError = ''
let sentTotal = 0
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

function setTransport(fn) {
  transport = (typeof fn === 'function') ? fn : null
  return transport
}
function setEnabled(v) { enabled = !!v }
function isEnabled() { return enabled }

// 接入后端：显式 transport，或给 endpoint 走内置 wx.request（fire-and-forget）
function configure(opts) {
  opts = opts || {}
  endpoint = opts.endpoint || ''
  if (typeof opts.transport === 'function') {
    transport = opts.transport
  } else if (endpoint && typeof wx !== 'undefined' && typeof wx.request === 'function') {
    transport = function (records) {
      try {
        wx.request({ url: endpoint, method: 'POST', data: { events: records }, fail: function () {} })
        return true
      } catch (e) { return false }
    }
  }
  return summary()
}

// 尝试把缓冲投递给后端；成功则清空缓冲，失败则保留待下次重试
function flush() {
  if (!transport || !enabled) return false
  const buf = loadBuffer()
  if (buf.length === 0) return true
  lastError = ''
  let ok = false
  try { ok = transport(buf) !== false }
  catch (e) { lastError = String((e && e.message) || e); ok = false }
  if (ok) {
    saveBuffer([])
    sentTotal += buf.length
    return true
  }
  if (!lastError) lastError = 'transport returned false'
  return false
}

function track(event, payload) {
  if (!enabled) return { queued: 0, reason: 'disabled' }
  if (TRACK_EVENTS.indexOf(event) === -1) return { queued: 0, reason: 'unknown_event' }
  const buf = loadBuffer()
  buf.push({ e: event, t: Date.now(), p: sanitize(payload) })
  while (buf.length > MAX_BUFFER) buf.shift()
  saveBuffer(buf)
  if (transport) flush()
  return { queued: loadBuffer().length }
}

function summary() {
  const buf = loadBuffer()
  const byEvent = {}
  for (let i = 0; i < buf.length; i++) byEvent[buf[i].e] = (byEvent[buf[i].e] || 0) + 1
  return {
    buffered: buf.length,
    sent: sentTotal,
    byEvent: byEvent,
    hasTransport: !!transport,
    endpoint: endpoint,
    lastError: lastError,
    enabled: enabled
  }
}

function clear() {
  saveBuffer([])
  sentTotal = 0
  lastError = ''
}

// 测试 / 换环境用：清空内存态 transport 与配置并清缓冲
function reset() {
  transport = null
  endpoint = ''
  lastError = ''
  sentTotal = 0
  enabled = true
  saveBuffer([])
}

module.exports = {
  ANALYTICS_KEY: ANALYTICS_KEY, MAX_BUFFER: MAX_BUFFER, TRACK_EVENTS: TRACK_EVENTS,
  track: track, flush: flush, configure: configure, setTransport: setTransport,
  setEnabled: setEnabled, isEnabled: isEnabled,
  summary: summary, clear: clear, reset: reset, loadBuffer: loadBuffer
}
