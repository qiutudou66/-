// pages/recycle/create/create.js - 回收登记
const { call } = require('../../../utils/cloud')
const { checkLogin } = require('../../../utils/auth')
const { todayStr } = require('../../../utils/format')
const { compressImage } = require('../../../utils/image')

const BRANDS = ['苹果', '华为', '小米', 'OPPO', 'vivo', '荣耀', '三星', '一加', '其他']
const GRADES = ['99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']

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
        let fileID = ''
        try {
          const compressed = await compressImage(path)
          console.log('onOcr: 压缩完成', compressed)
          wx.showLoading({ title: '上传图片...' })
          const up = await wx.cloud.uploadFile({
            cloudPath: `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
            filePath: compressed
          })
          fileID = up.fileID
          console.log('onOcr: 上传完成', fileID)
          wx.showLoading({ title: '识别文字...' })
          const data = await call('ocr', { action: 'recognize', fileID })
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
          // 识别用的临时图用完即删，不留云存储垃圾
          if (fileID) wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
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
          const paths = await Promise.all(res.tempFiles.map(f => compressImage(f.tempFilePath)))
          const tasks = paths.map((filePath, i) => wx.cloud.uploadFile({
            cloudPath: `recycle/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`,
            filePath
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
    const removed = images.splice(index, 1)
    this.setData({ images })
    if (removed[0]) {
      // 拍错不要的图，连带删云存储，省存储额度
      wx.cloud.deleteFile({ fileList: [removed[0]] }).catch(() => {})
    }
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
