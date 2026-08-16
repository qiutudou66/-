App({
  globalData: {
    userInfo: null,
    role: null,
    // TODO: 开通云开发后，改成你自己的环境 ID（云开发控制台首页可见）
    cloudEnv: 'cloud1-d7ghm2o53bf3302e5'
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: this.globalData.cloudEnv,
      traceUser: true
    })
    // 检查登录状态
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.role = userInfo.role
    }
  }
})
