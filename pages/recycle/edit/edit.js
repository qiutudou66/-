// pages/recycle/edit/edit.js - 编辑入库（IMEI 不可改）
const { call } = require('../../../utils/cloud')
const { checkLogin } = require('../../../utils/auth')
const { todayStr } = require('../../../utils/format')

const BRANDS = ['苹果', '华为', '小米', 'OPPO', 'vivo', '荣耀', '三星', '一加', '其他']
const GRADES = ['99新', '95新', '9成新', '8成新及以下', '有划痕', '其他']

Page({
  data: {
    id: '',
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
      const p = data.phone
      this.setData({
        brandIndex: Math.max(0, BRANDS.indexOf(p.brand)),
        model: p.model || '',
        memory: p.memory || '',
        battery: p.battery || '',
        color: p.color || '',
        gradeIndex: Math.max(0, (p.grade || 1) - 1),
        costPrice: p.cost_price != null ? String(p.cost_price) : '',
        expectPrice: p.expect_price != null ? String(p.expect_price) : '',
        recycleDate: p.recycle_date || todayStr(),
        detail: p.detail || '',
        images: p.images || [],
        sellerName: p.seller_name || '',
        sellerId: p.seller_id || '',
        sellerPhone: p.seller_phone || '',
        remark: p.remark || ''
      })
    } catch (err) {
      console.error(err)
    }
  },

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
    const remain = 3 - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张', icon: 'none' })
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
          this.setData({ images: this.data.images.concat(results.map(r => r.fileID)) })
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
    const images = this.data.images.slice()
    images.splice(e.currentTarget.dataset.index, 1)
    this.setData({ images })
  },

  async onSubmit() {
    const d = this.data
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
        action: 'update',
        id: this.data.id,
        data: {
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
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
