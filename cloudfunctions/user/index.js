// cloudfunctions/user/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const crypto = require('crypto')

const sha = s => crypto.createHash('sha256').update(s).digest('hex')

exports.main = async (event, context) => {
  const { action } = event
  switch (action) {
    case 'login': return await login(event)
    case 'loginOrRegister': return await loginOrRegister(event)
    case 'register': return await register(event)
    case 'addEmployee': return await addEmployee(event)
    case 'listEmployees': return await listEmployees(event)
    case 'removeEmployee': return await removeEmployee(event)
    case 'setStorePhoto': return await setStorePhoto(event)
    case 'init': return await initDB(event)
    default: return { code: 1, message: '未知操作' }
  }
}

async function ensureCollection() {
  try { await db.createCollection('users') } catch (e) { /* 已存在则忽略 */ }
}

async function login(event) {
  const { username, password } = event
  if (!username || !password) {
    return { code: 1, message: '用户名和密码不能为空' }
  }
  await ensureCollection()
  // 首次使用自动初始化默认老板（admin / 123456）
  await ensureBoss()
  // 老数据一次性迁移：无 store_id 的手机/流水归到 admin 店
  await backfillLegacy()

  const res = await db.collection('users').where({
    username,
    password: sha(password),
    is_active: 1
  }).get()

  if (res.data.length === 0) {
    return { code: 1, message: '用户名或密码错误' }
  }

  return { code: 0, data: userPayload(res.data[0]) }
}

