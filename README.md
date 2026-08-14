# ISEU 硕士课程表自动监控

白俄罗斯国际生态大学（ISEU）硕士课程表自动抓取 + 网页展示 + 变更通知

## ✨ 功能

- ✅ 每30分钟自动抓取官网课表
- ✅ 自动选择当前周，无需手动设置
- ✅ 课表变更时网页自动更新 + 浏览器通知
- ✅ 手机、电脑均可访问，无需安装任何软件
- ✅ 支持添加到手机桌面（PWA）

## 🚀 给同学的分享方式

**只需一个网址，打开即用！**

### 方式一：查看网页

直接访问 GitHub Pages 网址即可查看最新课表，自动刷新。

### 方式二：开启通知（推荐）

1. 打开网页
2. 点击 **"开启课表变更通知"** 按钮
3. 浏览器弹窗时选择 **"允许"**
4. 以后课表更新时，浏览器会自动弹出通知

### 方式三：添加到手机桌面

- **iPhone**: Safari打开 → 分享按钮 → 添加到主屏幕
- **Android**: Chrome打开 → 菜单 → 添加到主屏幕

## 🛠 部署到自己的 GitHub

### 方法一：Fork（最简单）

1. Fork 这个仓库
2. 进入 Settings → Pages → 选 main 分支，保存
3. 等待1分钟，访问 `https://你的用户名.github.io/仓库名/`

### 方法二：新建仓库

1. 创建新仓库 `你的用户名/iseu-schedule`
2. 把所有文件上传
3. Settings → Pages → 选 main 分支，保存

## ⚙️ 自定义配置

如需修改学院/组别等，编辑 `scripts/fetch-schedule.js` 中的 CONFIG：

```js
const CONFIG = {
  faculty: '4',     // 学院编号
  department: '2',  // 形式编号
  course: '1',      // 年级编号
  groupAuto: true,  // true=自动选最后一项
};
```

## 📝 学院对应关系

| 编号 | 学院 |
|------|------|
| 2 | 环境监测学院 |
| 3 | 进修学院 |
| 4 | **生态医学院** |

## 📄 文件结构

```
├── index.html              # 课表展示网页
├── manifest.json           # PWA 配置
├── sw.js                   # 通知 Service Worker
├── schedule-data.json      # 课表数据（自动生成）
├── scripts/
│   └── fetch-schedule.js   # 抓取脚本
└── .github/workflows/
    └── fetch.yml           # 自动抓取 Action
```
