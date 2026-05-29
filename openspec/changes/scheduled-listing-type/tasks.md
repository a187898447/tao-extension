## 1. Configuration

- [x] 1.1 Add new config fields to `DEFAULTS` and `mergeConfig`: `listingType` (default `"normal"`), `storeUrl`, `searchKeyword`, `priceRange` (object `{min, max}`), `searchLead` (default 5000ms), `searchInterval` (default 500ms), `searchTimeout` (default 60000ms)
- [x] 1.2 Add `storeUrl`、`searchKeyword`、`priceRange` CLI argument support in `src/index.js`

## 2. Search Selectors Configuration

- [x] 2.1 Add search-related selectors to `config/selectors.yaml`: store search input, search submit button, search result items container, individual result item, price element within result, "新品" filter tab

## 3. Store Search & Product Discovery

- [x] 3.1 Implement `navigateToStoreAndPrefillSearch(page, storeUrl, searchKeyword)` in `src/modes/browser.js` — navigates to store URL, locates search input, fills keyword without submitting
- [x] 3.2 Implement `triggerSearch(page)` — clicks search button and waits for results container to render
- [x] 3.3 Implement `applyNewItemsFilter(page)` — finds and clicks "新品" filter tab if present
- [x] 3.4 Implement `findProductByPriceRange(page, priceMin, priceMax)` — parses result items, extracts prices, returns first match element or null
- [x] 3.5 Implement `searchAndDiscoverProduct(page, storeUrl, keyword, priceRange, options)` — orchestration function that calls prefill → search → filter → match in a polling loop until product found or timeout

## 4. Flow Integration

- [x] 4.1 Implement `enterProductFromDiscovery(page, productElement)` — clicks the matched product element, waits for product detail page to load
- [x] 4.2 Modify `navigateAndSelectSku` or add a branching path so that when `listingType: "scheduled"`, it calls `searchAndDiscoverProduct` then skips SKU selection and goes directly to "立即购买"
- [x] 4.3 Implement skip-SKU logic: when product has only one default SKU, skip `selectSku` and proceed directly to `clickBuyNowButton`

## 5. Scheduler Integration

- [x] 5.1 Modify `schedulePurchase` in `src/shared/scheduler.js`: when `listingType: "scheduled"`, in the `prepare` phase call the search discovery flow instead of `navigateAndSelectSku(productUrl)`, adjusting the timeline to account for `searchLead`

## 6. Tests

- [x] 6.1 Add unit tests for `findProductByPriceRange` — price in range, out of range, boundary cases, multiple matches
- [x] 6.2 Add unit tests for `searchAndDiscoverProduct` orchestration logic — product found immediately, found after N polls, timeout
- [x] 6.3 Add integration test for the scheduled listing flow end-to-end (or document manual test plan if page structure is hard to mock)