// 登录注册一体：账号存在就登录（校验密码），不存在就自动注册成老板再登录
async function loginOrRegister(event) {
  const { username, password, storeName, nickname } = event
  if (!username || !password) {
    return { code: 1, message: '用户名和密码不能为空' }
  }
  await ensureCollection()
  await ensureBoss()
  await backfillLegacy()

  const exist = await db.collection('users').where({ username }).get()
  if (exist.data.length > 0) {
    const user = exist.data[0]
    if (user.password !== sha(password)) return { code: 1, message: '用户名或密码错误' }
    if (user.is_active !== 1) return { code: 1, message: '账号已停用' }
    return { code: 0, data: userPayload(user) }
  }

  // 新账号：自动注册为老板，店铺名默认来财
  const addRes = await db.collection('users').add({
    data: {
      username,
      password: sha(password),
      role: 'boss',
      name: nickname || '',
      store_name: storeName || '来财',
      phone: '',
      is_active: 1,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  })
  await db.collection('users').doc(addRes._id).update({
    data: { store_id: addRes._id, updated_at: db.serverDate() }
  })
  return {
    code: 0,
    data: {
      id: addRes._id,
      username,
      role: 'boss',
      name: nickname || '',
      phone: '',
      store_id: addRes._id,
      store_name: storeName || '来财'
    }
  }
}

// 拼登录返回的账号信息，老数据自动补齐 store_id（店身份=自己的 _id）和店铺名
function userPayload(user) {
  const patch = {}
  if (!user.store_id) patch.store_id = user._id
  if (!user.store_name) patch.store_name = '来财'
  if (Object.keys(patch).length) {
    patch.updated_at = db.serverDate()
    db.collection('users').doc(user._id).update({ data: patch })
  }
  return {
    id: user._id,
    username: user.username,
    role: user.role,
    name: user.name,
    phone: user.phone,
    store_id: user.store_id || user._id,
    store_name: user.store_name || '来财'
  }
}

// 老板自助注册：开店身份 = 老板自己的 _id
async function register(event) {
  const { username, password, storeName } = event
  if (!username || !password) {
    return { code: 1, message: '用户名和密码不能为空' }
  }
  await ensureCollection()
  const exist = await db.collection('users').where({ username }).count()
  if (exist.total > 0) {
    return { code: 1, message: '用户名已被注册' }
  }
  const addRes = await db.collection('users').add({
    data: {
      username,
      password: sha(password),
      role: 'boss',
      name: '',
      store_name: storeName || '来财',
      phone: '',
      is_active: 1,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  })
  await db.collection('users').doc(addRes._id).update({
    data: { store_id: addRes._id, updated_at: db.serverDate() }
  })
  return { code: 0, data: { message: '注册成功' } }
}

async function addEmployee(event) {
  const { username, password, name, _role, _store_id, _userId } = event
  if (_role !== 'boss') return { code: 1, message: '仅老板可添加员工' }
  if (!_store_id || !username || !password) {
    return { code: 1, message: '用户名、密码不能为空' }
  }
  await ensureCollection()
  const exist = await db.collection('users').where({ username }).count()
  if (exist.total > 0) {
    return { code: 1, message: '用户名已被注册' }
  }
  // 员工继承老板的店铺名（首页横幅显示用）
  let storeName = '来财'
  if (_userId) {
    const boss = await db.collection('users').doc(_userId).get()
    if (boss.data && boss.data.store_name) storeName = boss.data.store_name
  }
  await db.collection('users').add({
    data: {
      username,
      password: sha(password),
      role: 'employee',
      name: name || '',
      store_name: storeName,
      phone: '',
      store_id: _store_id,
      is_active: 1,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  })
  return { code: 0, data: { message: '已添加' } }
}

async function listEmployees(event) {
  const { _role, _store_id } = event
  if (_role !== 'boss') return { code: 1, message: '仅老板可查看员工' }
  if (!_store_id) return { code: 1, message: '参数缺失' }
  const res = await db.collection('users')
    .where({ store_id: _store_id, role: 'employee', is_active: 1 })
    .get()
  const list = res.data.map(u => ({ id: u._id, username: u.username, name: u.name }))
  return { code: 0, data: { list } }
}

async function removeEmployee(event) {
  const { id, _role, _store_id } = event
  if (_role !== 'boss') return { code: 1, message: '仅老板可移除员工' }
  if (!_store_id || !id) return { code: 1, message: '参数缺失' }
  const target = await db.collection('users').doc(id).get()
  if (!target.data || target.data.store_id !== _store_id) {
    return { code: 1, message: '无权操作' }
  }
  await db.collection('users').doc(id).remove()
  return { code: 0, data: { message: '已移除' } }
}

// 设置店铺门头照（仅老板）：fileID 存本店老板文档，替换时删旧图，防云存储堆积
async function setStorePhoto(event) {
  const { fileID, _role, _store_id } = event
  if (_role !== 'boss') return { code: 1, message: '仅老板可设置' }
  if (!_store_id || !fileID) return { code: 1, message: '参数缺失' }
  const doc = await db.collection('users').doc(_store_id).get()
  if (!doc.data) return { code: 1, message: '店铺不存在' }
  const old = doc.data.store_photo
  await db.collection('users').doc(_store_id).update({
    data: { store_photo: fileID, updated_at: db.serverDate() }
  })
  if (old && old !== fileID) {
    try { await cloud.deleteFile({ fileList: [old] }) } catch (e) { /* 旧图删除失败不影响 */ }
  }
  return { code: 0, data: { message: '已保存' } }
}

// 老数据一次性迁移：早期没有 store_id 的手机/流水归到 admin 店
async function backfillLegacy() {
  try {
    const admin = await db.collection('users').where({ username: 'admin' }).get()
    if (admin.data.length === 0) return
    const sid = admin.data[0].store_id
    if (!sid) return
    await db.collection('phones').where({ store_id: _.exists(false) }).update({ data: { store_id: sid } })
    await db.collection('flows').where({ store_id: _.exists(false) }).update({ data: { store_id: sid } })
  } catch (e) {
    // 集合不存在等情况忽略
  }
}

async function ensureBoss() {
  const existing = await db.collection('users').where({ username: 'admin' }).get()
  if (existing.data.length === 0) {
    const addRes = await db.collection('users').add({
      data: {
        username: 'admin',
        password: sha('123456'),
        role: 'boss',
        name: '管理员',
        store_name: '来财',
        phone: '',
        is_active: 1,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })
    await db.collection('users').doc(addRes._id).update({
      data: { store_id: addRes._id, updated_at: db.serverDate() }
    })
  }
}

async function initDB(event) {
  await ensureCollection()
  await ensureBoss()
  return { code: 0, data: { message: '初始化完成' } }
}
