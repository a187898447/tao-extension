# tao - 淘宝抢购自动化工具

基于 Playwright 的淘宝/天猫抢购自动化 CLI 工具，支持浏览器自动化和 API 直调两种模式。

## 免责声明

本工具仅供学习研究使用。使用本工具进行抢购可能违反淘宝用户协议，使用者自行承担风险。

## 安装

```bash
npm install
npx playwright install chromium
npm link  # 可选，全局安装 tao 命令
```

## 快速开始

### 1. 登录

```bash
# 登录淘宝账号（会打开浏览器窗口，手动完成登录）
tao login

# 多账号管理
tao login --profile account2

# 查看登录状态
tao status
```

### 2. 购买

```bash
# 浏览器模式 - 详情页下单
tao buy --mode browser --product-url "https://item.taobao.com/item.htm?id=XXXXXXXX"

# 浏览器模式 - 购物车结算
tao buy --mode browser --use-cart

# 指定 SKU
tao buy --mode browser --product-url "https://..." --sku '{"颜色":"红色","尺码":"M"}'

# 自定义重试参数
tao buy --mode browser --product-url "https://..." --retry-interval 150 --retry-window 60

# 启用网络请求抓包（用于 API 模式逆向）
tao buy --mode browser --product-url "https://..." --capture
```

### 3. API 模式

```bash
# 需要先通过浏览器模式 + --capture 获取接口模板
tao buy --mode api
```

### 4. 定时抢购

```bash
# 设定目标时间自动抢购
tao schedule --at "2026-05-14 10:00:00" --mode browser --product-url "https://..."

# 使用今天的时间
tao schedule --at "10:00:00" --mode browser --product-url "https://..."

# 购物车定时结算
tao schedule --at "10:00:00" --mode browser --use-cart
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `tao login` | 登录淘宝账号并保存凭证 |
| `tao status` | 查看当前登录状态 |
| `tao buy` | 立即执行购买 |
| `tao schedule` | 定时抢购 |

## 配置

用户配置文件: `~/.taobao-tool/config.yaml`

```yaml
mode: browser
retryInterval: 200       # 重试间隔(毫秒)
retryWindow: 30000       # 重试时间窗口(毫秒)
profile: default
leadTime: 10000           # 定时模式提前准备时间(毫秒)
```

页面选择器配置: `config/selectors.yaml`（当淘宝 UI 变更时修改此文件）

## 项目结构

```
src/
├── index.js             # CLI 入口
├── modes/
│   ├── browser.js       # 浏览器模式
│   └── api.js           # API 模式
└── shared/
    ├── auth.js          # 登录认证
    ├── config.js        # 配置管理
    ├── retry.js         # 重试引擎
    ├── scheduler.js     # 定时触发
    └── session.js       # 凭证持久化
config/
└── selectors.yaml       # 淘宝页面选择器
```
