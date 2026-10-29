/**
 * 主循环与全局画布
 * - wx.createCanvas() 首次调用即上屏 canvas
 * - dpr 缩放：ctx.setTransform 后一律使用逻辑像素（与小程序 rpx 换算一致）
 * - 场景切换由 SceneManager 负责；每帧 update + draw（M0 全量重绘，M1 起做脏区域优化）
 */
const SceneManager = require('./scene/SceneManager')
const HomeScene = require('./scene/HomeScene')
const GameScene = require('./scene/GameScene')
const fx = require('./ui/fx')

let canvas, ctx, dpr, W, H
let sm = null
let last = 0

function boot() {
  canvas = wx.createCanvas()
  ctx = canvas.getContext('2d')
  const sys = wx.getSystemInfoSync()
  dpr = Math.min(sys.pixelRatio || 2, 3)
  W = sys.windowWidth
  H = sys.windowHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.textBaseline = 'middle'

  sm = new SceneManager(W, H)
  // 刘海/挖孔摄像头安全区：safeArea.top 已含状态栏；无该字段回退 statusBarHeight
  const sa = sys.safeArea
  sm.sat = sa ? sa.top : (sys.statusBarHeight || 44)          // 顶部安全区（px）
  sm.sab = sa ? Math.max(0, H - sa.bottom) : 0                // 底部安全区（Home Indicator）
  // 小程序胶囊按钮（右上角"…"⊙）：其下缘以下才是可布局区
  let cap = null
  try { cap = wx.getMenuButtonBoundingClientRect() } catch (e) {}
  if (!cap || !cap.height) cap = { top: sm.sat + 4, bottom: sm.sat + 40, left: W - 94, right: W - 7, width: 87, height: 32 }
  sm.cap = cap
  sm.capB = cap.bottom + 6                                     // 右上控件的安全起始 y
  sm.register('home', new HomeScene(sm))
  sm.register('game', new GameScene(sm))
  sm.switch('home')

  // 触摸事件 → 当前场景（小游戏坐标即逻辑像素，无需换算）
  wx.onTouchStart(route('onTouchStart'))
  wx.onTouchMove(route('onTouchMove'))
  wx.onTouchEnd(route('onTouchEnd'))

  last = Date.now()
  requestAnimationFrame(loop)
}

function route(fn) {
  return function (e) {
    if (!sm || !sm.current || !sm.current[fn]) return
    if (sm.trans) return // 转场期间屏蔽触摸
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (t) sm.current[fn](t.clientX, t.clientY)
  }
}

function loop() {
  // 关键：不要用 rAF 回调的时间戳参数——小游戏环境里它不是 epoch 毫秒
  // （而是启动后相对时间），与 Date.now() 相减会得到巨大的负 dt，
  // 导致 fx 补间永远无法推进（首页入场动画卡死，只渲染无门控的元素）。
  const now = Date.now()
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05))
  last = now
  const sc = sm && sm.current
  if (sc) {
    fx.update(dt)
    sm.update(dt)
    // update 可能置 dirty（滚动/动画/计时）；always 场景每帧重绘
    if (sc.update) sc.update(dt)
    if (sc.always || sc.dirty) {
      sc.draw(ctx)
      sc.dirty = false
    }
    // 转场黑场 / 粒子叠加层
    sm.drawOverlay(ctx)
    fx.draw(ctx)
  }
  requestAnimationFrame(loop)
}

module.exports = { boot: boot }
