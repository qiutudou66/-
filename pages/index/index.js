// pages/index/index.js - 首页看板
const { call } = require('../../utils/cloud')
const { checkLogin, getUserInfo } = require('../../utils/auth')
const { formatMoney } = require('../../utils/format')
const { compressImage } = require('../../utils/image')

const TYPE_TEXT = { 1: '收机', 2: '卖机', 3: '退货入库' }

Page({
  data: {
    storeName: '来财',
    storePhoto: '',
    isBoss: false,
    uploadingPhoto: false,
    counts: { in_stock: 0, sold: 0, returned: 0 },
    today: { income: '0.00', profit: '0.00' },
    month: { income: '0.00', profit: '0.00' },
    recentFlows: []
  },

  onLoad() {
    if (!checkLogin()) return
    const user = getUserInfo()
    this.setData({
      storeName: (user && user.store_name) || '来财',
      isBoss: (user && user.role) === 'boss'
    })
  },

  onShow() {
    if (!checkLogin()) return
    this.load()
  },

  async load() {
    try {
      const d = await call('flow', { action: 'dashboard' })
      const recentFlows = (d.recentFlows || []).map(f => ({
        ...f,
        typeText: TYPE_TEXT[f.type] || '',
        amountText: (f.amount >= 0 ? '+' : '') + formatMoney(f.amount),
        amountClass: f.amount >= 0 ? 'income' : 'expense'
      }))
      this.setData({
        counts: d.counts,
        today: {
          income: formatMoney(d.today.income),
          profit: formatMoney(d.today.profit)
        },
        month: {
          income: formatMoney(d.month.income),
          profit: formatMoney(d.month.profit)
        },
        recentFlows,
        storePhoto: d.store_photo || ''
      })
    } catch (err) {
      console.error('dashboard error', err)
    }
  },

  goRecycle() {
    wx.navigateTo({ url: '/pages/recycle/create/create' })
  },
  goStock() {
    wx.switchTab({ url: '/pages/stock/list/list' })
  },
  goFlows() {
    wx.switchTab({ url: '/pages/flow/list/list' })
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  // 点横幅设置/更换门头照（仅老板）
  onBannerTap() {
    if (!this.data.isBoss) {
      wx.showToast({ title: '仅老板可设置门头照', icon: 'none' })
      return
    }
    if (this.data.uploadingPhoto) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        this.setData({ uploadingPhoto: true })
        wx.showLoading({ title: '上传门头照...' })
        try {
          const filePath = await compressImage(res.tempFiles[0].tempFilePath)
          const user = getUserInfo()
          const up = await wx.cloud.uploadFile({
            cloudPath: `storefront/${user.store_id || 'default'}/${Date.now()}.jpg`,
            filePath
          })
          await call('user', { action: 'setStorePhoto', fileID: up.fileID })
          wx.showToast({ title: '已设置', icon: 'success' })
          this.load()
        } catch (err) {
          console.error(err)
          wx.showToast({ title: '设置失败', icon: 'none' })
        } finally {
          wx.hideLoading()
          this.setData({ uploadingPhoto: false })
        }
      }
    })
  }
})
