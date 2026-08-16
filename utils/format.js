// utils/format.js - 格式化工具

function formatMoney(num) {
  if (num == null || isNaN(num)) return '0.00'
  return Number(num).toFixed(2)
}

function formatDate(date) {
  if (!date) return ''
  if (typeof date === 'string') date = new Date(date)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateTime(date) {
  if (!date) return ''
  if (typeof date === 'string') date = new Date(date)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

function todayStr() {
  return formatDate(new Date())
}

function genOrderNo(prefix) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${prefix}-${y}${m}${d}-${rand}`
}

module.exports = {
  formatMoney,
  formatDate,
  formatDateTime,
  todayStr,
  genOrderNo
}
