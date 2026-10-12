// pages/detail/detail.js - 手机详情
const { call } = require('../../utils/cloud')
const { checkLogin, getUserInfo } = require('../../utils/auth')
const { formatMoney } = require('../../utils/format')

const GRADES = ['', '99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']
const STATUS_MAP = { 0: { text: '在库', cls: 'tag-green' }, 1: { text: '已售', cls: 'tag-blue' }, 2: { text: '退货入库', cls: 'tag-orange' } }
const TYPE_TEXT = { 1: '收机', 2: '卖机', 3: '退货入库' }

// 按宽度换行（中文字符逐字排）
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of String(text || '')) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

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
  goEdit() {
    wx.navigateTo({ url: '/pages/recycle/edit/edit?id=' + this.data.id })
  },
  onDelete() {
    const p = this.data.phone
    wx.showModal({
      title: '删除入库',
      content: `确认删除「${p.brand} ${p.model}」这条入库记录？将同时删除它的收机流水，不可恢复。`,
      confirmColor: '#ff4d4f',
      success: async res => {
        if (!res.confirm) return
        try {
          await call('phone', { action: 'remove', id: this.data.id })
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 600)
        } catch (err) { console.error(err) }
      }
    })
  },
  onReturn() {
    wx.navigateTo({ url: '/pages/return/return?id=' + this.data.id })
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    const urls = (this.data.phone && this.data.phone.images) || []
    wx.previewImage({ urls, current: src })
  },

  // 生成分享图海报：个人主体无分享能力，用图片替代；不画入库价等内部字段
  async onMakePoster() {
    const phone = this.data.phone
    if (!phone) return
    wx.showLoading({ title: '生成中...' })
    try {
      const imgPath = await this.getPosterPhoto(phone.images)
      this.posterPath = await this.drawPoster(phone, imgPath)
      wx.hideLoading()
      wx.showModal({
        title: '分享图已生成',
        content: '保存到相册后，可在微信里直接发给顾客',
        confirmText: '保存图片',
        success: res => { if (res.confirm) this.savePoster() }
      })
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  async getPosterPhoto(images) {
    if (!images || images.length === 0) return ''
    const r = await wx.cloud.getTempFileURL({ fileList: [images[0]] })
    const url = r.fileList && r.fileList[0] && r.fileList[0].tempFileURL
    if (!url) return ''
    return new Promise(resolve => {
      wx.downloadFile({ url, success: res => resolve(res.tempFilePath), fail: () => resolve('') })
    })
  },

  async drawPoster(phone, imgPath) {
    // 淘宝式分享图：上方大主图（接近方形），下方白底文字区
    const W = 750
    const PAD = 40
    const PHOTO_H = imgPath ? 960 : 0
    const query = wx.createSelectorQuery()
    const node = await new Promise(resolve => {
      query.select('#posterCanvas').fields({ node: true, size: true }).exec(r => resolve(r[0]))
    })
    if (!node || !node.node) throw new Error('canvas 不可用')
    const canvas = node.node
    const ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = 3000 // 先给足高度，画完按实际内容高度裁剪导出

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, 3000)

    let y = 0
    // 商品主图：全宽大图，aspectFill 裁进顶部
    if (imgPath) {
      const img = await loadCanvasImage(canvas, imgPath)
      const scale = Math.max(W / img.width, PHOTO_H / img.height)
      const sw = W / scale
      const sh = PHOTO_H / scale
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, PHOTO_H)
      y += PHOTO_H + 28
    }

    // 标价：红色大字，最醒目
    if (phone.expect_price != null) {
      ctx.fillStyle = '#ff4d4f'
      ctx.font = 'bold 76px sans-serif'
      ctx.fillText(`¥${phone.expectText}`, PAD, y + 72)
      y += 98
    }

    // 标题：品牌型号，黑色大字，最多 2 行
    ctx.fillStyle = '#1f2d3d'
    ctx.font = 'bold 46px sans-serif'
    const titleLines = wrapText(ctx, `${phone.brand} ${phone.model}`, W - PAD * 2).slice(0, 2)
    titleLines.forEach(line => {
      ctx.fillText(line, PAD, y + 44)
      y += 62
    })

    // 规格
    ctx.fillStyle = '#555'
    ctx.font = '28px sans-serif'
    ctx.fillText(`容量 ${phone.memory} ｜ ${phone.color || '-'} ｜ ${phone.gradeText} ｜ 电池 ${phone.battery || '-'}`, PAD, y + 28)
    y += 52

    // 分割线
    ctx.strokeStyle = '#eee'
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
    y += 26

    // 详情（最多 6 行）
    if (phone.detail) {
      ctx.fillStyle = '#666'
      ctx.font = '26px sans-serif'
      const lines = wrapText(ctx, phone.detail, W - PAD * 2).slice(0, 6)
      lines.forEach(line => {
        ctx.fillText(line, PAD, y + 24)
        y += 38
      })
      y += 10
    }

    // 底部：店名 + 引导语
    const storeName = (getUserInfo() || {}).store_name || ''
    const footer = storeName ? `「${storeName}」 · 详情欢迎微信咨询` : '详情欢迎微信咨询'
    ctx.fillStyle = '#999'
    ctx.font = '24px sans-serif'
    ctx.fillText(footer, PAD, y + 22)
    y += 48

    const H = y
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        fileType: 'jpg',
        quality: 0.9,
        success: r => resolve(r.tempFilePath),
        fail: err => reject(err)
      })
    })
  },

  savePoster() {
    if (!this.posterPath) return
    wx.saveImageToPhotosAlbum({
      filePath: this.posterPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: err => {
        if (err.errMsg && err.errMsg.indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: r => { if (r.confirm) wx.openSetting() }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  }
})
