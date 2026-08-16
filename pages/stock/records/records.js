const { call } = require('../../../utils/cloud')

Page({
  data: { productId: '', productName: '', list: [], typeMap: { in: '入库', out: '出库', adjust_in: '调整入', adjust_out: '调整出', transfer: '调拨' } },

  onLoad(options) {
    this.setData({ productId: options.productId, productName: options.productName || '' })
    this.loadRecords()
  },

  async loadRecords() {
    try {
      const data = await call('stock', { action: 'history', productId: this.data.productId })
      this.setData({ list: data.list })
    } catch (err) { console.error(err) }
  }
})
