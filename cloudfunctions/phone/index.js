// cloudfunctions/phone - 二手手机管理（收机/卖机/退货/列表）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 状态：0在库 1已售 2销售退货(可再售) 3退给上家
const SALEABLE = [0, 2]

// 集合不存在时自动创建，避免首次使用报错
async function ensureCollections() {
  for (const name of ['phones', 'flows']) {
    try { await db.createCollection(name) } catch (e) { /* 已存在则忽略 */ }
  }
}

exports.main = async (event) => {
  await ensureCollections()
  const { action } = event
  switch (action) {
    case 'list': return await list(event)
    case 'get': return await get(event)
    case 'create': return await create(event)
    case 'update': return await update(event)
    case 'remove': return await remove(event)
    case 'sell': return await sell(event)
    case 'customerReturn': return await customerReturn(event)
    case 'returnSupplier': return await returnSupplier(event)
    default: return { code: 1, message: '未知操作' }
  }
}

// 列表：分页 + 筛选(status/brand/model/memory/grade) + 关键词(imei/model)
async function list(event) {
  const { _store_id, status = -1, brand = '', model = '', memory = '', grade = 0, keyword = '', page = 1, pageSize = 20 } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  let where = { store_id: _store_id }
  if (status !== -1) where.status = Number(status)
  if (brand) where.brand = brand
  if (model) where.model = model
  if (memory) where.memory = memory
  if (grade) where.grade = Number(grade)
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
    where = _.and([where, _.or([{ imei: reg }, { model: reg }, { brand: reg }])])
  }

  const countRes = await db.collection('phones').where(where).count()
  const total = countRes.total

  const res = await db.collection('phones')
    .where(where)
    .orderBy('recycle_date', 'desc')
    .orderBy('create_time', 'desc')
    .skip((page - 1) * pageSize)
    .limit(Math.min(pageSize, 50))
    .get()

  return { code: 0, data: { list: res.data, total, page, pageSize } }
}

