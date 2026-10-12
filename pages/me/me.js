// pages/me/me.js - 我的（账号信息 + 员工管理）
const { call } = require('../../utils/cloud')
const { checkLogin, getUserInfo, clearUserInfo } = require('../../utils/auth')

Page({
  data: {
    user: null,
    avatar: '',
    isBoss: false,
    employees: [],
    showAdd: false,
    empUsername: '',
    empPassword: '',
    empName: '',
    adding: false
  },

  onShow() {
    if (!checkLogin()) return
    const user = getUserInfo()
    this.setData({ user, avatar: (user.name || user.username).charAt(0), isBoss: user.role === 'boss' })
    if (user.role === 'boss') this.loadEmployees()
  },

  async loadEmployees() {
    try {
      const data = await call('user', { action: 'listEmployees' })
      this.setData({ employees: data.list || [] })
    } catch (err) {
      console.error(err)
    }
  },

  toggleAdd() {
    this.setData({ showAdd: !this.data.showAdd })
  },
  onEmpUsername(e) { this.setData({ empUsername: e.detail.value }) },
  onEmpPassword(e) { this.setData({ empPassword: e.detail.value }) },
  onEmpName(e) { this.setData({ empName: e.detail.value }) },

  async onAddEmployee() {
    const { empUsername, empPassword, empName, adding } = this.data
    if (!empUsername || !empPassword) {
      wx.showToast({ title: '请输入员工账号和密码', icon: 'none' })
      return
    }
    if (empPassword.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    if (adding) return
    this.setData({ adding: true })
    try {
      await call('user', {
        action: 'addEmployee',
        username: empUsername,
        password: empPassword,
        name: empName.trim()
      })
      wx.showToast({ title: '已添加', icon: 'success' })
      this.setData({ empUsername: '', empPassword: '', empName: '', showAdd: false })
      this.loadEmployees()
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ adding: false })
    }
  },

  onRemoveEmployee(e) {
    const { id, username } = e.currentTarget.dataset
    wx.showModal({
      title: '移除员工',
      content: `确认移除账号 ${username}？移除后无法登录。`,
      success: async res => {
        if (!res.confirm) return
        try {
          await call('user', { action: 'removeEmployee', id })
          wx.showToast({ title: '已移除', icon: 'success' })
          this.loadEmployees()
        } catch (err) { console.error(err) }
      }
    })
  },

  onGoImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  onLogout() {
    clearUserInfo()
    wx.reLaunch({ url: '/pages/login/login' })
  }
})
