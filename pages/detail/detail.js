// pages/detail/detail.js - 手机详情
const { call } = require('../../utils/cloud')
const { checkLogin, getUserInfo } = require('../../utils/auth')
const { formatMoney } = require('../../utils/format')

const GRADES = ['', '99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']
const STATUS_MAP = { 0: { text: '在库', cls: 'tag-green' }, 1: { text: '已售', cls: 'tag-blue' }, 2: { text: '退货', cls: 'tag-orange' }, 3: { text: '退上家', cls: 'tag-gray' } }
const TYPE_TEXT = { 1: '收机', 2: '卖机', 3: '退货', 4: '退上家' }

Page({
  data: {
    id: '',
    phone: null,
    flows: [],
    saleable: false,
    sold: false,
    inStock: false,
    isBoss: false
  },

  onLoad(options) {
    if (!checkLogin()) return
    this.setData({ id: options.id })
  },

  onShow() {
    if (!checkLogin()) return
    this.load()
  },

  async load() {
    try {
      const data = await call('phone', { action: 'get', id: this.data.id })
      const phone = data.phone
      const st = STATUS_MAP[phone.status] || { text: '', cls: '' }
      const flows = data.flows.map(f => ({
        ...f,
        typeText: TYPE_TEXT[f.type] || '',
        amountText: (f.amount >= 0 ? '+' : '') + formatMoney(f.amount),
        amountClass: f.amount >= 0 ? 'income' : 'expense'
      }))
      this.setData({
        phone: {
          ...phone,
          statusText: st.text,
          statusClass: st.cls,
          gradeText: GRADES[phone.grade] || '',
          costText: formatMoney(phone.cost_price),
          expectText: phone.expect_price != null ? formatMoney(phone.expect_price) : '',
          sellText: phone.sell_price != null ? formatMoney(phone.sell_price) : '',
          refundText: phone.refund_price != null ? formatMoney(phone.refund_price) : ''
        },
        flows,
        saleable: phone.status === 0 || phone.status === 2,
        sold: phone.status === 1,
        inStock: phone.status === 0,
        isBoss: (getUserInfo() || {}).role === 'boss'
      })
    } catch (err) {
      console.error(err)
    }
  },

  goSell() {
    wx.navigateTo({ url: '/pages/sell/sell?id=' + this.data.id })
  },
  onReturn() {
    wx.navigateTo({ url: '/pages/return/return?id=' + this.data.id })
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    const urls = (this.data.phone && this.data.phone.images) || []
    wx.previewImage({ urls, current: src })
  },

  onReturnSupplier() {
    wx.showModal({
      title: '退给上家',
      content: '确认把该手机退给上家？将冲销成本支出。',
      success: async res => {
        if (!res.confirm) return
        try {
          await call('phone', { action: 'returnSupplier', id: this.data.id })
          wx.showToast({ title: '已退上家', icon: 'success' })
          this.load()
        } catch (err) { console.error(err) }
      }
    })
  }
})
