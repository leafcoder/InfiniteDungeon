/**
 * 游戏圈入口（原生控件）
 * - wx.createGameClubButton 是打开游戏圈的唯一官方入口（无 openGameCircle 类 API）
 * - 环境不支持 / 创建失败 / 布局空间不足时静默跳过，调用方零负担
 * - 生命周期：HomeScene.enter 创建 → exit 销毁；update 里同步显隐（弹窗/广告/转场时隐藏，
 *   原生按钮永远浮在 Canvas 之上，不主动隐藏会盖住弹窗与黑场转场）
 */
let btn = null

function isAvail() {
  return typeof wx !== 'undefined' && typeof wx.createGameClubButton === 'function'
}

/**
 * 计算按钮位置：与首页顶栏图标行同线（排在最左枚图标的左侧）
 * @param u      首页布局单位（W/375）
 * @param pill   光尘胶囊 rect（左侧）
 * @param iconsLeft 顶栏图标行最左枚的 x
 * @returns rect | null（与胶囊重叠即空间不足，返回 null 跳过）
 */
function rectFor(u, pill, iconsLeft) {
  const d = Math.max(26, Math.round(28 * u))
  const gap = Math.round(7 * u)
  const left = iconsLeft - gap - d
  if (left < pill.x + pill.w + 6 * u) return null
  const top = Math.round(pill.y + pill.h / 2 - d / 2)
  return { left: left, top: top, width: d, height: d }
}

// 创建并显示；重复调用先销毁旧按钮。成功返回 true
function show(rect) {
  if (!isAvail()) return false
  destroy()
  try {
    btn = wx.createGameClubButton({
      type: 'image',
      icon: 'light', // 白色圆角底 + 绿色图标，深色首页底上最清晰
      style: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    })
  } catch (e) { btn = null }
  return !!btn
}

function hide() { if (btn) { try { btn.hide() } catch (e) {} } }
function reveal() { if (btn) { try { btn.show() } catch (e) {} } }
function destroy() { if (btn) { try { btn.destroy() } catch (e) {} btn = null } }
function exists() { return !!btn }

module.exports = { isAvail, rectFor, show, hide, reveal, destroy, exists }
