/**
 * 皮肤主题系统
 * 四套主题：classic（经典玻璃拟态）/ glow（夜光霓虹）/ festival（节日红金）/ cosmos（星穹深空）
 * - vars：整套 CSS 变量 token，用于根视图 inline style 覆盖
 * - zones：6 个分区主题色（随皮肤切换，第 6 个为虚空回响）
 * - price：解锁所需光尘（0 = 默认拥有，解锁状态由 storage 管理）
 */
const THEMES = {
  classic: {
    label: '经典',
    price: 0,
    vars: {
      '--bg-1': '#13123A',
      '--bg-2': '#2A2566',
      '--bg-3': '#0F3A47',
      '--glass': 'rgba(255,255,255,0.10)',
      '--glass-strong': 'rgba(255,255,255,0.16)',
      '--glass-line': 'rgba(255,255,255,0.16)',
      '--panel': '#1C1A4D',
      '--panel-2': '#131140',
      '--panel-line': 'rgba(255,255,255,0.22)',
      '--text': '#F3F1FF',
      '--text-sub': 'rgba(243,241,255,0.78)',
      '--accent': '#6FE3D2',
      '--accent-2': '#9B8CFF',
      '--warn': '#FFC15E',
      '--danger': '#FF7A92',
      '--board': '#15132E'
    },
    zones: ['#6FE3D2', '#9B8CFF', '#5BC8FF', '#FF9F6E', '#FFD86E', '#E36BFF']
  },
  glow: {
    label: '夜光',
    price: 120,
    vars: {
      '--bg-1': '#02100C',
      '--bg-2': '#06222B',
      '--bg-3': '#1A0635',
      '--glass': 'rgba(120,255,200,0.09)',
      '--glass-strong': 'rgba(120,255,200,0.14)',
      '--glass-line': 'rgba(120,255,200,0.18)',
      '--panel': '#062A22',
      '--panel-2': '#041C18',
      '--panel-line': 'rgba(120,255,200,0.30)',
      '--text': '#E8FFF6',
      '--text-sub': 'rgba(200,255,235,0.76)',
      '--accent': '#39FF9E',
      '--accent-2': '#22E0FF',
      '--warn': '#B9FF3D',
      '--danger': '#FF5C8A',
      '--board': '#04130F'
    },
    zones: ['#39FF9E', '#22E0FF', '#7A5CFF', '#FF5C8A', '#FFD23D', '#C06BFF']
  },
  festival: {
    label: '节日',
    price: 260,
    vars: {
      '--bg-1': '#3A0D2B',
      '--bg-2': '#7A1230',
      '--bg-3': '#B5451F',
      '--glass': 'rgba(255,225,170,0.10)',
      '--glass-strong': 'rgba(255,225,170,0.16)',
      '--glass-line': 'rgba(255,225,170,0.20)',
      '--panel': '#4A1226',
      '--panel-2': '#300A1B',
      '--panel-line': 'rgba(255,225,170,0.28)',
      '--text': '#FFF4E2',
      '--text-sub': 'rgba(255,232,200,0.80)',
      '--accent': '#FFD23F',
      '--accent-2': '#FF8A3D',
      '--warn': '#FFE680',
      '--danger': '#FF6B6B',
      '--board': '#2A0A1E'
    },
    zones: ['#FF6B6B', '#FFA53D', '#FFD23F', '#FF8FA3', '#FFE066', '#D07DFF']
  },
  cosmos: {
    label: '星穹',
    price: 500,
    vars: {
      '--bg-1': '#0A0A2E',
      '--bg-2': '#1C1245',
      '--bg-3': '#050D33',
      '--glass': 'rgba(190,180,255,0.10)',
      '--glass-strong': 'rgba(190,180,255,0.16)',
      '--glass-line': 'rgba(190,180,255,0.18)',
      '--panel': '#171443',
      '--panel-2': '#0C0A2E',
      '--panel-line': 'rgba(190,180,255,0.26)',
      '--text': '#EFEAFF',
      '--text-sub': 'rgba(215,205,255,0.78)',
      '--accent': '#8FB8FF',
      '--accent-2': '#C79BFF',
      '--warn': '#FFE08A',
      '--danger': '#FF7AA2',
      '--board': '#0B0B33'
    },
    zones: ['#8FB8FF', '#C79BFF', '#5EE6D8', '#FF9EC2', '#FFE08A', '#B98CFF']
  }
};

const ORDER = ['classic', 'glow', 'festival', 'cosmos'];

function getTheme(name) {
  return THEMES[name] || THEMES.classic;
}

// 生成可绑定的 inline style（覆盖根视图 CSS 变量）
function themeStyle(name) {
  const v = getTheme(name).vars;
  const ks = Object.keys(v);
  let s = '';
  for (let i = 0; i < ks.length; i++) s += ks[i] + ':' + v[ks[i]] + ';';
  return s;
}

function zoneColors(name) {
  return getTheme(name).zones.slice();
}

function nextTheme(name) {
  const i = ORDER.indexOf(name);
  return ORDER[(i + 1) % ORDER.length];
}

module.exports = {
  THEMES: THEMES,
  ORDER: ORDER,
  getTheme: getTheme,
  themeStyle: themeStyle,
  zoneColors: zoneColors,
  nextTheme: nextTheme
};
