// cloudfunctions/import/parser.js - 纯解析逻辑（Excel → 手机字段），无 wx 依赖，可独立测试
const XLSX = require('xlsx')

// 表头列名别名表（normalize 后精确匹配）
const COL_ALIASES = {
  imei: ['序列号', 'imei', '串号', 'sn', '编号', 'imeino'],
  model_id: ['型号id', '型号id编号'],
  brand: ['品牌', 'brand'],
  model: ['型号', 'model', '机型'],
  detail: ['文案', '描述', '详情', '备注', 'remark', '商品描述'],
  cost_price: ['入库价', '成本价', '收机价', '收购价', '进价', 'costprice', 'cost'],
  expect_price: ['零售价', '售价', '期望价', '标价', 'sellprice', 'expect'],
  recycle_date: ['入库时间', '入库日期', '收机日期', '日期', '时间', 'recvdate', 'indate']
}
const COL_DESC = {
  imei: '序列号', brand: '品牌', model: '型号', detail: '文案',
  cost_price: '入库价', expect_price: '零售价', recycle_date: '入库时间'
}

// 颜色词表：长词在前，避免"深空灰"被"灰色"抢先匹配
const COLOR_WORDS = [
  '深空灰', '太空灰', '深灰色', '星光色', '午夜蓝', '午夜绿', '远峰蓝', '苍岭绿',
  '石墨色', '玫瑰金', '香槟金', '土豪金', '曜石黑', '珍珠白', '陶瓷白', '紫罗兰',
  '薰衣草紫', '军绿色', '深蓝色',
  '黑色', '白色', '银色', '金色', '蓝色', '紫色', '绿色', '红色', '粉色',
  '橙色', '黄色', '灰色', '青色', '棕色'
]

// 单字色兜底（排除金/银，避免"金属边框"等误判），命中输出"X色"
const COLOR_SINGLE = ['黑', '白', '蓝', '紫', '绿', '红', '粉', '橙', '黄', '灰', '青', '棕']

function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase()
}

// 解析整个工作簿：返回 { sheetName, rows }，rows 每项为解析后的行
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('文件中没有表格')
  const ws = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

  let headerRowIdx = -1
  for (let i = 0; i < aoa.length; i++) {
    if (isHeaderRow(aoa[i])) { headerRowIdx = i; break }
  }
  if (headerRowIdx === -1) throw new Error('未识别到表头（需包含 序列号/品牌/型号/入库价 等列）')

  const colMap = buildColMap(aoa[headerRowIdx])
  for (const key of ['imei', 'brand', 'model', 'cost_price']) {
    if (colMap[key] == null) throw new Error(`缺少必需列：${COL_DESC[key]}`)
  }

  const rows = []
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const cells = aoa[i]
    // 数据行过滤：序列号/品牌/型号/入库价 任一非空才视为数据行
    const hasVal = ['imei', 'brand', 'model', 'cost_price'].some(key => {
      const idx = colMap[key]
      return idx != null && cells[idx] != null && String(cells[idx]).trim() !== ''
    })
    if (!hasVal) continue
    rows.push({ rowIndex: i + 1, ...parseRow(cells, colMap) })
  }
  return { sheetName, rows }
}

function isHeaderRow(row) {
  let hits = 0
  for (const cell of row) {
    const n = norm(cell)
    if (n && matchAlias(n)) hits++
  }
  return hits >= 2
}

function matchAlias(n) {
  for (const key of Object.keys(COL_ALIASES)) {
    if (COL_ALIASES[key].indexOf(n) >= 0) return true
  }
  return false
}

function buildColMap(headerRow) {
  const map = {}
  headerRow.forEach((cell, idx) => {
    const n = norm(cell)
    if (!n) return
    for (const key of Object.keys(COL_ALIASES)) {
      if (COL_ALIASES[key].indexOf(n) >= 0 && map[key] == null) {
        map[key] = idx
        break
      }
    }
  })
  return map
}

