// cloudfunctions/import - 批量导入（仅老板）：parse 解析预览 / import 写入库存+流水
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { parseWorkbook, todayStr } = require('./parser')

const POOL = 5 // 写入并发数，控制在云库写限流内

async function ensureCollections() {
  for (const name of ['phones', 'flows']) {
    try { await db.createCollection(name) } catch (e) { /* 已存在则忽略 */ }
  }
}

exports.main = async (event) => {
  const { action, _store_id, _role } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (_role !== 'boss') return { code: 1, message: '仅老板可批量导入' }
  await ensureCollections()
  try {
    switch (action) {
      case 'parse': return await parse(event)
      case 'import': return await doImport(event)
      default: return { code: 1, message: '未知操作' }
    }
  } catch (e) {
    return { code: 1, message: (e && e.message) || '导入失败' }
  }
}

// 解析预览：只读不写库，返回每行解析结果 + 缺失标注（detail 截断控制包体）
async function parse(event) {
  const { fileID } = event
  if (!fileID) return { code: 1, message: '缺少文件' }
  const dl = await cloud.downloadFile({ fileID })
  const { sheetName, rows } = parseWorkbook(dl.fileContent)

  const truncated = rows.length > 300
  const visibleRows = rows.slice(0, 300).map(r => ({
    rowIndex: r.rowIndex,
    imei: r.imei,
    brand: r.brand,
    model: r.model,
    memory: r.memory,
    battery: r.battery,
    color: r.color,
    cost_price: r.cost_price,
    expect_price: r.expect_price,
    recycle_date: r.recycle_date,
    detail: (r.detail || '').slice(0, 60),
    issues: r.issues,
    warnings: r.warnings,
    placeholder: r.placeholder
  }))
  const ready = rows.filter(r => r.issues.length === 0).length
  const placeholder = rows.filter(r => r.placeholder).length
  return {
    code: 0,
    data: {
      sheetName,
      rows: visibleRows,
      truncated,
      summary: { total: rows.length, ready, withIssues: rows.length - ready, placeholder }
    }
  }
}

// 批量写入：IMEI 店内查重 + 建机 + 收机流水（与 phone create 完全一致）
async function doImport(event) {
  const { fileID, _store_id } = event
  if (!fileID) return { code: 1, message: '缺少文件' }
  const dl = await cloud.downloadFile({ fileID })
  const { rows } = parseWorkbook(dl.fileContent)
  return { code: 0, data: await writeRows(rows, _store_id) }
}

// 预检：批量查库中已存在的 IMEI，减少逐行 count
async function precheckExisting(rows, storeId) {
  const set = new Set()
  const imeis = [...new Set(rows.map(r => r.imei).filter(Boolean))]
  for (let i = 0; i < imeis.length; i += 100) {
    const batch = imeis.slice(i, i + 100)
    const res = await db.collection('phones').where({ imei: _.in(batch), store_id: storeId }).limit(100).get()
    res.data.forEach(p => set.add(p.imei))
  }
  return set
}

async function writeRows(rows, storeId) {
  const existing = await precheckExisting(rows, storeId)
  const result = { total: rows.length, ok: 0, skipped: 0, failed: 0, items: [] }
  const seen = new Set() // 文件内去重，必须在首个 await 前同步 add 防并发双插
  let cursor = 0

  const worker = async () => {
    while (cursor < rows.length) {
      const i = cursor++
      const row = rows[i]
      const imei = row.imei

      if (row.issues.length > 0) {
        result.failed++
        result.items.push({ rowIndex: row.rowIndex, imei, message: row.issues.join('；') })
        continue
      }
      if (seen.has(imei)) {
        result.skipped++
        result.items.push({ rowIndex: row.rowIndex, imei, message: '文件内 IMEI 重复' })
        continue
      }
      seen.add(imei)
      if (existing.has(imei)) {
        result.skipped++
        result.items.push({ rowIndex: row.rowIndex, imei, message: 'IMEI 已存在，跳过' })
        continue
      }
      try {
        const dup = await withRetry(() => db.collection('phones').where({ imei, store_id: storeId }).count())
        if (dup.total > 0) {
          result.skipped++
          result.items.push({ rowIndex: row.rowIndex, imei, message: 'IMEI 已存在，跳过' })
          continue
        }
        await insertPhoneAndFlow(row, storeId)
        result.ok++
      } catch (e) {
        result.failed++
        result.items.push({ rowIndex: row.rowIndex, imei, message: String((e && e.message) || e).slice(0, 80) })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(POOL, rows.length) }, () => worker()))
  return result
}

// 建机 + 收机流水，字段与 phone/index.js create() 保持一致
async function insertPhoneAndFlow(row, storeId) {
  const now = db.serverDate()
  const recycleDate = row.recycle_date || todayStr()
  const costPrice = row.cost_price

  const addRes = await db.collection('phones').add({
    data: {
      store_id: storeId,
      imei: row.imei,
      brand: row.brand,
      model: row.model,
      memory: row.memory,
      battery: row.battery || '',
      color: row.color || '',
      grade: 1,
      cost_price: costPrice,
      expect_price: row.expect_price != null ? row.expect_price : null,
      sell_price: null,
      status: 0,
      recycle_date: recycleDate,
      sell_date: null,
      detail: (row.detail || '').slice(0, 500),
      images: [],
      seller_name: '',
      seller_id: '',
      seller_phone: '',
      remark: row.placeholder ? '批量导入（序列号缺失，型号ID占位）' : '批量导入',
      created_at: now,
      updated_at: now
    }
  })

  await db.collection('flows').add({
    data: {
      store_id: storeId,
      phone_id: addRes._id,
      type: 1,
      amount: -costPrice,
      date: recycleDate,
      remark: '批量导入',
      created_at: now
    }
  })
}

async function withRetry(fn, times = 3) {
  let lastErr
  for (let i = 0; i < times; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i < times - 1) await new Promise(r => setTimeout(r, 100 * (i + 1)))
    }
  }
  throw lastErr
}
