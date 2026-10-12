// utils/image.js - 图片处理

// 压缩图片到最长边 maxSide，jpg 质量 0.7；不超限或压缩失败则返回原图
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
          resolve(src)
        }
      },
      fail: () => resolve(src)
    })
  })
}

module.exports = { compressImage }
