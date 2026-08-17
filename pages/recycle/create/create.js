// pages/recycle/create/create.js - 回收登记
const { call } = require('../../../utils/cloud')
const { checkLogin } = require('../../../utils/auth')
const { todayStr } = require('../../../utils/format')

const BRANDS = ['苹果', '华为', '小米', 'OPPO', 'vivo', '荣耀', '三星', '一加', '其他']
const GRADES = ['99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']

// 压缩图片到最长边 1600px，避免超出百度 OCR 4MB 限制
function compressImage(src, maxSide = 1600) {
  return new Promise(resolve => {
    wx.getImageInfo({
      src,
      success: info => {
        let { width, height } = info
        if (width <= maxSide && height <= maxSide) {
          resolve(src)
          return
        }
        const ratio = Math.min(maxSide / width, maxSide / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
        try {
          const canvas = wx.createOffscreenCanvas({ type: '2d', width, height })
          const ctx = canvas.getContext('2d')
          const img = canvas.createImage()
          img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height)
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality: 0.7,
              success: r => resolve(r.tempFilePath),
              fail: () => resolve(src)
            })
          }
          img.onerror = () => resolve(src)
          img.src = src
        } catch (e) {
          resolve(src) // 压缩失败就用原图，百度那边会提示
        }
      },
      fail: () => resolve(src)
    })
  })
}

Page({
  data: {
    imei: '',
    brands: BRANDS,
    brandIndex: 0,
    model: '',
    memory: '',
    battery: '',
    color: '',
    grades: GRADES,
    gradeIndex: 0,
    costPrice: '',
    expectPrice: '',
    recycleDate: '',
    detail: '',
    images: [],
    sellerName: '',
    sellerId: '',
    sellerPhone: '',
    remark: '',
    uploading: false,
    recognizing: false,
    submitting: false
  },

  // 拍照识别贴纸：自动填 IMEI/型号/内存/品牌，电池与充电次数并入详情
  onOcr() {
    if (this.data.recognizing) return
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: async res => {
        const path = res.tempFilePaths[0]
        console.log('onOcr: 已选照片', path)
        this.setData({ recognizing: true })
        let msg = ''
        try {
          const compressed = await compressImage(path)
          console.log('onOcr: 压缩完成', compressed)
          wx.showLoading({ title: '上传图片...' })
          const up = await wx.cloud.uploadFile({
            cloudPath: `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
            filePath: compressed
          })
          console.log('onOcr: 上传完成', up.fileID)
          wx.showLoading({ title: '识别文字...' })
          const data = await call('ocr', { action: 'recognize', fileID: up.fileID })
          console.log('onOcr: 识别返回', JSON.stringify(data))
          const patch = {}
          if (data.imei) patch.imei = data.imei
          if (data.model) patch.model = data.model
          if (data.memory) patch.memory = data.memory
          if (data.brand) {
            const bIdx = BRANDS.indexOf(data.brand)
            if (bIdx >= 0) patch.brandIndex = bIdx
          }
          if (data.battery) patch.battery = data.battery
          if (data.cycles) {
            patch.detail = (this.data.detail ? this.data.detail + '\n' : '') + '充电 ' + data.cycles + ' 次'
          }
          this.setData(patch)
          msg = '识别完成，可手动修正'
        } catch (err) {
          console.error('ocr error', err)
          msg = (err && err.message) || '识别失败，请重试'
        } finally {
          wx.hideLoading()
          this.setData({ recognizing: false })
        }
        if (msg) wx.showToast({ title: msg, icon: 'none' })
      },
      fail: err => {
        console.error('onOcr: 选图失败', err)
        wx.showToast({ title: '选图失败：' + ((err && err.errMsg) || '未知'), icon: 'none' })
      }
    })
  },

  onLoad() {
    if (!checkLogin()) return
    this.setData({ recycleDate: todayStr() })
  },

  onImei(e) { this.setData({ imei: e.detail.value }) },
  onBrand(e) { this.setData({ brandIndex: Number(e.detail.value) }) },
  onModel(e) { this.setData({ model: e.detail.value }) },
  onMemory(e) { this.setData({ memory: e.detail.value }) },
  onBattery(e) { this.setData({ battery: e.detail.value }) },
  onColor(e) { this.setData({ color: e.detail.value }) },
  onGrade(e) { this.setData({ gradeIndex: Number(e.detail.value) }) },
  onCost(e) { this.setData({ costPrice: e.detail.value }) },
  onExpect(e) { this.setData({ expectPrice: e.detail.value }) },
  onDate(e) { this.setData({ recycleDate: e.detail.value }) },
  onDetail(e) { this.setData({ detail: e.detail.value }) },
  onSellerName(e) { this.setData({ sellerName: e.detail.value }) },
  onSellerId(e) { this.setData({ sellerId: e.detail.value }) },
  onSellerPhone(e) { this.setData({ sellerPhone: e.detail.value }) },
  onRemark(e) { this.setData({ remark: e.detail.value }) },

  onChooseImage() {
    const remain = 5 - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 5 张', icon: 'none' })
      return
    }
    if (this.data.uploading) return
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      success: async res => {
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传中...' })
        try {
          const tasks = res.tempFiles.map((f, i) => wx.cloud.uploadFile({
            cloudPath: `recycle/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`,
            filePath: f.tempFilePath
          }))
          const results = await Promise.all(tasks)
          const fileIDs = results.map(r => r.fileID)
          this.setData({ images: this.data.images.concat(fileIDs) })
        } catch (err) {
          console.error(err)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
          this.setData({ uploading: false })
        }
      }
    })
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({ urls: this.data.images, current: src })
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  async onSubmit() {
    const d = this.data
    if (!d.imei || !d.imei.trim()) {
      wx.showToast({ title: '请输入 IMEI', icon: 'none' })
      return
    }
    if (!d.model.trim()) {
      wx.showToast({ title: '请输入型号', icon: 'none' })
      return
    }
    if (!d.costPrice || Number(d.costPrice) <= 0) {
      wx.showToast({ title: '请输入正确的成本价', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      await call('phone', {
        action: 'create',
        data: {
          imei: d.imei.trim(),
          brand: d.brands[d.brandIndex],
          model: d.model.trim(),
          memory: d.memory.trim(),
          battery: d.battery.trim(),
          color: d.color.trim(),
          grade: d.gradeIndex + 1,
          cost_price: Number(d.costPrice),
          expect_price: d.expectPrice ? Number(d.expectPrice) : null,
          recycle_date: d.recycleDate,
          detail: d.detail.trim(),
          images: d.images,
          seller_name: d.sellerName.trim(),
          seller_id: d.sellerId.trim(),
          seller_phone: d.sellerPhone.trim(),
          remark: d.remark.trim()
        }
      })
      wx.showToast({ title: '录入成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/stock/list/list' }), 600)
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
