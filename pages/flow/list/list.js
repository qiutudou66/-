// pages/flow/list/list.js - 流水/收支统计
const { call } = require('../../../utils/cloud')
const { checkLogin } = require('../../../utils/auth')
const { formatMoney } = require('../../../utils/format')

const TYPE_TEXT = { 1: '收机', 2: '卖机', 3: '退货入库' }
const TYPES = [
  { key: 0, text: '全部' },
  { key: 1, text: '收机' },
  { key: 2, text: '卖机' },
  { key: 3, text: '退货入库' }
]

Page({
  data: {
    view: 'day',
    date: '',
    month: '',
    types: TYPES,
    activeType: 0,
    summary: { income: '0.00', expense: '0.00', profit: '0.00' },
    list: [],
    total: 0,
    page: 1,
    hasMore: true
  },

  onLoad() {
    if (!checkLogin()) return
    const now = new Date()
    const d = pad(now.getFullYear()) + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    const m = pad(now.getFullYear()) + '-' + pad(now.getMonth() + 1)
    this.setData({ date: d, month: m })
  },

  onShow() {
    if (!checkLogin()) return
    this.reload()
  },

  onViewDay() { this.setData({ view: 'day' }); this.reload() },
  onViewMonth() { this.setData({ view: 'month' }); this.reload() },

  onDateChange(e) { this.setData({ date: e.detail.value }); this.reload() },
  onMonthChange(e) { this.setData({ month: e.detail.value }); this.reload() },
  onTypeTap(e) { this.setData({ activeType: e.currentTarget.dataset.key }); this.reload() },

  reload() {
    this.setData({ page: 1, list: [], hasMore: true })
    return this.load()
  },

  async load() {
    const { view, date, month, activeType } = this.data
    let start, end
    if (view === 'day') {
      start = end = date
    } else {
      start = month + '-01'
      end = monthEnd(month)
    }

    wx.showLoading({ title: '加载中...' })
    try {
      const s = await call('flow', { action: 'summary', startDate: start, endDate: end, granularity: 'day' })
      let income = 0, expense = 0, profit = 0
      ;(s.list || []).forEach(x => {
        income += x.income
        expense += x.expense
        profit += x.profit
      })
      this.setData({
        summary: { income: formatMoney(income), expense: formatMoney(expense), profit: formatMoney(profit) }
      })

      const data = await call('flow', {
        action: 'list',
        startDate: start,
        endDate: end,
        type: activeType,
        page: this.data.page,
        pageSize: 20
      })
      const list = data.list.map(f => ({
        ...f,
        typeText: TYPE_TEXT[f.type] || '',
        amountText: (f.amount >= 0 ? '+' : '') + formatMoney(f.amount),
        amountClass: f.amount >= 0 ? 'income' : 'expense'
      }))
      this.setData({
        list: this.data.page === 1 ? list : this.data.list.concat(list),
        total: data.total,
        hasMore: this.data.page * 20 < data.total
      })
    } catch (err) {
      console.error(err)
    } finally {
      wx.hideLoading()
    }
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    this.setData({ page: this.data.page + 1 })
    this.load()
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.phoneId })
  }
})

function pad(n) { return String(n).padStart(2, '0') }

function monthEnd(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return month + '-' + pad(last)
}
