// pages/import/import.js - 批量导入（仅老板）：选文件 → 解析预览 → 确认写入
const { call } = require('../../utils/cloud')
const { checkLogin } = require('../../utils/auth')

Page({
  data: {
    state: 'idle', // idle | uploading | parsing | preview | importing | result
    fileName: '',
    filePath: '',
    fileID: '',
    summary: null,
    rows: [],
    truncated: false,
    result: null
  },

  onLoad() {
    checkLogin()
  },

  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls'],
      success: res => {
        const f = res.tempFiles[0]
        if (!f) return
        if (f.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '文件不能超过 10MB', icon: 'none' })
          return
        }
        this.setData({ fileName: f.name, filePath: f.path, fileID: '', summary: null, rows: [], result: null })
      }
    })
  },

  async onUpload() {
    const { filePath, state } = this.data
    if (!filePath || state !== 'idle') return
    this.setData({ state: 'uploading' })
    wx.showLoading({ title: '上传中...', mask: true })
    let up
    try {
      const cloudPath = `import/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`
      up = await wx.cloud.uploadFile({ cloudPath, filePath })
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
      this.setData({ state: 'idle' })
      return
    }
    this.setData({ fileID: up.fileID, state: 'parsing' })
    wx.showLoading({ title: '解析中...', mask: true })
    try {
      const data = await call('import', { action: 'parse', fileID: up.fileID })
      this.setData({ summary: data.summary, rows: data.rows, truncated: data.truncated, state: 'preview' })
      wx.hideLoading()
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      this.setData({ state: 'idle' })
    }
  },

  async onConfirm() {
    const { fileID, state, summary } = this.data
    if (!fileID || state !== 'preview' || !summary || summary.ready <= 0) return
    this.setData({ state: 'importing' })
    wx.showLoading({ title: '导入中，请勿关闭', mask: true })
    try {
      const data = await call('import', { action: 'import', fileID })
      this.setData({ result: data, state: 'result' })
      wx.hideLoading()
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      this.setData({ state: 'preview' })
    }
  },

  onReset() {
    this.setData({ state: 'idle', fileName: '', filePath: '', fileID: '', summary: null, rows: [], result: null })
  },

  goStock() {
    wx.switchTab({ url: '/pages/stock/list/list' })
  }
})
