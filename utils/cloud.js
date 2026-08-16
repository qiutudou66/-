// utils/cloud.js - 云函数调用封装

/**
 * 调用云函数
 * @param {string} name - 云函数名
 * @param {object} data - 参数
 */
function call(name, data = {}) {
  return new Promise((resolve, reject) => {
    // 自动附带当前登录身份（店隔离 / 角色判断用）
    const user = wx.getStorageSync('userInfo')
    const auth = user ? { _userId: user.id, _role: user.role, _store_id: user.store_id } : {}
    wx.cloud.callFunction({
      name,
      data: { ...data, ...auth },
      success: res => {
        if (res.result && res.result.code === 0) {
          resolve(res.result.data)
        } else {
          const msg = (res.result && res.result.message) || '请求失败'
          wx.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
        }
      },
      fail: err => {
        wx.showToast({ title: '网络错误', icon: 'none' })
        reject(err)
      }
    })
  })
}

/**
 * 获取云数据库实例
 */
function db() {
  return wx.cloud.database()
}

module.exports = { call, db }
