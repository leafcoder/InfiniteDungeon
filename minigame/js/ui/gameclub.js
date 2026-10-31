/**
 * 游戏圈入口（原生控件）
 * - wx.createGameClubButton 是打开游戏圈的唯一官方入口（无 openGameCircle 类 API）
 * - 样式：文字胶囊「游戏圈」——纯图标用户无法辨认（真机反馈），高度与顶栏图标行一致
 * - 环境不支持 / 创建失败 / 布局空间不足时静默跳过，调用方零负担
 * - 生命周期：HomeScene.enter 创建 → exit 销毁；update 里同步显隐（弹窗/广告/转场时隐藏，
 *   原生按钮永远浮在 Canvas 之上，不主动隐藏会盖住弹窗与黑场转场）
 */
let btn = null

function isAvail() {
  return typeof wx !== 'undefined' && typeof wx.createGameClubButton === 'function'
}

/**
 * 计算胶囊位置：与首页顶栏图标行同线（排在最左枚图标左侧）
 * 宽度自适应：光尘胶囊与图标行之间放得下多宽就多宽（64u 封顶），<44u 视为空间不足
 * @param u      首页布局单位（W/375）
 * @param pill   光尘胶囊 rect（左侧）
 * @param iconsLeft 顶栏图标行最左枚的 x
 * @returns {left,top,width,height,fontSize} | null（空间不足）
 */
function rectFor(u, pill, iconsLeft) {
  const h = Math.max(24, Math.round(28 * u))
  const gap = Math.round(7 * u)
  const maxW = Math.round(64 * u)
  const minW = Math.round(44 * u)
  const pillEnd = Math.round(pill.x + pill.w + 6 * u)
  const w = Math.min(maxW, iconsLeft - gap - pillEnd)
  if (w < minW) return null
  return {
    left: iconsLeft - gap - w,
    top: Math.round(pill.y + pill.h / 2 - h / 2),
    width: w,
    height: h,
    fontSize: Math.round(10 * u)
  }
}

// 创建并显示；重复调用先销毁旧按钮。成功返回 true
// 配色取深色实底（四套皮肤首页均为暗色调，白字胶囊均可读；原生控件不吃 canvas 半透明玻璃层）
function show(rect) {
  if (!isAvail()) return false
  destroy()
  try {
    btn = wx.createGameClubButton({
      type: 'text',
      text: '游戏圈',
      style: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        backgroundColor: '#2A2745',
        borderColor: '#544E7E',
        borderWidth: 1,
        borderRadius: Math.round(rect.height / 2),
        color: '#FFFFFF',
        textAlign: 'center',
        fontSize: rect.fontSize,
        lineHeight: rect.height
      }
    })
  } catch (e) { btn = null }
  return !!btn
}

function hide() { if (btn) { try { btn.hide() } catch (e) {} } }
function reveal() { if (btn) { try { btn.show() } catch (e) {} } }
function destroy() { if (btn) { try { btn.destroy() } catch (e) {} btn = null } }
function exists() { return !!btn }

module.exports = { isAvail, rectFor, show, hide, reveal, destroy, exists }
