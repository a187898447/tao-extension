## Why

现有工具假设商品链接在抢购开始前已存在（提前上架），用户提供 `productUrl` 后工具直接导航下单。但有一类"定时上架"商品：链接在上架时刻才首次出现在店铺搜索中，此前没有任何可访问的商品页面。现有流程在第一步 `navigateAndSelectSku` 就会失败，完全无法处理这类场景。

## What Changes

- 新增"定时上架"模式：用户提供店铺 URL + 搜索关键词 + 价格区间，替代原来的 `productUrl`
- 工具提前导航到店铺首页，预填搜索框关键词，在目标时间前开始轮询点击搜索
- 搜索结果中按"新品"筛选 + 价格区间匹配识别目标商品
- 识别到目标商品后自动进入商品页 → 走现有下单流程
- 默认第一个规格（无 SKU 选择）时跳过 SKU 选择步骤

## Capabilities

### New Capabilities
- `store-search-discovery`: 在店铺搜索框中预填关键词、定时触发搜索、从结果列表中发现目标商品并进入下单流程的能力

### Modified Capabilities
- `browser-automation`: 新增搜索框操作（预填关键词、触发搜索）、搜索结果列表解析（新品筛选、价格匹配）等页面交互
- `scheduled-trigger`: 新增对"定时上架"任务的时间线——在 lead time 阶段加入搜索轮询等待，而非直接导航到已知商品 URL

## Impact

- 核心影响：`src/modes/browser.js` — 新增 `searchStoreAndFindProduct` 流程，包含搜索框预填、搜索触发、结果解析
- 调度影响：`src/shared/scheduler.js` — `prepare` 阶段支持搜索轮询模式
- 配置影响：`src/shared/config.js` — 新增 `listingType`（区分普通/定时上架）、`storeUrl`、`searchKeyword`、`priceRange` 配置项
- 无破坏性变更：默认行为不变，仅当用户显式配置定时上架模式时才启用新逻辑
