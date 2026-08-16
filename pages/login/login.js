// pages/login/login.js
const { call } = require('../../utils/cloud')
const { setUserInfo } = require('../../utils/auth')

Page({
  data: {
    username: '',
    password: '',
    storeName: '',
    nickname: '',
    loading: false
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onStoreNameInput(e) {
    this.setData({ storeName: e.detail.value })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  async onLogin() {
    const { username, password, storeName, nickname } = this.data
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' })
      return
    }

    // 登录注册一体：账号存在就登录，不存在自动注册成老板再登录（店铺名默认来财）
    // 密码由云端 sha256 加密存储（云函数内完成，小程序无需 npm 依赖）
    this.setData({ loading: true })
    try {
      const data = await call('user', {
        action: 'loginOrRegister',
        username,
        password,
        storeName,
        nickname
      })
      setUserInfo(data)
      wx.switchTab({ url: '/pages/index/index' })
    } catch (err) {
      console.error('login error', err)
    } finally {
      this.setData({ loading: false })
    }
  }
})
