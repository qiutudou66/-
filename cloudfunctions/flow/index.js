// cloudfunctions/flow - 流水/统计/看板
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合不存在时自动创建，避免首次使用报错
async function ensureCollections() {
  for (const name of ['flows', 'phones']) {
    try { await db.createCollection(name) } catch (e) { /* 已存在则忽略 */ }
  }
}

exports.main = async (event) => {
  await ensureCollections()
  const { action } = event
  switch (action) {
    case 'list': return await list(event)
    case 'summary': return await summary(event)
    case 'dashboard': return await dashboard(event)
    default: return { code: 1, message: '未知操作' }
  }
}

// 流水明细：分页 + 日期区间 + 类型筛选，带手机品牌型号
async function list(event) {
  const { _store_id, startDate = '', endDate = '', type = 0, page = 1, pageSize = 20 } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  let where = { store_id: _store_id }
  if (startDate && endDate) {
    where.date = _.gte(startDate).and(_.lte(endDate))
  }
  if (type) where.type = Number(type)

  const countRes = await db.collection('flows').where(where).count()
  const res = await db.collection('flows')
    .where(where)
    .orderBy('date', 'desc')
    .orderBy('create_time', 'desc')
    .skip((page - 1) * pageSize)
    .limit(Math.min(pageSize, 50))
    .get()

  const list = await attachPhone(res.data, _store_id)
  return { code: 0, data: { list, total: countRes.total, page, pageSize } }
}

// 收支统计：day 按日 / month 按月，返回序列 [{key, income, expense, profit}]
async function summary(event) {
  const { _store_id, startDate, endDate, granularity = 'day' } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  let where = { store_id: _store_id }
  if (startDate && endDate) {
    where.date = _.gte(startDate).and(_.lte(endDate))
  }

  // 拉区间内全部流水（单店量级，单次上限1000足够）
  const res = await db.collection('flows').where(where).limit(1000).get()

  const map = {}
  res.data.forEach(f => {
    const key = granularity === 'month' ? (f.date || '').slice(0, 7) : (f.date || '')
    if (!key) return
    if (!map[key]) map[key] = { key, income: 0, expense: 0, profit: 0 }
    const c = classify(f)
    map[key].income += c.income
    map[key].expense += c.expense
    map[key].profit += c.income - c.expense
  })

  const list = Object.values(map)
    .map(x => ({ ...x, income: Number(x.income.toFixed(2)), expense: Number(x.expense.toFixed(2)), profit: Number(x.profit.toFixed(2)) }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return { code: 0, data: { list } }
}

// 首页看板：库存数量 + 今日/本月收支利润 + 最近流水
async function dashboard(event) {
  const { _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  const today = todayStr()
  const month = today.slice(0, 7) + '-01'
  const monthStart = month

  const countByStatus = async (status) => {
    const r = await db.collection('phones').where({ status, store_id: _store_id }).count()
    return r.total
  }
  const sumRange = async (start, end) => {
    const r = await db.collection('flows')
      .where({ date: _.gte(start).and(_.lte(end)), store_id: _store_id })
      .limit(1000)
      .get()
    let income = 0, expense = 0
    r.data.forEach(f => {
      const c = classify(f)
      income += c.income
      expense += c.expense
    })
    const round2 = n => Number(n.toFixed(2))
    return { income: round2(income), expense: round2(expense), profit: round2(income - expense) }
  }

  const [inStock, sold, returned, supplier, todaySum, monthSum] = await Promise.all([
    countByStatus(0),
    countByStatus(1),
    countByStatus(2),
    countByStatus(3),
    sumRange(today, today),
    sumRange(monthStart, today)
  ])

  const recentRes = await db.collection('flows')
    .where({ store_id: _store_id })
    .orderBy('date', 'desc')
    .orderBy('create_time', 'desc')
    .limit(5)
    .get()
  const recentFlows = await attachPhone(recentRes.data, _store_id)

  return {
    code: 0,
    data: {
      counts: { in_stock: inStock, sold, returned, supplier },
      today: todaySum,
      month: monthSum,
      recentFlows
    }
  }
}

// 按流水类型归类收支：1收机=支出 2卖机=收入 3退货=冲减收入 4退上家=冲减支出
function classify(f) {
  const amount = Number(f.amount) || 0
  const type = Number(f.type)
  if (type === 2) return { income: amount, expense: 0 }
  if (type === 3) return { income: amount, expense: 0 } // 负值，冲减收入
  if (type === 1) return { income: 0, expense: -amount }
  if (type === 4) return { income: 0, expense: -amount } // 负值，冲减支出
  return amount >= 0 ? { income: amount, expense: 0 } : { income: 0, expense: -amount }
}

// 给流水附上手机品牌型号内存
async function attachPhone(flows, storeId) {
  if (flows.length === 0) return []
  const ids = [...new Set(flows.map(f => f.phone_id))]
  const phoneMap = {}
  const res = await db.collection('phones').where({ _id: _.in(ids), store_id: storeId }).limit(100).get()
  res.data.forEach(p => { phoneMap[p._id] = p })
  return flows.map(f => {
    const p = phoneMap[f.phone_id] || {}
    return {
      ...f,
      brand: p.brand || '',
      model: p.model || '',
      memory: p.memory || ''
    }
  })
}

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
