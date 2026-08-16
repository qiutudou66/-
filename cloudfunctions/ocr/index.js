// cloudfunctions/ocr - 拍照识别贴纸文字（百度 OCR），返回 IMEI/型号/内存/电池/充电次数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const https = require('https')

// 密钥从云函数环境变量读取（云开发控制台 → 云函数 ocr → 配置 → 环境变量）
const API_KEY = process.env.BAIDU_API_KEY || ''
const SECRET_KEY = process.env.BAIDU_SECRET_KEY || ''

exports.main = async (event) => {
  const { action, fileID } = event
  if (action !== 'recognize') return { code: 1, message: '未知操作' }
  if (!API_KEY || !SECRET_KEY) {
    return { code: 1, message: 'OCR 未配置：去云开发控制台给 ocr 云函数配环境变量 BAIDU_API_KEY / BAIDU_SECRET_KEY' }
  }
  if (!fileID) return { code: 1, message: '缺少图片' }

  // 1. 从云存储下载图片
  const dl = await cloud.downloadFile({ fileID })
  const base64 = dl.fileContent.toString('base64')

  // 2. 拿百度 access_token
  const token = await getToken()

  // 3. 通用文字识别
  const body = 'image=' + encodeURIComponent(base64)
  const ocrRes = await httpJson(
    'POST',
    `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`,
    body,
    'application/x-www-form-urlencoded'
  )
  if (ocrRes.error_code) return { code: 1, message: '识别失败：' + (ocrRes.error_msg || ocrRes.error_code) }

  // OCR 结果按行保留（贴纸通常是「第一行型号 + 每行键:值」的结构）
  const lines = (ocrRes.words_result || []).map(w => (w.words || '').trim()).filter(Boolean)
  return { code: 0, data: parseFields(lines) }
}

// 模块级 token 缓存：云函数实例存活期间复用，省掉每次识别的 token 请求
let cachedToken = ''
let cachedTokenAt = 0

async function getToken() {
  if (cachedToken && Date.now() - cachedTokenAt < 25 * 24 * 3600 * 1000) return cachedToken
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(API_KEY)}&client_secret=${encodeURIComponent(SECRET_KEY)}`
  const res = await httpJson('GET', url, null, 'application/json')
  if (!res.access_token) throw new Error('获取百度 token 失败：' + JSON.stringify(res))
  cachedToken = res.access_token
  cachedTokenAt = Date.now()
  return cachedToken
}

function httpJson(method, url, body, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: { 'Content-Type': contentType || 'application/json' }
    }, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('响应解析失败：' + raw.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const BRAND_RE = /iPhone|苹果|Apple|华为|HUAWEI|小米|Xiaomi|红米|Redmi|OPPO|vivo|荣耀|HONOR|三星|SAMSUNG|一加|OnePlus|魅族|MEIZU|realme|真我|摩托罗拉|Motorola|联想|联想/i

function parseFields(lines) {
  const out = { rawText: lines.join('\n'), imei: '', model: '', memory: '', brand: '', battery: '', cycles: '' }
  const full = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!full) return out

  // IMEI：优先「IMEI/编号」行里的 15 位数字，否则全局找
  for (const ln of lines) {
    if (/imei|编号|串号/i.test(ln)) {
      const m = ln.match(/\d{15}/)
      if (m) { out.imei = m[0]; break }
    }
  }
  if (!out.imei) {
    const m = full.match(/\b\d{15}\b/)
    if (m) out.imei = m[0]
  }

  // 容量：遍历所有 容量/内存/存储 行取最大值（跳过「运行内存 8G」小值，拿「存储 512G」）
  let memMax = 0
  for (const ln of lines) {
    if (!/容量|内存|存储|运行|rom/i.test(ln)) continue
    const re = /\b(\d{1,4})\s*([gG][bB]?|T)\b/g
    let mm
    while ((mm = re.exec(ln)) !== null) {
      const n = parseInt(mm[1], 10)
      memMax = Math.max(memMax, mm[2].toUpperCase() === 'T' ? n * 1024 : n)
    }
  }
  if (memMax > 0) out.memory = memMax >= 1024 ? '1T' : memMax + 'G'

  // 电池：电池/寿命/健康/电量 行里的 xx%
  for (const ln of lines) {
    if (/电池|寿命|健康|电量/i.test(ln)) {
      const m = ln.match(/\b\d{1,3}\s*%/)
      if (m) { out.battery = m[0].replace(/\s+/g, ''); break }
    }
  }
  if (!out.battery) {
    const m = full.match(/\b(\d{1,3})\s*%/)
    if (m) out.battery = m[1] + '%'
  }

  // 充电次数：充电/循环/次数 行里的数字（OCR 可能有乱码，宽松取行里第一个数字）
  for (const ln of lines) {
    if (/充电|循环|次数/.test(ln)) {
      const m = ln.match(/(\d{1,5})/)
      if (m) { out.cycles = m[1]; break }
    }
  }

  // 型号：第一行（去掉「设备型号：/型号：」前缀）
  const first = (lines[0] || '').trim().replace(/^(?:设备\s*)?型号\s*[:：]\s*/, '')
  if (first) out.model = first

  // 品牌：从全文匹配型号里带的品牌词
  const brandKey = full.match(BRAND_RE)
  if (brandKey) {
    const b = brandKey[0].toLowerCase()
    if (b.includes('iphone') || b.includes('苹果') || b.includes('apple')) out.brand = '苹果'
    else if (b.includes('huawei') || b.includes('华为')) out.brand = '华为'
    else if (b.includes('xiaomi') || b.includes('小米') || b.includes('redmi') || b.includes('红米')) out.brand = '小米'
    else if (b.includes('oppo')) out.brand = 'OPPO'
    else if (b.includes('vivo')) out.brand = 'vivo'
    else if (b.includes('honor') || b.includes('荣耀')) out.brand = '荣耀'
    else if (b.includes('samsung') || b.includes('三星')) out.brand = '三星'
    else if (b.includes('oneplus') || b.includes('一加')) out.brand = '一加'
    else if (b.includes('meizu') || b.includes('魅族')) out.brand = '魅族'
    else if (b.includes('motorola') || b.includes('摩托罗拉')) out.brand = '摩托罗拉'
    else if (b.includes('realme') || b.includes('真我')) out.brand = '真我'
    else if (b.includes('联想')) out.brand = '联想'
    else out.brand = brandKey[0]
  }

  return out
}
