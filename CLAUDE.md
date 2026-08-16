# 手机店管理小程序（phone-store）

舅舅的二手手机店管理小程序。微信云开发（免服务器免备案），原生小程序前端。

## 业务范围
只管理**二手手机**，每台手机是唯一库存（IMEI 唯一）。不管理配件。
流程：收机（录入+记支出）→ 卖机（卖出+记收入+算利润）→ 退货（销售退回 / 退给上家）。

## 目录约定
- `cloudfunctions/` 云函数，每业务域一个文件夹，内部 `action` 分发（list/get/create/update/sell...）
- `pages/` 页面，每页一个目录（`xxx/xxx.js/.wxml/.wxss/.json`）
- `utils/` 前端公共工具：`cloud.js`(云调用封装) `auth.js`(登录态) `format.js`(格式化)
- 新页面 / 新云函数必须在对应处注册：`app.json` 的 pages、`utils/` 复用

## 数据集合（云数据库）
- `users`：登录用户，预置 admin（init 云函数创建，sha256 密码）
- `phones`：手机，一机一条
  - 字段：`imei, brand, model, memory, color, grade, cost_price, expect_price, sell_price, status, recycle_date, sell_date, detail, images[], seller_name, seller_id, seller_phone, remark, created_at, updated_at`
  - `images`：回收图片 fileID 数组（云存储）；`seller_*`：回收人姓名/证件/电话，选填
  - `status`：0=在库 1=已售 2=销售退货(可再售) 3=退给上家
  - `grade`：1=99新 2=95新 3=9成新 4=8成新及以下 5=有划痕 6=其他
  - IMEI 唯一：create 时先查重（云库无物理唯一约束）
- `flows`：资金流水
  - 字段：`phone_id, type, amount, date, remark, created_at`
  - `type`：1=收机(负) 2=卖机(正) 3=销售退货(负) 4=退上家(正)
  - `amount`：收入为正、支出为负。**利润 = SUM(amount)**

## 约定
- 云函数统一返回 `{ code: 0, data }` 或 `{ code: 1, message }`
- 金额一律数字类型，小数用 Number 转
- 手机状态变更 + 写流水，一律用 `db.runTransaction` 保证原子
- 日期统一 `YYYY-MM-DD` 字符串；排序默认 create_time 或 recycle_date 降序

## 部署（首次，给舅舅用）
1. **注册**：mp.weixin.qq.com 注册**个人主体**小程序（免费）→ 在「开发-开发设置」拿 AppID → 填 `project.config.json` 的 `appid`
2. **装工具**：下载安装微信开发者工具（官方），微信扫码登录
3. **导入**：开发者工具「导入项目」选本项目目录，填 AppID
4. **开云开发**：工具顶部「云开发」→ 开通 → 创建环境 → 把环境 ID 填到 `app.js` 的 `cloudEnv`（目前占位 `phone-store-prod`）
5. **部署云函数**：`cloudfunctions/` 下 `user`、`phone`、`flow` 各自右键「上传并部署：云端安装依赖」
6. **初始化账号**：云开发控制台 → 云函数 `user` → 云端测试 → 输入 `{"action":"init"}` 运行 → 创建 admin（密码 123456，上线前改）
7. **验证**：模拟器登录 admin/123456 → 收机→卖机→看流水利润
8. **给舅舅**：工具点「上传」→ 后台 mp.weixin.qq.com「版本管理」把开发版设为体验版 → 舅舅扫码用；后台「成员管理-体验成员」加舅舅微信号

## 验证
- 云函数：开发者工具模拟器里直接调用测（或临时页面按钮）
- 全链路：收机录入 → 库存列表可见 → 卖机 → 流水页见收入+利润 → 首页看板数字更新
- 并发：双开快速卖同一台机，第二笔应报"不在可售状态"
