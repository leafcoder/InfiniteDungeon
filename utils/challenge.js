// 挑战码（自定义挑战生成器）：模板关卡 + 词缀 + 随机种子 → 短码分享
// 码格式：MZ + 模板位(0/1/2) + 词缀位(2位hex, 6bit) + 种子(3位hex, 12bit) + 校验位
// 词缀与周挑战共用（weekly.MODS）：fog/dark/haste/slow/noitem/more

const TEMPLATES = [
  { id: 0, level: 30, name: '新秀 · 第30关' },
  { id: 1, level: 50, name: '精英 · 第50关' },
  { id: 2, level: 70, name: '宗师 · 第70关' }
];

const MOD_ORDER = ['fog', 'dark', 'haste', 'slow', 'noitem', 'more'];

function checksum(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  }
  return (h % 36).toString(36);
}

// 生成挑战码；mods 为词缀 key 数组
function encode(templateId, mods, seed) {
  const t = TEMPLATES[templateId] ? templateId : 0;
  let bits = 0;
  const list = [];
  for (let i = 0; i < MOD_ORDER.length; i++) {
    if (mods && mods.indexOf(MOD_ORDER[i]) !== -1) {
      bits |= (1 << i);
      list.push(MOD_ORDER[i]);
    }
  }
  const s = (seed >>> 0) & 0xFFF;
  const body = ('MZ' + t + bits.toString(16).padStart(2, '0') + s.toString(16).padStart(3, '0')).toUpperCase();
  return body + checksum(body);
}

// 解析挑战码；合法返回 { level, mods:[], seed }，非法返回 null
function decode(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim();
  if (c.length !== 9 || c.slice(0, 2).toUpperCase() !== 'MZ') return null;
  // 校验体统一大写、校验位统一小写比较（用户粘贴可能大小写混杂）
  const body = c.slice(0, 8).toUpperCase();
  if (checksum(body) !== c.slice(8).toLowerCase()) return null;
  const t = parseInt(body[2], 10);
  if (!(t >= 0 && t < TEMPLATES.length)) return null;
  const bits = parseInt(body.slice(3, 5), 16);
  if (isNaN(bits)) return null;
  const seed = parseInt(body.slice(5, 8), 16);
  if (isNaN(seed)) return null;
  const mods = [];
  for (let i = 0; i < MOD_ORDER.length; i++) {
    if (bits & (1 << i)) mods.push(MOD_ORDER[i]);
  }
  return { level: TEMPLATES[t].level, mods: mods, seed: seed };
}

module.exports = {
  TEMPLATES: TEMPLATES,
  MOD_ORDER: MOD_ORDER,
  encode: encode,
  decode: decode
};