function parseRow(cells, colMap) {
  const issues = []
  const warnings = []
  let placeholder = false
  const get = key => (colMap[key] == null ? '' : cells[colMap[key]])

  let imei = cleanImei(get('imei'))
  const brand = String(get('brand') || '').trim()
  const model = String(get('model') || '').trim()
  const detail = String(get('detail') || '').trim()
  const memory = parseMemory(detail) || parseMemory(model)
  const battery = parseBattery(detail)
  const color = parseColor(detail) || parseColor(model)
  const costPrice = cleanPrice(get('cost_price'))
  const expectPrice = cleanPrice(get('expect_price'))
  const recycleDate = parseDate(get('recycle_date'))

  if (!imei) {
    const mid = String(get('model_id') || '').trim()
    if (mid) {
      imei = mid
      placeholder = true
      warnings.push('序列号缺失，已用型号ID占位')
    } else {
      issues.push('缺序列号')
    }
  }
  if (!brand) issues.push('缺品牌')
  if (!model) issues.push('缺型号')
  if (!memory) issues.push('容量未识别')
  if (costPrice == null) issues.push('成本价格式异常')

  return {
    imei, brand, model, memory, battery, color,
    cost_price: costPrice,
    expect_price: expectPrice,
    recycle_date: recycleDate,
    detail,
    issues,
    warnings,
    placeholder
  }
}

// IMEI：去空白连字符；带 "IMEI:" 前缀取 15~17 位连续数字
function cleanImei(v) {
  if (v == null) return ''
  const s = String(v).trim()
  const m = s.match(/imei[:：]\s*(\d{15,17})/i)
  if (m) return m[1]
  const cleaned = s.replace(/[\s\-]/g, '')
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 15 ? digits : cleaned
}

// 容量：优先带单位正则（取 GB 最大值，自动跳过"运行内存 12G"取存储容量）；
// 无单位时用存储特征值兜底（排除 8/16 等型号常见数字），救"17promax256"这类裸数字文案
const MEMORY_BARE = [2048, 1024, 512, 256, 128, 64, 32]

function parseMemory(s) {
  if (!s) return ''
  const re = /(\d{1,4}(?:\.\d)?)\s*(GB|G|TB|T)\b/gi
  let bestGB = -1
  let m
  while ((m = re.exec(s)) !== null) {
    const num = parseFloat(m[1])
    const unit = m[2].toUpperCase()
    const gb = (unit === 'TB' || unit === 'T') ? num * 1024 : num
    if (gb > bestGB) bestGB = gb
  }
  if (bestGB >= 1024) {
    const t = bestGB / 1024
    return (Number.isInteger(t) ? String(t) : String(parseFloat(t.toFixed(1)))) + 'T'
  }
  if (bestGB >= 0) return String(bestGB) + 'G'
  for (const v of MEMORY_BARE) {
    const reBare = new RegExp('(^|[^0-9.])' + v + '([^0-9.]|$)')
    if (reBare.test(s)) return String(v) + 'G'
  }
  return ''
}

// 电池寿命：三档兜底，统一输出如 "91%"
function parseBattery(s) {
  if (!s) return ''
  let m = s.match(/(?:电池|寿命|健康|电量)[^\d]{0,8}(\d{1,3})\s*%/i)
  if (m) return `${m[1]}%`
  m = s.match(/(\d{1,3})\s*%/)
  if (m) return `${m[1]}%`
  m = s.match(/(?:电池|寿命|健康)\D{0,4}(\d{1,3})/)
  if (m) return `${m[1]}%`
  return ''
}

// 颜色：双字词表优先，未命中再用单字兜底
function parseColor(s) {
  if (!s) return ''
  for (const c of COLOR_WORDS) {
    if (s.indexOf(c) >= 0) return c
  }
  for (const c of COLOR_SINGLE) {
    if (s.indexOf(c) >= 0) return `${c}色`
  }
  return ''
}

// 价格：清洗 "1,200"/"1200元" → 1200；清洗不出返回 null
function cleanPrice(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number(v.toFixed(2))
  const s = String(v).replace(/[^\d.\-]/g, '')
  if (!s || s === '.' || s === '-') return null
  const n = Number(s)
  return isNaN(n) ? null : Number(n.toFixed(2))
}

// 日期：Date对象 / Excel序列号 / "2024/5/1" / "20240501" → YYYY-MM-DD
// xlsx 的 cellDates 用本地时区构造 Date（纯日期序列号无时区），用 getFullYear 本地方法取日期
function parseDate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v)) return fmtYMD(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') {
    if (v > 20000 && v < 60000) {
      const d = new Date(Math.round((v - 25569) * 86400000))
      return fmtYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }
    return ''
  }
  const s = String(v).trim()
  let m = s.match(/(\d{4})[年./\-](\d{1,2})[月./\-](\d{1,2})/)
  if (m) return fmtYMD(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{8})$/)
  if (m) return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`
  return ''
}

function fmtYMD(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr() {
  const d = new Date()
  return fmtYMD(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

module.exports = {
  parseWorkbook,
  parseRow,
  parseMemory,
  parseBattery,
  parseColor,
  cleanImei,
  cleanPrice,
  parseDate,
  todayStr,
  COL_ALIASES,
  COLOR_WORDS
}
