// pages/index/index.js - 首页看板
const { call } = require('../../utils/cloud')
const { checkLogin, getUserInfo } = require('../../utils/auth')
const { formatMoney } = require('../../utils/format')

const TYPE_TEXT = { 1: '收机', 2: '卖机', 3: '退货', 4: '退上家' }

Page({
  data: {
    storeName: '来财',
    dateText: '',
    counts: { in_stock: 0, sold: 0, returned: 0, supplier: 0 },
    today: { income: '0.00', expense: '0.00', profit: '0.00' },
    month: { income: '0.00', expense: '0.00', profit: '0.00' },
    recentFlows: []
  },

  onLoad() {
    if (!checkLogin()) return
    const now = new Date()
    const user = getUserInfo()
    this.setData({
      dateText: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
      storeName: (user && user.store_name) || '来财'
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
          expense: formatMoney(d.today.expense),
          profit: formatMoney(d.today.profit)
        },
        month: {
          income: formatMoney(d.month.income),
          expense: formatMoney(d.month.expense),
          profit: formatMoney(d.month.profit)
        },
        recentFlows
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
  }
})
