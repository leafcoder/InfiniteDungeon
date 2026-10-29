/**
 * 棋盘渲染（M2）—— 1:1 还原小程序版视觉基调
 * 输入：ctx、PlayCore 实例、视图参数 { bx, by, bw, bh, v(皮肤变量), now }
 * 自适应：cell 尺寸取 min(bw/W, bh/H)，迷宫居中
 */
const FX_GLYPH = { cloak: '隐', freeze: '冰', dash: '速', shield: '盾', magnet: '磁', flare: '灯', decoy: '饵', hourglass: '沙', scroll: '卷' }
const FX_COLOR = {
  cloak: '#9B8CFF', freeze: '#5BC8FF', dash: '#FF9F6E', shield: '#6FE3D2',
  magnet: '#5EE6D8', flare: '#FF6B6B', decoy: '#FF9EC4', hourglass: '#FFD86E', scroll: '#FFC15E'
}

function computeLayout(core, view) {
  const m = core.maze
  // 恒定可读 cell 尺寸下限：迷宫过大时不再无限缩小，超出部分由镜头滚动呈现
  const minCs = view.cellMin || 40
  const fitCs = Math.min(view.bw / m.W, view.bh / m.H)
  const cs = Math.max(fitCs, minCs)
  const mw = cs * m.W
  const mh = cs * m.H
  let ox, oy
  if (mw <= view.bw + 0.5 && mh <= view.bh + 0.5) {
    // 整张能放下：居中，镜头归零
    ox = view.bx + (view.bw - mw) / 2
    oy = view.by + (view.bh - mh) / 2
  } else {
    // 超出可视区：用镜头偏移（camX/camY 为迷宫世界左上像素偏移）
    ox = view.bx - (view.camX || 0)
    oy = view.by - (view.camY || 0)
  }
  return {
    cs: cs,
    ox: ox,
    oy: oy,
    mw: mw,
    mh: mh
  }
}

