## Why

淘宝抢购（秒杀、限量发售）场景下，人工操作延迟在秒级，而自动化工具可达毫秒级。需要一款工具在抢购窗口内以最快速度完成下单——无论走页面流程还是 API 直调，遇到阻塞时持续重试，从而在实际抢购中提高成功率。

## What Changes

- 新增浏览器自动化下单：基于 Playwright 实现商品详情页直接下单和购物车结算下单两条完整流程
- 新增无脑连点式重试机制：200ms 固定间隔、30s 默认时间窗口，不检测 DOM 状态直接循环点击，遇到终局错误（售罄/下架/登录过期）立即退出
- 新增 API 接口下单：通过浏览器抓包逆向淘宝下单接口参数后，直接发 HTTP 请求完成购买，作为高速替代方案
- 新增用户认证管理：手动登录后自动提取 cookie/token 持久化存储，支持多 profile 管理
- 新增定时触发：设定目标抢购时间，工具自动提前准备并在到点瞬间发起首次请求

## Capabilities

### New Capabilities
- `browser-automation`: 基于 Playwright 的浏览器自动化下单，覆盖商品详情页下单和购物车结算两条完整流程
- `rapid-retry`: 无脑连点式重试机制，固定间隔在时间窗口内循环点击，智能区分可重试错误和终局错误
- `api-purchase`: API 直调下单，通过逆向淘宝接口参数直接发送 HTTP 请求完成购买
- `auth-management`: 手动登录 + 自动提取 cookie/token + 持久化存储 + 多 profile 支持
- `scheduled-trigger`: 定时触发，设定目标时间后自动提前准备并在到点瞬间执行首次购买操作

### Modified Capabilities
<!-- No existing capabilities to modify -->

## Impact

- 新项目，无现有代码影响
- 依赖：Node.js、Playwright、axios、yaml、commander（CLI框架）
- 涉及外部系统：淘宝/天猫网页端及下单 API 接口
- 数据存储：`~/.taobao-tool/credentials/`（凭证）、`~/.taobao-tool/config.yaml`（配置）
- 风险：高频请求可能触发淘宝风控；API 接口参数需要逆向确认