// 详情 + 该机全部流水时间线
async function get(event) {
  const { id, _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  const phoneRes = await db.collection('phones').where({ _id: id, store_id: _store_id }).get()
  if (phoneRes.data.length === 0) return { code: 1, message: '手机不存在' }
  const phone = phoneRes.data[0]
  const flowsRes = await db.collection('flows')
    .where({ phone_id: id })
    .orderBy('create_time', 'asc')
    .limit(100)
    .get()
  return { code: 0, data: { phone, flows: flowsRes.data } }
}

// 收机：IMEI 查重 + 建机 + 支出流水
async function create(event) {
  const { _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  const d = event.data || {}
  if (!d.imei || !d.brand || !d.model || !d.memory || !d.cost_price) {
    return { code: 1, message: 'IMEI、品牌、型号、容量、成本价必填' }
  }

  const dup = await db.collection('phones').where({ imei: d.imei, store_id: _store_id }).count()
  if (dup.total > 0) {
    return { code: 1, message: '该 IMEI 已录入过' }
  }

  const now = db.serverDate()
  const recycleDate = d.recycle_date || todayStr()
  const costPrice = Number(d.cost_price) || 0

  const addRes = await db.collection('phones').add({
    data: {
      store_id: _store_id,
      imei: d.imei,
      brand: d.brand,
      model: d.model,
      memory: d.memory,
      battery: d.battery || '',
      color: d.color || '',
      grade: Number(d.grade) || 1,
      cost_price: costPrice,
      expect_price: d.expect_price ? Number(d.expect_price) : null,
      sell_price: null,
      status: 0,
      recycle_date: recycleDate,
      sell_date: null,
      detail: d.detail || '',
      images: Array.isArray(d.images) ? d.images : [],
      seller_name: d.seller_name || '',
      seller_id: d.seller_id || '',
      seller_phone: d.seller_phone || '',
      remark: d.remark || '',
      created_at: now,
      updated_at: now
    }
  })

  await db.collection('flows').add({
    data: {
      store_id: _store_id,
      phone_id: addRes._id,
      type: 1,
      amount: -costPrice,
      date: recycleDate,
      remark: d.remark ? `收机：${d.remark}` : '',
      created_at: now
    }
  })

  return { code: 0, data: { id: addRes._id } }
}

// 改机属性（仅限在库/退货可编辑，IMEI 不可改；成本价变了同步收机流水金额，保证利润对得上）
async function update(event) {
  const { id, data, _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (!id || !data) return { code: 1, message: '参数缺失' }

  const result = await db.runTransaction(async transaction => {
    const phoneRes = await transaction.collection('phones').doc(id).get()
    const phone = phoneRes.data
    if (!phone || phone.store_id !== _store_id) return { ok: false, message: '无权操作' }
    if (!SALEABLE.includes(phone.status)) return { ok: false, message: '仅在库/退货机可编辑' }

    const costPrice = Number(data.cost_price) || 0
    await transaction.collection('phones').doc(id).update({
      data: {
        brand: data.brand,
        model: data.model,
        memory: data.memory,
        battery: data.battery || '',
        color: data.color || '',
        grade: Number(data.grade) || 1,
        cost_price: costPrice,
        expect_price: data.expect_price ? Number(data.expect_price) : null,
        recycle_date: data.recycle_date || phone.recycle_date,
        detail: data.detail || '',
        images: Array.isArray(data.images) ? data.images : [],
        seller_name: data.seller_name || '',
        seller_id: data.seller_id || '',
        seller_phone: data.seller_phone || '',
        remark: data.remark || '',
        updated_at: db.serverDate()
      }
    })
    if (costPrice !== Number(phone.cost_price)) {
      await transaction.collection('flows').where({ phone_id: id, type: 1 }).update({
        data: { amount: -costPrice }
      })
    }
    return { ok: true }
  })

  if (!result.ok) return { code: 1, message: result.message }
  return { code: 0, data: { message: '已保存' } }
}

// 删除入库（仅老板 + 仅在库）：删手机 + 删该机收机流水，流水净额不变
async function remove(event) {
  const { id, _store_id, _role } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (_role !== 'boss') return { code: 1, message: '仅老板可删除' }
  if (!id) return { code: 1, message: '参数缺失' }

  const result = await db.runTransaction(async transaction => {
    const phoneRes = await transaction.collection('phones').doc(id).get()
    const phone = phoneRes.data
    if (!phone || phone.store_id !== _store_id) return { ok: false, message: '无权操作' }
    if (phone.status !== 0) return { ok: false, message: '仅在库手机可删除' }
    await transaction.collection('phones').doc(id).remove()
    await transaction.collection('flows').where({ phone_id: id }).remove()
    return { ok: true }
  })

  if (!result.ok) return { code: 1, message: result.message }
  return { code: 0, data: { message: '已删除' } }
}

// 卖机：事务内改状态 + 记收入流水
async function sell(event) {
  const { id, sellPrice, date, remark, _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (!id || sellPrice == null) return { code: 1, message: '参数缺失' }
  const price = Number(sellPrice)
  const bizDate = date || todayStr()

  const result = await db.runTransaction(async transaction => {
    const phoneRes = await transaction.collection('phones').doc(id).get()
    const phone = phoneRes.data
    if (!phone || phone.store_id !== _store_id) {
      return { ok: false, message: '无权操作' }
    }
    if (!SALEABLE.includes(phone.status)) {
      return { ok: false, message: '该机不在可售状态' }
    }
    await transaction.collection('phones').doc(id).update({
      data: {
        status: 1,
        sell_price: price,
        sell_date: bizDate,
        updated_at: db.serverDate()
      }
    })
    await transaction.collection('flows').add({
      data: {
        store_id: _store_id,
        phone_id: id,
        type: 2,
        amount: price,
        date: bizDate,
        remark: remark || '',
        created_at: db.serverDate()
      }
    })
    return { ok: true, profit: Number((price - phone.cost_price).toFixed(2)), costPrice: phone.cost_price, sellPrice: price }
  })

  if (!result.ok) return { code: 1, message: result.message }
  return { code: 0, data: result }
}

// 销售退货：已售机退回，状态回可售(自动补库存)，记退货人/金额/日期，冲减营收
async function customerReturn(event) {
  const { id, refundPrice, date, returnerName, returnerPhone, remark, _store_id } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (!id) return { code: 1, message: '参数缺失' }
  const bizDate = date || todayStr()

  const result = await db.runTransaction(async transaction => {
    const phoneRes = await transaction.collection('phones').doc(id).get()
    const phone = phoneRes.data
    if (!phone || phone.store_id !== _store_id) {
      return { ok: false, message: '无权操作' }
    }
    if (phone.status !== 1) {
      return { ok: false, message: '仅已售手机可退货' }
    }
    // 未填退货金额则默认退全额成交价
    const refund = Number(refundPrice) || Number(phone.sell_price || 0)
    await transaction.collection('phones').doc(id).update({
      data: {
        status: 2,
        return_date: bizDate,
        return_person: returnerName || '',
        return_phone: returnerPhone || '',
        refund_price: refund,
        updated_at: db.serverDate()
      }
    })
    const suffix = returnerName ? `（退货人：${returnerName}${returnerPhone ? ' ' + returnerPhone : ''}）` : ''
    await transaction.collection('flows').add({
      data: {
        store_id: _store_id,
        phone_id: id,
        type: 3,
        amount: -refund,
        date: bizDate,
        remark: (remark || '') + suffix,
        created_at: db.serverDate()
      }
    })
    return { ok: true, refund }
  })

  if (!result.ok) return { code: 1, message: result.message }
  return { code: 0, data: result }
}

// 退给上家：在库机退还给收来的卖家，冲销成本（仅老板可操作）
async function returnSupplier(event) {
  const { id, date, remark, _store_id, _role } = event
  if (!_store_id) return { code: 1, message: '未登录' }
  if (_role !== 'boss') return { code: 1, message: '仅老板可退给上家' }
  if (!id) return { code: 1, message: '参数缺失' }
  const bizDate = date || todayStr()

  const result = await db.runTransaction(async transaction => {
    const phoneRes = await transaction.collection('phones').doc(id).get()
    const phone = phoneRes.data
    if (!phone || phone.store_id !== _store_id) {
      return { ok: false, message: '无权操作' }
    }
    if (phone.status !== 0) {
      return { ok: false, message: '仅在库手机可退货入库' }
    }
    const cost = Number(phone.cost_price || 0)
    await transaction.collection('phones').doc(id).update({
      data: { status: 3, updated_at: db.serverDate() }
    })
    await transaction.collection('flows').add({
      data: {
        store_id: _store_id,
        phone_id: id,
        type: 4,
        amount: cost,
        date: bizDate,
        remark: remark || '',
        created_at: db.serverDate()
      }
    })
    return { ok: true, cost }
  })

  if (!result.ok) return { code: 1, message: result.message }
  return { code: 0, data: result }
}

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