function drawBoard(ctx, core, view) {
  const v = view.v
  const m = core.maze
  const L = computeLayout(core, view)
  const cs = L.cs
  const now = view.now || 0
  // 视口裁剪范围（镜头滚动时只绘制屏幕内格子，提升大迷宫性能）
  const c0x = Math.max(0, Math.floor((view.bx - L.ox) / cs) - 1)
  const c1x = Math.min(m.W - 1, Math.ceil((view.bx + view.bw - L.ox) / cs) + 1)
  const c0y = Math.max(0, Math.floor((view.by - L.oy) / cs) - 1)
  const c1y = Math.min(m.H - 1, Math.ceil((view.by + view.bh - L.oy) / cs) + 1)
  const pulse = 0.5 + 0.5 * Math.sin(now / 300)
  ctx.save()

  // 棋盘底（暗角渐变，中心微亮聚焦）
  const bgG = ctx.createRadialGradient(view.bx + view.bw / 2, view.by + view.bh / 2, 0, view.bx + view.bw / 2, view.by + view.bh / 2, Math.max(view.bw, view.bh) * 0.65)
  bgG.addColorStop(0, 'rgba(255,255,255,0.045)')
  bgG.addColorStop(0.7, 'rgba(0,0,0,0)')
  bgG.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = v['--board'] || '#15132E'
  ctx.fillRect(view.bx, view.by, view.bw, view.bh)
  ctx.fillStyle = bgG
  ctx.fillRect(view.bx, view.by, view.bw, view.bh)

  // 地板 + 墙（视口裁剪）
  for (let y = c0y; y <= c1y; y++) {
    for (let x = c0x; x <= c1x; x++) {
      const px = L.ox + x * cs
      const py = L.oy + y * cs
      if (m.grid[y][x] === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.075)'
        ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2)
        // 墙块顶部 1px 高光（石砖立体感）
        ctx.fillStyle = 'rgba(255,255,255,0.09)'
        ctx.fillRect(px + 1, py + 1, cs - 2, 1)
      } else if (core.secretMap && core.secretMap[x + ',' + y]) {
        // 未撞开的暗室假墙：细微金纹提示
        ctx.fillStyle = 'rgba(201,169,110,0.22)'
        ctx.fillRect(px + cs * 0.3, py + cs * 0.3, cs * 0.4, cs * 0.4)
      }
    }
  }

  // 出口
  const ex = L.ox + m.end.x * cs
  const ey = L.oy + m.end.y * cs
  const locked = m.key && !core.hasKey
  ctx.save()
  ctx.shadowColor = locked ? 'rgba(150,150,170,0.6)' : 'rgba(110,231,160,0.8)'
  ctx.shadowBlur = 8 + pulse * 6
  ctx.strokeStyle = locked ? 'rgba(160,160,180,0.9)' : '#6EE7A0'
  ctx.lineWidth = 2
  ctx.strokeRect(ex + cs * 0.22, ey + cs * 0.22, cs * 0.56, cs * 0.56)
  if (locked) {
    ctx.fillStyle = 'rgba(200,200,220,0.9)'
    ctx.font = Math.round(cs * 0.4) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🔒', ex + cs / 2, ey + cs * 0.56)
  }
  ctx.restore()

  // 起点标记
  ctx.fillStyle = 'rgba(110,231,210,0.35)'
  ctx.fillRect(L.ox + m.start.x * cs + cs * 0.3, L.oy + m.start.y * cs + cs * 0.3, cs * 0.4, cs * 0.4)

  // 单向门箭头
  if (m.oneways) {
    ctx.fillStyle = 'rgba(111,227,210,0.5)'
    for (let i = 0; i < m.oneways.length; i++) {
      const o = m.oneways[i]
      const px = L.ox + o.x * cs + cs / 2
      const py = L.oy + o.y * cs + cs / 2
      const a = DIRA[o.dir]
      ctx.beginPath()
      ctx.moveTo(px + a[0] * cs * 0.22, py + a[1] * cs * 0.22)
      ctx.lineTo(px - a[0] * cs * 0.12 - a[1] * cs * 0.14, py - a[1] * cs * 0.12 - a[0] * cs * 0.14)
      ctx.lineTo(px - a[0] * cs * 0.12 + a[1] * cs * 0.14, py - a[1] * cs * 0.12 + a[0] * cs * 0.14)
      ctx.closePath()
      ctx.fill()
    }
  }

  // 闸门（关闭时橙色横杆）
  if (core.gates) {
    for (let i = 0; i < core.gates.length; i++) {
      const g = core.gates[i]
      if (!g._init || g._open) continue
      const px = L.ox + g.x * cs
      const py = L.oy + g.y * cs
      ctx.fillStyle = 'rgba(255,159,110,0.85)'
      ctx.fillRect(px + cs * 0.1, py + cs * 0.42, cs * 0.8, cs * 0.16)
    }
  }

  // 传送门
  if (core.portals) {
    for (let i = 0; i < core.portals.length; i++) {
      const p = core.portals[i]
      ctx.save()
      ctx.strokeStyle = i === 0 ? '#7FD8FF' : '#C79BFF'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(L.ox + p.x * cs + cs / 2, L.oy + p.y * cs + cs / 2, cs * 0.3 * (0.85 + 0.15 * pulse), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  // 道具（宝石发光 + 呼吸浮动；道具光晕）—— 视口外跳过绘制
  for (let i = 0; i < core.items.length; i++) {
    const it = core.items[i]
    if (it.taken) continue
    if (it.x < c0x - 2 || it.x > c1x + 2 || it.y < c0y - 2 || it.y > c1y + 2) continue
    // 迷雾中未探索的道具不显示
    if (core.seen && !core.seen[it.y] ) continue
    if (core.seen && !core.seen[it.y][it.x]) continue
    const bob = Math.sin(now / 450 + (it.x + it.y) * 0.9) * cs * 0.05
    const px = L.ox + it.x * cs + cs / 2
    const py = L.oy + it.y * cs + cs / 2 + bob
    ctx.save()
    if (it.type === 'gem') {
      ctx.shadowColor = 'rgba(255,216,110,0.9)'
      ctx.shadowBlur = 6 + pulse * 5
      ctx.fillStyle = '#FFD86E'
      ctx.beginPath()
      ctx.arc(px, py, cs * 0.14, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const col = FX_COLOR[it.type] || '#FF9F6E'
      ctx.shadowColor = col
      ctx.shadowBlur = 8 + pulse * 4
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(px, py, cs * 0.26, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = 'rgba(10,12,32,0.9)'
      ctx.font = 'bold ' + Math.round(cs * 0.3) + 'px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(FX_GLYPH[it.type] || '?', px, py + cs * 0.02)
    }
    ctx.restore()
  }

  // 子弹
  ctx.fillStyle = '#FF6B81'
  for (let i = 0; i < core.bullets.length; i++) {
    const b = core.bullets[i]
    ctx.fillRect(L.ox + b.x * cs - cs * 0.08, L.oy + b.y * cs - cs * 0.08, cs * 0.16, cs * 0.16)
  }

  // 怪物（视口外跳过绘制）
  for (let i = 0; i < core.monsters.length; i++) {
    const mm = core.monsters[i]
    if (mm.vx < c0x - 1 || mm.vx > c1x + 1 || mm.vy < c0y - 1 || mm.vy > c1y + 1) continue
    const mx = L.ox + mm.vx * cs + cs / 2
    const my = L.oy + mm.vy * cs + cs / 2
    ctx.save()
    if (mm.isBoss) {
      ctx.shadowColor = 'rgba(255,77,99,0.9)'
      ctx.shadowBlur = 10 + pulse * 8
      ctx.fillStyle = mm.flee ? '#FFC15E' : '#FF4D63'
      ctx.beginPath()
      ctx.arc(mx, my, cs * 0.4, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const hot = mm.alert >= 80 || mm.chasing
      ctx.fillStyle = mm.isGatekeeper ? '#FF9F6E' : (hot ? '#FF4D63' : '#C1495B')
      ctx.beginPath()
      ctx.arc(mx, my, cs * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // 迷雾覆盖（未探索区域压黑，须在实体之后；视口裁剪）
  if (core.seen) {
    ctx.fillStyle = 'rgba(4,5,15,0.93)'
    for (let y = c0y; y <= c1y; y++) {
      for (let x = c0x; x <= c1x; x++) {
        if (!core.seen[y][x]) {
          ctx.fillRect(L.ox + x * cs - 0.5, L.oy + y * cs - 0.5, cs + 1, cs + 1)
        }
      }
    }
  }

  // 玩家小人（行走动画）+ 火把光圈
  const pvx = L.ox + core.visual.x * cs + cs / 2
  const pvy = L.oy + core.visual.y * cs + cs / 2
  // 火把氛围光（呼吸，叠加在迷雾之上）
  const lr = cs * (3.2 + 0.25 * Math.sin(now / 520))
  const lg = ctx.createRadialGradient(pvx, pvy, 0, pvx, pvy, lr)
  lg.addColorStop(0, 'rgba(255,205,120,0.14)')
  lg.addColorStop(0.5, 'rgba(255,190,100,0.06)')
  lg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lg
  ctx.fillRect(pvx - lr, pvy - lr, lr * 2, lr * 2)
  drawWalker(ctx, core, view, pvx, pvy, cs, now)
  if (core.hasKey) {
    ctx.fillStyle = '#FFD86E'
    ctx.font = Math.round(cs * 0.28) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('钥', pvx, pvy - cs * 0.42)
  }
  if (core.shield) {
    ctx.strokeStyle = 'rgba(111,227,210,0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(pvx, pvy, cs * 0.42, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

const DIRA = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }

/* ---------- 玩家小人：chibi 造型 + 四向行走动画 + 手持火把 ---------- */
// 英雄皮肤调色板：view.heroPal 优先（storage.getHeroPal 传入），缺省回退金衫旅人
const HERO_DEFAULT = {
  skin: '#FFE3C4', hair: '#453863', tunic: '#FFC15E', tunic2: '#D98F35',
  pants: '#4E4370', boot: '#2E2850', eye: '#2E2850',
  glow: 'rgba(255,193,94,0.55)',
  flame: ['255,240,170', '255,180,70', '255,120,40']
}

function drawWalker(ctx, core, view, x, y, cs, now) {
  const P = view.heroPal || HERO_DEFAULT
  const st = core.state || {}
  // 朝向：state.dir 为空（停下）时沿用上次朝向（挂在 view 上跨帧持久）
  if (st.dir) view.lastDir = st.dir
  const dir = st.dir || view.lastDir || 'D'
  const mdx = (st.x !== undefined ? st.x : core.visual.x) - core.visual.x
  const mdy = (st.y !== undefined ? st.y : core.visual.y) - core.visual.y
  const moving = mdx * mdx + mdy * mdy > 0.0016
  const amp = moving ? 1 : 0
  const phase = now / 115
  const swing = Math.sin(phase) * amp
  // 行走上下起伏（2 倍步频）；待机时轻微呼吸
  const bob = moving ? Math.abs(Math.cos(phase)) * cs * 0.05 : Math.sin(now / 620) * cs * 0.016
  const dx = dir === 'L' ? -1 : dir === 'R' ? 1 : 0
  const dy = dir === 'U' ? -1 : dir === 'D' ? 1 : 0
  const back = dir === 'U'

  ctx.save()
  ctx.translate(x, y)

  // 脚下影子（压扁圆，避免依赖 ctx.ellipse）
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.save()
  ctx.scale(1, 0.4)
  ctx.beginPath()
  ctx.arc(0, cs * 0.30 / 0.4, cs * 0.19, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // ---- 腿（摆动 + 踏步抬起） ----
  ctx.lineCap = 'round'
  ctx.lineWidth = cs * 0.085
  ctx.strokeStyle = P.pants
  for (let side = -1; side <= 1; side += 2) {
    const sw = swing * side
    let fx = side * cs * 0.075
    let fy = cs * 0.27
    if (dx !== 0) {
      fx += sw * cs * 0.11 * dx
      fy -= Math.abs(sw) * cs * 0.035
    } else {
      fy += sw * cs * 0.05 * dy - Math.max(0, sw) * cs * 0.07
    }
    ctx.beginPath()
    ctx.moveTo(side * cs * 0.06, cs * 0.10)
    ctx.lineTo(fx, fy)
    ctx.stroke()
    ctx.fillStyle = P.boot
    ctx.beginPath()
    ctx.arc(fx, fy, cs * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- 上半身（行走时朝移动方向微倾 + 起伏） ----
  ctx.save()
  ctx.translate(dx * cs * 0.03 * amp, dy * cs * 0.02 * amp - bob)

  // 手臂（与腿反相摆动）；火把手 = 朝向前侧
  const torchSide = dx !== 0 ? dx : 1
  ctx.lineWidth = cs * 0.07
  for (let side = -1; side <= 1; side += 2) {
    const sw = -swing * side
    const ax = side * cs * 0.15
    const ay = -cs * 0.035
    let hx = ax + sw * cs * 0.10 * dx
    let hy = cs * 0.10 + (dx !== 0 ? Math.abs(sw) * cs * 0.02 : sw * cs * 0.05 * (dy || 1))
    const isTorch = side === torchSide
    if (isTorch) {
      // 火把手臂抬起持炬
      hx = ax + dx * cs * 0.05 + torchSide * cs * 0.02
      hy = -cs * 0.06
    }
    ctx.strokeStyle = isTorch ? P.tunic : P.tunic2
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(hx, hy)
    ctx.stroke()
    // 手
    ctx.fillStyle = P.skin
    ctx.beginPath()
    ctx.arc(hx, hy, cs * 0.045, 0, Math.PI * 2)
    ctx.fill()
    // 火把（炬杆 + 摇曳火焰）
    if (isTorch) {
      const tx = hx + torchSide * cs * 0.03
      const ty = hy - cs * 0.17
      ctx.strokeStyle = '#8A5A2B'
      ctx.lineWidth = cs * 0.045
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      const fr = cs * (0.055 + 0.014 * Math.sin(now / 90) + 0.008 * Math.sin(now / 37))
      const fg = ctx.createRadialGradient(tx, ty, 0, tx, ty, fr * 2.2)
      fg.addColorStop(0, 'rgba(' + P.flame[0] + ',0.95)')
      fg.addColorStop(0.4, 'rgba(' + P.flame[1] + ',0.75)')
      fg.addColorStop(1, 'rgba(' + P.flame[2] + ',0)')
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.arc(tx, ty, fr * 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFE9A8'
      ctx.beginPath()
      ctx.arc(tx, ty, fr * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 躯干（金衫）
  ctx.fillStyle = P.tunic
  ctx.save()
  ctx.shadowColor = P.glow
  ctx.shadowBlur = 8
  roundRectPath(ctx, -cs * 0.13, -cs * 0.085, cs * 0.26, cs * 0.20, cs * 0.075)
  ctx.fill()
  ctx.restore()
  // 腰带
  ctx.fillStyle = P.tunic2
  ctx.fillRect(-cs * 0.115, cs * 0.055, cs * 0.23, cs * 0.032)

  // 头
  const hcx = dx * cs * 0.015
  const hcy = -cs * 0.215
  const hr = cs * 0.125
  ctx.fillStyle = P.skin
  ctx.beginPath()
  ctx.arc(hcx, hcy, hr, 0, Math.PI * 2)
  ctx.fill()
  if (back) {
    // 背影：头发盖住整个后脑
    ctx.fillStyle = P.hair
    ctx.beginPath()
    ctx.arc(hcx, hcy, hr, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.skin
    ctx.beginPath()
    ctx.arc(hcx - hr * 0.85, hcy + hr * 0.1, hr * 0.16, 0, Math.PI * 2)
    ctx.arc(hcx + hr * 0.85, hcy + hr * 0.1, hr * 0.16, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // 头发（上半 + 侧刘海）
    ctx.fillStyle = P.hair
    ctx.beginPath()
    ctx.arc(hcx, hcy - hr * 0.08, hr, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(hcx - hr, hcy - hr * 0.14, hr * 2, hr * 0.22)
    // 眼睛（看向移动方向）
    ctx.fillStyle = P.eye
    const exo = dx * hr * 0.28
    ctx.beginPath()
    ctx.arc(hcx - hr * 0.36 + exo, hcy + hr * 0.18, hr * 0.14, 0, Math.PI * 2)
    ctx.arc(hcx + hr * 0.36 + exo, hcy + hr * 0.18, hr * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore() // 上半身
  ctx.restore()
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

module.exports = { drawBoard: drawBoard, computeLayout: computeLayout, FX_GLYPH: FX_GLYPH, FX_COLOR: FX_COLOR }
