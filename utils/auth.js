// utils/auth.js - 认证工具

function checkLogin() {
  const userInfo = wx.getStorageSync('userInfo')
  if (!userInfo) {
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

function getUserInfo() {
  return wx.getStorageSync('userInfo')
}

function setUserInfo(info) {
  wx.setStorageSync('userInfo', info)
}

function clearUserInfo() {
  wx.removeStorageSync('userInfo')
}

function hasRole(roles) {
  const user = getUserInfo()
  if (!user) return false
  if (!roles || roles.length === 0) return true
  return roles.includes(user.role)
}

module.exports = {
  checkLogin,
  getUserInfo,
  setUserInfo,
  clearUserInfo,
  hasRole
}
