// pages/return/return.js - 退货入库登记
const { call } = require('../../utils/cloud')
const { checkLogin } = require('../../utils/auth')
const { formatMoney, todayStr } = require('../../utils/format')

Page({
  data: {
    id: '',
    phone: null,
    sellText: '0.00',
    refundPrice: '',
    resellPrice: '',
    date: '',
    returnerName: '',
    returnerPhone: '',
    remark: '',
    submitting: false,
    result: null
  },

  onLoad(options) {
    if (!checkLogin()) return
    this.setData({ id: options.id, date: todayStr() })
    this.load()
  },

  async load() {
    try {
      const data = await call('phone', { action: 'get', id: this.data.id })
      const phone = data.phone
      this.setData({
        phone,
        sellText: formatMoney(phone.sell_price),
        refundPrice: phone.sell_price != null ? String(phone.sell_price) : '',
        resellPrice: phone.expect_price != null ? String(phone.expect_price) : ''
      })
    } catch (err) {
      console.error(err)
    }
  },

  onDate(e) {
    this.setData({ date: e.detail.value })
  },
  onRefund(e) {
    this.setData({ refundPrice: e.detail.value })
  },
  onResell(e) {
    this.setData({ resellPrice: e.detail.value })
  },
  onName(e) {
    this.setData({ returnerName: e.detail.value })
  },
  onPhone(e) {
    this.setData({ returnerPhone: e.detail.value })
  },
  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  async onSubmit() {
    const { id, refundPrice, resellPrice, date, returnerName, returnerPhone, remark, submitting } = this.data
    const refund = Number(refundPrice)
    if (refund == null || isNaN(refund) || refund < 0) {
      wx.showToast({ title: '请输入正确的退货金额', icon: 'none' })
      return
    }
    if (!date) {
      wx.showToast({ title: '请选择退货日期', icon: 'none' })
      return
    }
    if (submitting) return
    this.setData({ submitting: true })

    try {
      const res = await call('phone', {
        action: 'customerReturn',
        id,
        refundPrice: refund,
        resellPrice: Number(resellPrice) || '',
        date,
        returnerName: returnerName.trim(),
        returnerPhone: returnerPhone.trim(),
        remark: remark.trim()
      })
      this.setData({ result: { refund: formatMoney(res.refund) } })
      wx.showToast({ title: '退货成功', icon: 'success' })
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})
