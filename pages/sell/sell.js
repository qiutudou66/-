// pages/sell/sell.js - 卖出确认
const { call } = require('../../utils/cloud')
const { checkLogin } = require('../../utils/auth')
const { formatMoney } = require('../../utils/format')
const { todayStr } = require('../../utils/format')

Page({
  data: {
    id: '',
    phone: null,
    sellPrice: '',
    remark: '',
    costText: '0.00',
    result: null,
    submitting: false
  },

  onLoad(options) {
    if (!checkLogin()) return
    this.setData({ id: options.id })
    this.load()
  },

  async load() {
    try {
      const data = await call('phone', { action: 'get', id: this.data.id })
      const phone = data.phone
      this.setData({
        phone,
        costText: formatMoney(phone.cost_price),
        sellPrice: phone.expect_price != null ? String(phone.expect_price) : ''
      })
    } catch (err) {
      console.error(err)
    }
  },

  onPrice(e) {
    this.setData({ sellPrice: e.detail.value })
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  async onSell() {
    const { id, sellPrice, costText } = this.data
    const price = Number(sellPrice)
    if (!price || price <= 0) {
      wx.showToast({ title: '请输入正确的成交价', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      const res = await call('phone', {
        action: 'sell',
        id,
        sellPrice: price,
        date: todayStr(),
        remark: this.data.remark.trim()
      })
      this.setData({
        result: {
          profit: formatMoney(res.profit),
          sellPrice: formatMoney(res.sellPrice),
          costPrice: res.costText != null ? formatMoney(res.costPrice) : costText
        }
      })
      wx.showToast({ title: '卖出成功', icon: 'success' })
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  },

  goDetail() {
    wx.navigateBack()
  }
})
