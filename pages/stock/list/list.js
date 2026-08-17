// pages/stock/list/list.js - 库存列表
const { call } = require('../../../utils/cloud')
const { checkLogin } = require('../../../utils/auth')
const { formatMoney } = require('../../../utils/format')

const STATUS = [
  { key: -1, text: '全部' },
  { key: 0, text: '在库' },
  { key: 1, text: '已售' },
  { key: 2, text: '退货' },
  { key: 3, text: '退货入库' }
]
const STATUS_MAP = { 0: { text: '在库', cls: 'tag-green' }, 1: { text: '已售', cls: 'tag-blue' }, 2: { text: '退货', cls: 'tag-orange' }, 3: { text: '退货入库', cls: 'tag-gray' } }
const BRANDS = ['全部', '苹果', '华为', '小米', 'OPPO', 'vivo', '荣耀', '三星', '一加', '其他']
const MEMORIES = ['全部', '64G', '128G', '256G', '512G', '1T']
const GRADES = ['全部', '99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']

Page({
  data: {
    statusTabs: STATUS,
    activeStatus: -1,
    keyword: '',
    brands: BRANDS,
    brandIndex: 0,
    memories: MEMORIES,
    memoryIndex: 0,
    grades: GRADES,
    gradeIndex: 0,
    list: [],
    total: 0,
    page: 1,
    hasMore: true
  },

  onLoad() {
    if (!checkLogin()) return
  },

  onShow() {
    if (!checkLogin()) return
    this.reload()
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh())
  },

  reload() {
    this.setData({ page: 1, list: [], hasMore: true })
    return this.loadList()
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value })
  },
  doSearch() {
    this.reload()
  },

  onStatusTap(e) {
    this.setData({ activeStatus: e.currentTarget.dataset.key })
    this.reload()
  },
  onBrandChange(e) {
    this.setData({ brandIndex: Number(e.detail.value) })
    this.reload()
  },
  onMemoryChange(e) {
    this.setData({ memoryIndex: Number(e.detail.value) })
    this.reload()
  },
  onGradeChange(e) {
    this.setData({ gradeIndex: Number(e.detail.value) })
    this.reload()
  },

  async loadList() {
    const { activeStatus, keyword, brands, brandIndex, memories, memoryIndex, grades, gradeIndex, page } = this.data
    wx.showLoading({ title: '加载中...' })
    try {
      const data = await call('phone', {
        action: 'list',
        status: activeStatus,
        keyword,
        brand: brandIndex > 0 ? brands[brandIndex] : '',
        memory: memoryIndex > 0 ? memories[memoryIndex] : '',
        grade: gradeIndex > 0 ? gradeIndex : 0,
        page,
        pageSize: 20
      })
      const list = data.list.map(p => {
        const st = STATUS_MAP[p.status] || { text: '', cls: '' }
        return {
          ...p,
          statusText: st.text,
          statusClass: st.cls,
          gradeText: GRADES[p.grade] || '',
          expectText: p.expect_price != null ? formatMoney(p.expect_price) : ''
        }
      })
      this.setData({
        list: page === 1 ? list : this.data.list.concat(list),
        total: data.total,
        hasMore: page * 20 < data.total
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
    this.loadList()
  },

  goRecycle() {
    wx.navigateTo({ url: '/pages/recycle/create/create' })
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },
  onReturn(e) {
    wx.navigateTo({ url: '/pages/return/return?id=' + e.currentTarget.dataset.id })
  }
})
