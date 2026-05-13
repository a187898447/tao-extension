## 1. Project Setup

- [x] 1.1 Initialize Node.js project with package.json, install dependencies (playwright, axios, commander, yaml)
- [x] 1.2 Create project directory structure (src/, src/modes/, src/shared/, config/)
- [x] 1.3 Create default selectors config file for Taobao page elements

## 2. Auth Management

- [x] 2.1 Implement `tao login` command: launch Playwright browser, navigate to taobao.com, wait for user to manually log in
- [x] 2.2 Implement login detection: poll for presence of authenticated cookies/session after user completes login
- [x] 2.3 Implement cookie extraction and persistence to `~/.taobao-tool/credentials/<profile>.json` with mode 600
- [x] 2.4 Implement session loading from stored credentials on subsequent runs
- [x] 2.5 Implement session validity check via lightweight authenticated request

## 3. CLI & Config

- [x] 3.1 Set up Commander-based CLI entry point with commands: login, buy, schedule, status
- [x] 3.2 Implement YAML config loading with CLI parameter override priority
- [x] 3.3 Implement `--mode browser|api`, `--retry-interval`, `--retry-window`, `--profile`, `--capture` flags

## 4. Browser Automation

- [x] 4.1 Implement page navigation with stored cookies injected into Playwright context
- [x] 4.2 Implement product detail page direct purchase flow: navigate → select SKU → click "立即购买"
- [x] 4.3 Implement cart checkout flow: navigate to cart → select items → click "结算"
- [x] 4.4 Implement checkout/order confirmation page submission: click "提交订单"

## 5. Rapid Retry Engine

- [x] 5.1 Implement retry loop with configurable fixed interval (default 200ms) and time window (default 30s)
- [x] 5.2 Implement terminal condition detection: sold-out, delisted, login-expired, order-success
- [x] 5.3 Wire retry engine into browser mode purchase flow

## 6. API Capture & Purchase

- [x] 6.1 Implement Playwright network request interception to capture order-related HTTP requests during browser mode
- [x] 6.2 Implement `--capture` flag to save captured requests to JSON file for offline analysis
- [x] 6.3 Implement API purchase mode: construct and send order request using captured parameter template
- [x] 6.4 Wire retry engine into API purchase mode with minimum 100ms rate limit

## 7. Scheduled Trigger

- [x] 7.1 Implement `tao schedule --at <time>` command with millisecond-precision setTimeout
- [x] 7.2 Implement automatic lead-time calculation for browser mode (navigate and prepare before target time)
- [x] 7.3 Implement countdown display to console while waiting for target time

## 8. Integration & Polish

- [x] 8.1 Create `tao buy` as the main purchase command integrating all modes and retry engine
- [x] 8.2 Implement credential masking in all log/console output
- [x] 8.3 Add README with usage examples and default selector documentation
