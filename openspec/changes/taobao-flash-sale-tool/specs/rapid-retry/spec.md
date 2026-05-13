## ADDED Requirements

### Requirement: Fixed-interval brainless clicking
The system SHALL retry failed purchase attempts by repeatedly clicking the target button at a fixed 200ms interval, without inspecting DOM state between clicks.

#### Scenario: Click loop without state detection
- **WHEN** the system enters retry mode after a blocked submission
- **THEN** it clicks the button every 200ms without checking whether the button is enabled, visible, or the page state has changed

#### Scenario: Configurable retry interval
- **WHEN** user sets a custom interval via `--retry-interval` or config file
- **THEN** the system uses that value instead of the 200ms default

### Requirement: Configurable retry time window
The system SHALL support a configurable time window (default 30 seconds) during which retries continue.

#### Scenario: Retry within time window
- **WHEN** a purchase attempt is blocked and elapsed time since first attempt is within the configured window
- **THEN** the system continues the click loop

#### Scenario: Stop retry when window expires
- **WHEN** the configured time window elapses without a successful purchase
- **THEN** the system stops retrying and reports failure with total attempts made

### Requirement: Terminal error detection
The system SHALL detect terminal failure conditions and stop immediately without continuing the retry loop.

#### Scenario: Stop on sold out
- **WHEN** the page displays "已售罄", "卖完了", or similar out-of-stock text after a click
- **THEN** the system SHALL immediately stop and report "sold out"

#### Scenario: Stop on item delisted
- **WHEN** the page displays "商品已下架" or similar delisting text
- **THEN** the system SHALL immediately stop and report "item delisted"

#### Scenario: Stop on login expired
- **WHEN** the page redirects to the login page or displays "请登录"
- **THEN** the system SHALL immediately stop and prompt the user to re-authenticate

#### Scenario: Stop on order success
- **WHEN** the page URL or content indicates a successful order submission (e.g., redirect to order detail or success page)
- **THEN** the system SHALL immediately stop the retry loop and report success

### Requirement: Skippable unactionable states
The system SHALL NOT attempt to diagnose why a click didn't register. If the button is not yet rendered, disabled, or obscured, the click is a no-op and the system continues to the next interval.

#### Scenario: Click on not-yet-loaded button
- **WHEN** the target button has not finished rendering
- **THEN** the click is a harmless no-op and the system proceeds to the next interval without error
