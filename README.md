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

# 登录后保持浏览器打开，方便手动勾选购物车商品
tao login --keep-open

# 多账号管理
tao login --profile account2

# 无头模式（CI/服务器环境）
tao login --headless --keep-open

# 查看登录状态
tao status
tao status --profile account2
```

### 2. 浏览器模式购买

```bash
# 详情页直接下单
tao buy --mode browser --product-url "https://item.taobao.com/item.htm?id=XXXXXXXX"

# 购物车结算（自动全选）
tao buy --mode browser --use-cart

# 购物车结算 + 手动勾选（浏览器打开后手动选择商品，按 Enter 继续）
tao buy --mode browser --use-cart --interactive

# 指定 SKU
tao buy --mode browser --product-url "https://..." --sku '{"颜色":"红色","尺码":"M"}'

# 无头模式
tao buy --mode browser --product-url "https://..." --headless

# 自定义重试参数
tao buy --mode browser --product-url "https://..." --retry-interval 150 --retry-window 60

# 启用网络请求抓包（用于 API 模式逆向）
tao buy --mode browser --product-url "https://..." --capture
```

### 3. API 模式

```bash
# 需要先通过浏览器模式 + --capture 获取接口模板
tao buy --mode browser --product-url "https://..." --capture

# 使用默认抓包数据进行 API 购买
tao buy --mode api

# 指定 API 模板文件
tao buy --mode api --api-template ~/.taobao-tool/captures/my-template.json
```

### 4. 定时抢购

```bash
# 设定目标时间自动抢购
tao schedule --at "2026-05-14 10:00:00" --mode browser --product-url "https://..."

# 使用今天的时间
tao schedule --at "10:00:00" --mode browser --product-url "https://..."

# 购物车定时结算（支持交互式勾选）
tao schedule --at "10:00:00" --mode browser --use-cart --interactive

# API 模式定时抢购
tao schedule --at "10:00:00" --mode api --api-template ~/.taobao-tool/captures/template.json

# 自定义重试参数和结算提前量
tao schedule --at "10:00:00" --mode browser --product-url "https://..." --retry-interval 100 --retry-window 45 --checkout-lead 1500

# 启用抓包（记录 API 请求用于逆向分析）
tao schedule --at "10:00:00" --mode browser --product-url "https://..." --capture
```

## 命令参考

### `tao login`

| 选项 | 说明 |
|------|------|
| `-p, --profile <name>` | 凭证 profile 名称（默认 `default`） |
| `--headless` | 无头模式运行浏览器 |
| `--keep-open` | 登录后保持浏览器打开，方便手动勾选购物车 |

### `tao status`

| 选项 | 说明 |
|------|------|
| `-p, --profile <name>` | 凭证 profile 名称（默认 `default`） |

### `tao buy`

| 选项 | 说明 |
|------|------|
| `-m, --mode <mode>` | 模式: `browser` 或 `api`（默认 `browser`） |
| `-u, --product-url <url>` | 商品详情页 URL |
| `--use-cart` | 使用购物车结算 |
| `--sku <json>` | SKU 选择，如 `{"颜色":"红色","尺码":"XL"}` |
| `-p, --profile <name>` | 凭证 profile 名称（默认 `default`） |
| `--retry-interval <ms>` | 重试间隔（毫秒，默认 100） |
| `--retry-window <seconds>` | 重试时间窗口（秒，默认 30） |
| `--capture` | 启用网络请求抓包 |
| `--api-template <path>` | API 模板文件路径 |
| `--headless` | 无头模式运行浏览器 |
| `--interactive` | 购物车模式下手动勾选商品，按 Enter 继续 |

### `tao schedule`

| 选项 | 说明 |
|------|------|
| `-m, --mode <mode>` | 模式: `browser` 或 `api`（默认 `browser`） |
| `-u, --product-url <url>` | 商品详情页 URL |
| `--use-cart` | 使用购物车结算 |
| `--sku <json>` | SKU 选择 |
| `--at <time>` | 目标时间，格式: `YYYY-MM-DD HH:mm:ss` 或 `HH:mm:ss` |
| `-p, --profile <name>` | 凭证 profile 名称（默认 `default`） |
| `--retry-interval <ms>` | 重试间隔（毫秒，默认 100） |
| `--retry-window <seconds>` | 重试时间窗口（秒，默认 30） |
| `--checkout-lead <ms>` | 结算按钮提前点击时间（毫秒，默认 1000） |
| `--capture` | 启用网络请求抓包 |
| `--api-template <path>` | API 模板文件路径 |
| `--headless` | 无头模式运行浏览器 |
| `--interactive` | 购物车模式下手动勾选商品，按 Enter 继续 |

## 配置

### 用户配置 (`~/.taobao-tool/config.yaml`)

```yaml
mode: browser
retryInterval: 100       # 重试间隔（毫秒）
retryWindow: 30000       # 重试时间窗口（毫秒）
profile: default
headless: false
capture: false           # 默认关闭，使用 --capture 开启
leadTime: 10000          # 定时模式提前准备时间（毫秒）
checkoutLead: 1000       # 结算按钮提前点击时间（毫秒）
```

### 选择器配置 (`config/selectors.yaml`)

当淘宝 UI 变更时修改此文件中的 CSS 选择器。包含产品页、购物车、结算确认页的选择器及兜底策略。

### 凭证存储 (`~/.taobao-tool/credentials/`)

登录后的 cookies 以 profile 名称分文件存储，文件权限 600。

### 抓包数据 (`~/.taobao-tool/captures/`)

通过 `--capture` 参数捕获的 API 请求保存在此目录。

## 项目结构

```
src/
├── index.js                 # CLI 入口（Commander）
├── modes/
│   ├── browser.js           # 浏览器模式自动化
│   └── api.js               # API 模式直调
└── shared/
    ├── auth.js              # 登录认证与 session 检测
    ├── browser-launcher.js  # Playwright 浏览器启动（反检测）
    ├── config.js            # 配置加载与合并
    ├── retry.js             # 重试引擎
    ├── scheduler.js         # 定时触发与倒计时
    └── session.js           # 凭证持久化
config/
└── selectors.yaml           # 淘宝页面选择器
tests/
├── unit/
│   ├── api.test.js
│   ├── browser-check.test.js
│   ├── config.test.js
│   ├── helpers.test.js
│   ├── retry.test.js
│   ├── scheduler.test.js
│   └── session.test.js
└── integration/
    ├── api-flow.test.js
    └── auth.test.js
```

## 运行测试

```bash
npm test        # 运行 vitest
npx eslint src/ # 代码检查
```
