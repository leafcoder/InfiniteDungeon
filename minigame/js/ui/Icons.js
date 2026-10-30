/**
 * 共享矢量图标库（UI 3.2）
 * 取代弹窗行卡里的 emoji fillText —— emoji 在小字号下渲染发虚、机型间不一致。
 * 用法：drawIcon(ctx, key, cx, cy, s, col)
 *   (cx,cy) 中心；s 半尺寸（实际图标约 2s 见方）；col 主色（hex）。
 * 全部用 path/arc 绘制，随 DPR 缩放天然清晰。
 */
const { roundRect } = require('./Button')

function drawIcon(ctx, key, cx, cy, s, col) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = col
  ctx.strokeStyle = col
  const lw = Math.max(1, s * 0.12)
  ctx.lineWidth = lw

  switch (key) {
    case 'daily': { // 日历
      roundRect(ctx, -s * 0.44, -s * 0.3, s * 0.88, s * 0.72, s * 0.14)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.44, -s * 0.06)
      ctx.lineTo(s * 0.44, -s * 0.06)
      ctx.moveTo(-s * 0.2, -s * 0.46)
      ctx.lineTo(-s * 0.2, -s * 0.2)
      ctx.moveTo(s * 0.2, -s * 0.46)
      ctx.lineTo(s * 0.2, -s * 0.2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, s * 0.14, s * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'weekly': { // 令旗
      ctx.beginPath()
      ctx.moveTo(-s * 0.3, -s * 0.44)
      ctx.lineTo(-s * 0.3, s * 0.44)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.3, -s * 0.42)
      ctx.lineTo(s * 0.4, -s * 0.26)
      ctx.lineTo(-s * 0.3, -s * 0.02)
      ctx.closePath()
      ctx.globalAlpha = 0.9
      ctx.fill()
      break
    }
    case 'rank': { // 奖杯
      ctx.beginPath()
      ctx.moveTo(-s * 0.3, -s * 0.42)
      ctx.lineTo(s * 0.3, -s * 0.42)
      ctx.quadraticCurveTo(s * 0.28, s * 0.06, 0, s * 0.1)
      ctx.quadraticCurveTo(-s * 0.28, s * 0.06, -s * 0.3, -s * 0.42)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-s * 0.38, -s * 0.22, s * 0.13, Math.PI * 0.5, Math.PI * 1.5)
      ctx.moveTo(s * 0.38 + s * 0.13, -s * 0.22)
      ctx.arc(s * 0.38, -s * 0.22, s * 0.13, -Math.PI * 0.5, Math.PI * 0.5)
      ctx.stroke()
      ctx.fillRect(-s * 0.06, s * 0.1, s * 0.12, s * 0.16)
      roundRect(ctx, -s * 0.26, s * 0.28, s * 0.52, s * 0.13, s * 0.05)
      ctx.fill()
      break
    }
    case 'supply': { // 补给包
      roundRect(ctx, -s * 0.38, -s * 0.16, s * 0.76, s * 0.6, s * 0.14)
      ctx.globalAlpha = 0.28
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -s * 0.16, s * 0.2, Math.PI, 0)
      ctx.stroke()
      ctx.lineWidth = lw * 1.1
      ctx.beginPath()
      ctx.moveTo(0, s * 0.02)
      ctx.lineTo(0, s * 0.26)
      ctx.moveTo(-s * 0.12, s * 0.14)
      ctx.lineTo(s * 0.12, s * 0.14)
      ctx.stroke()
      break
    }
    case 'survival': { // 骷髅
      ctx.beginPath()
      ctx.arc(0, -s * 0.08, s * 0.32, Math.PI * 0.95, Math.PI * 0.05)
      ctx.lineTo(s * 0.2, s * 0.2)
      ctx.lineTo(-s * 0.2, s * 0.2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(8,9,26,0.75)'
      ctx.beginPath()
      ctx.arc(-s * 0.13, -s * 0.08, s * 0.075, 0, Math.PI * 2)
      ctx.arc(s * 0.13, -s * 0.08, s * 0.075, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(-s * 0.025, s * 0.06, s * 0.05, s * 0.14)
      ctx.fillRect(-s * 0.115, s * 0.2, s * 0.23, s * 0.055)
      break
    }
    case 'star': { // 五角星
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 5
        const rr = i % 2 === 0 ? s * 0.46 : s * 0.2
        const px = Math.cos(ang) * rr
        const py = Math.sin(ang) * rr
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'bolt': { // 闪电
      ctx.beginPath()
      ctx.moveTo(s * 0.08, -s * 0.46)
      ctx.lineTo(s * 0.26, -s * 0.46)
      ctx.lineTo(s * 0.1, -s * 0.1)
      ctx.lineTo(s * 0.28, -s * 0.1)
      ctx.lineTo(-s * 0.1, s * 0.46)
      ctx.lineTo(-s * 0.02, s * 0.06)
      ctx.lineTo(-s * 0.24, s * 0.06)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'map': { // 地图路径
      roundRect(ctx, -s * 0.42, -s * 0.36, s * 0.84, s * 0.72, s * 0.12)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.22, s * 0.18)
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.14, s * 0.1, s * 0.02)
      ctx.quadraticCurveTo(s * 0.24, s * 0.12, s * 0.2, -s * 0.16)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(s * 0.2, -s * 0.16, s * 0.08, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-s * 0.22, s * 0.18, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'book': { // 手记：合页本 + 书脊 + 两行字
      roundRect(ctx, -s * 0.36, -s * 0.42, s * 0.72, s * 0.84, s * 0.08)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.2, -s * 0.42)
      ctx.lineTo(-s * 0.2, s * 0.42)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.04, -s * 0.16)
      ctx.lineTo(s * 0.24, -s * 0.16)
      ctx.moveTo(-s * 0.04, s * 0.06)
      ctx.lineTo(s * 0.24, s * 0.06)
      ctx.stroke()
      break
    }
    case 'key': { // 钥匙：圆环 + 柄 + 两齿
      ctx.beginPath()
      ctx.arc(-s * 0.18, 0, s * 0.16, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.02, 0)
      ctx.lineTo(s * 0.36, 0)
      ctx.moveTo(s * 0.22, 0)
      ctx.lineTo(s * 0.22, s * 0.14)
      ctx.moveTo(s * 0.36, 0)
      ctx.lineTo(s * 0.36, s * 0.16)
      ctx.stroke()
      break
    }
    case 'lock': { // 挂锁
      ctx.beginPath()
      ctx.arc(0, -s * 0.08, s * 0.19, Math.PI, 0)
      ctx.stroke()
      roundRect(ctx, -s * 0.27, -s * 0.08, s * 0.54, s * 0.42, s * 0.1)
      ctx.fill()
      ctx.fillStyle = 'rgba(8,9,26,0.65)'
      ctx.beginPath()
      ctx.arc(0, s * 0.1, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'check': { // 圆勾
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = lw * 1.2
      ctx.beginPath()
      ctx.moveTo(-s * 0.18, s * 0.02)
      ctx.lineTo(-s * 0.05, s * 0.16)
      ctx.lineTo(s * 0.2, -s * 0.14)
      ctx.stroke()
      break
    }
    case 'sword': { // 剑
      ctx.lineWidth = lw * 1.4
      ctx.beginPath()
      ctx.moveTo(s * 0.32, -s * 0.32)
      ctx.lineTo(-s * 0.08, s * 0.08)
      ctx.stroke()
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(s * 0.06, -s * 0.1)
      ctx.lineTo(-s * 0.16, s * 0.12)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.12, s * 0.12)
      ctx.lineTo(-s * 0.26, s * 0.26)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(-s * 0.31, s * 0.31, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'shield': { // 盾
      ctx.beginPath()
      ctx.moveTo(-s * 0.34, -s * 0.3)
      ctx.lineTo(s * 0.34, -s * 0.3)
      ctx.quadraticCurveTo(s * 0.34, s * 0.14, 0, s * 0.44)
      ctx.quadraticCurveTo(-s * 0.34, s * 0.14, -s * 0.34, -s * 0.3)
      ctx.closePath()
      ctx.globalAlpha = 0.3
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = lw
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.18)
      ctx.lineTo(0, s * 0.22)
      ctx.stroke()
      break
    }
    case 'crown': { // 王冠
      ctx.beginPath()
      ctx.moveTo(-s * 0.38, s * 0.2)
      ctx.lineTo(-s * 0.38, -s * 0.22)
      ctx.lineTo(-s * 0.15, -s * 0.02)
      ctx.lineTo(0, -s * 0.36)
      ctx.lineTo(s * 0.15, -s * 0.02)
      ctx.lineTo(s * 0.38, -s * 0.22)
      ctx.lineTo(s * 0.38, s * 0.2)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'plus': { // 加号
      ctx.lineWidth = lw * 1.4
      ctx.beginPath()
      ctx.moveTo(-s * 0.24, 0)
      ctx.lineTo(s * 0.24, 0)
      ctx.moveTo(0, -s * 0.24)
      ctx.lineTo(0, s * 0.24)
      ctx.stroke()
      break
    }
    case 'eye': { // 透视眼
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, 0)
      ctx.quadraticCurveTo(0, -s * 0.46, s * 0.42, 0)
      ctx.quadraticCurveTo(0, s * 0.46, -s * 0.42, 0)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'snow': { // 冰冻雪花
      for (let i = 0; i < 3; i++) {
        const ang = i * Math.PI / 3
        const dx = Math.cos(ang) * s * 0.42
        const dy = Math.sin(ang) * s * 0.42
        ctx.beginPath()
        ctx.moveTo(-dx, -dy)
        ctx.lineTo(dx, dy)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'cloak': { // 隐身衣（兜帽）
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.44)
      ctx.quadraticCurveTo(s * 0.36, -s * 0.26, s * 0.3, s * 0.36)
      ctx.lineTo(-s * 0.3, s * 0.36)
      ctx.quadraticCurveTo(-s * 0.36, -s * 0.26, 0, -s * 0.44)
      ctx.closePath()
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(8,9,26,0.7)'
      ctx.beginPath()
      ctx.ellipse(0, s * 0.02, s * 0.13, s * 0.17, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'shoe': { // 加速鞋
      ctx.beginPath()
      ctx.moveTo(-s * 0.3, s * 0.14)
      ctx.lineTo(-s * 0.3, -s * 0.16)
      ctx.lineTo(s * 0.02, -s * 0.16)
      ctx.lineTo(s * 0.12, s * 0.0)
      ctx.lineTo(s * 0.38, s * 0.06)
      ctx.lineTo(s * 0.38, s * 0.14)
      ctx.closePath()
      ctx.fill()
      roundRect(ctx, -s * 0.34, s * 0.16, s * 0.76, s * 0.13, s * 0.06)
      ctx.fill()
      ctx.lineWidth = lw * 0.9
      ctx.beginPath()
      ctx.moveTo(-s * 0.5, -s * 0.12)
      ctx.lineTo(-s * 0.4, -s * 0.12)
      ctx.moveTo(-s * 0.5, s * 0.0)
      ctx.lineTo(-s * 0.42, s * 0.0)
      ctx.stroke()
      break
    }
    case 'bag': { // 背包
      roundRect(ctx, -s * 0.3, -s * 0.26, s * 0.6, s * 0.62, s * 0.16)
      ctx.globalAlpha = 0.32
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -s * 0.26, s * 0.13, Math.PI, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.3, s * 0.08)
      ctx.lineTo(s * 0.3, s * 0.08)
      ctx.stroke()
      break
    }
    case 'monster': { // 小怪脸
      ctx.beginPath()
      ctx.moveTo(-s * 0.22, -s * 0.24)
      ctx.lineTo(-s * 0.3, -s * 0.44)
      ctx.lineTo(-s * 0.08, -s * 0.28)
      ctx.closePath()
      ctx.moveTo(s * 0.22, -s * 0.24)
      ctx.lineTo(s * 0.3, -s * 0.44)
      ctx.lineTo(s * 0.08, -s * 0.28)
      ctx.closePath()
      ctx.fill()
      roundRect(ctx, -s * 0.32, -s * 0.26, s * 0.64, s * 0.6, s * 0.18)
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(8,9,26,0.75)'
      ctx.beginPath()
      ctx.arc(-s * 0.12, -s * 0.04, s * 0.06, 0, Math.PI * 2)
      ctx.arc(s * 0.12, -s * 0.04, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(-s * 0.1, s * 0.14, s * 0.2, s * 0.05)
      break
    }
    case 'castle': { // 城堡
      ctx.fillRect(-s * 0.4, -s * 0.14, s * 0.22, s * 0.56)
      ctx.fillRect(s * 0.18, -s * 0.14, s * 0.22, s * 0.56)
      ctx.fillRect(-s * 0.18, s * 0.06, s * 0.36, s * 0.36)
      ctx.fillRect(-s * 0.4, -s * 0.28, s * 0.09, s * 0.14)
      ctx.fillRect(-s * 0.25, -s * 0.28, s * 0.09, s * 0.14)
      ctx.fillRect(s * 0.18, -s * 0.28, s * 0.09, s * 0.14)
      ctx.fillRect(s * 0.31, -s * 0.28, s * 0.09, s * 0.14)
      ctx.fillStyle = 'rgba(8,9,26,0.6)'
      roundRect(ctx, -s * 0.09, s * 0.16, s * 0.18, s * 0.26, s * 0.08)
      ctx.fill()
      break
    }
    case 'tower': { // 无尽塔：叠层塔身 + 塔尖旗
      ctx.fillRect(-s * 0.30, -s * 0.06, s * 0.60, s * 0.52)   // 塔基
      ctx.fillRect(-s * 0.20, -s * 0.38, s * 0.40, s * 0.30)   // 塔身
      ctx.fillRect(-s * 0.10, -s * 0.58, s * 0.20, s * 0.18)   // 塔顶
      ctx.fillRect(-s * 0.02, -s * 0.80, s * 0.04, s * 0.22)   // 旗杆
      ctx.beginPath()                                          // 旗面
      ctx.moveTo(s * 0.02, -s * 0.80)
      ctx.lineTo(s * 0.30, -s * 0.72)
      ctx.lineTo(s * 0.02, -s * 0.62)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(8,9,26,0.6)'                       // 门与窗
      roundRect(ctx, -s * 0.08, s * 0.20, s * 0.16, s * 0.26, s * 0.07)
      ctx.fill()
      ctx.fillRect(-s * 0.06, -s * 0.28, s * 0.12, s * 0.12)
      break
    }
    case 'leaf': { // 灵叶
      ctx.beginPath()
      ctx.moveTo(0, s * 0.42)
      ctx.quadraticCurveTo(-s * 0.4, s * 0.08, 0, -s * 0.42)
      ctx.quadraticCurveTo(s * 0.4, s * 0.08, 0, s * 0.42)
      ctx.closePath()
      ctx.globalAlpha = 0.85
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(8,9,26,0.5)'
      ctx.lineWidth = lw * 0.8
      ctx.beginPath()
      ctx.moveTo(0, s * 0.34)
      ctx.lineTo(0, -s * 0.3)
      ctx.stroke()
      break
    }
    case 'lantern': { // 灯笼
      roundRect(ctx, -s * 0.3, -s * 0.24, s * 0.6, s * 0.46, s * 0.2)
      ctx.globalAlpha = 0.88
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillRect(-s * 0.13, -s * 0.34, s * 0.26, s * 0.09)
      ctx.fillRect(-s * 0.13, s * 0.23, s * 0.26, s * 0.08)
      ctx.strokeStyle = 'rgba(8,9,26,0.4)'
      ctx.lineWidth = lw * 0.7
      ctx.beginPath()
      ctx.moveTo(-s * 0.1, -s * 0.22)
      ctx.lineTo(-s * 0.1, s * 0.2)
      ctx.moveTo(s * 0.1, -s * 0.22)
      ctx.lineTo(s * 0.1, s * 0.2)
      ctx.stroke()
      break
    }
    case 'spark': { // 四芒星
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.46)
      ctx.quadraticCurveTo(s * 0.07, -s * 0.07, s * 0.46, 0)
      ctx.quadraticCurveTo(s * 0.07, s * 0.07, 0, s * 0.46)
      ctx.quadraticCurveTo(-s * 0.07, s * 0.07, -s * 0.46, 0)
      ctx.quadraticCurveTo(-s * 0.07, -s * 0.07, 0, -s * 0.46)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(s * 0.26, -s * 0.3, s * 0.05, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'wave': { // 海浪（深渊皮肤）
      ctx.lineWidth = lw * 1.4
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, -s * 0.08)
      ctx.quadraticCurveTo(-s * 0.21, -s * 0.34, 0, -s * 0.08)
      ctx.quadraticCurveTo(s * 0.21, s * 0.18, s * 0.42, -s * 0.08)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.42, s * 0.2)
      ctx.quadraticCurveTo(-s * 0.21, -s * 0.06, 0, s * 0.2)
      ctx.quadraticCurveTo(s * 0.21, s * 0.46, s * 0.42, s * 0.2)
      ctx.stroke()
      break
    }
    case 'flower': { // 樱花（樱粉皮肤）
      ctx.globalAlpha = 0.92
      for (let p = 0; p < 5; p++) {
        const ang = -Math.PI / 2 + p * Math.PI * 2 / 5
        const px = Math.cos(ang) * s * 0.22
        const py = Math.sin(ang) * s * 0.22
        ctx.beginPath()
        ctx.ellipse(px, py, s * 0.18, s * 0.12, ang, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

// hex → rgba（避免 color-mix 兼容性问题）
function hexA(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 255
  const g = parseInt(h.slice(2, 4), 16) || 255
  const b = parseInt(h.slice(4, 6), 16) || 255
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'
}

/* ---------- 英雄小人 chip（弹窗行卡用） ----------
 * 与 render/board.js 的 drawWalker 同源 chibi 造型（正面静止姿态），
 * 由英雄调色板 P 驱动：{skin,hair,tunic,tunic2,pants,boot,eye}。
 * (cx,cy) 中心；s 半尺寸（整高约 2s），画在 34u 图标瓦片内。 */
function drawHeroChip(ctx, P, cx, cy, s) {
  const cs = s * 2 // 与 drawWalker 的 cell 比例对齐
  ctx.save()
  ctx.translate(cx, cy)
  // 脚下影子
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  ctx.save()
  ctx.scale(1, 0.4)
  ctx.beginPath()
  ctx.arc(0, cs * 0.30 / 0.4, cs * 0.19, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 腿 + 鞋
  ctx.lineCap = 'round'
  ctx.lineWidth = cs * 0.085
  ctx.strokeStyle = P.pants
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath()
    ctx.moveTo(side * cs * 0.06, cs * 0.10)
    ctx.lineTo(side * cs * 0.075, cs * 0.27)
    ctx.stroke()
    ctx.fillStyle = P.boot
    ctx.beginPath()
    ctx.arc(side * cs * 0.075, cs * 0.27, cs * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  // 躯干（带皮肤主色光晕）
  ctx.save()
  ctx.shadowColor = hexA(P.tunic, 0.55)
  ctx.shadowBlur = 7
  ctx.fillStyle = P.tunic
  roundRect(ctx, -cs * 0.13, -cs * 0.085, cs * 0.26, cs * 0.20, cs * 0.075)
  ctx.fill()
  ctx.restore()
  // 腰带
  ctx.fillStyle = P.tunic2
  ctx.fillRect(-cs * 0.115, cs * 0.055, cs * 0.23, cs * 0.032)
  // 头 + 头发 + 眼睛
  const hcy = -cs * 0.215
  const hr = cs * 0.125
  ctx.fillStyle = P.skin
  ctx.beginPath()
  ctx.arc(0, hcy, hr, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = P.hair
  ctx.beginPath()
  ctx.arc(0, hcy - hr * 0.08, hr, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(-hr, hcy - hr * 0.14, hr * 2, hr * 0.22)
  ctx.fillStyle = P.eye
  ctx.beginPath()
  ctx.arc(-hr * 0.36, hcy + hr * 0.18, hr * 0.14, 0, Math.PI * 2)
  ctx.arc(hr * 0.36, hcy + hr * 0.18, hr * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

module.exports = { drawIcon: drawIcon, hexA: hexA, drawHeroChip: drawHeroChip }
