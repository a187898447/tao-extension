## ADDED Requirements

### Requirement: Network request capture for API reverse-engineering
The system SHALL support capturing HTTP network requests during browser-mode purchase to facilitate reverse-engineering of Taobao's order API.

#### Scenario: Capture order submission request
- **WHEN** browser mode completes a purchase flow
- **THEN** the system logs all HTTP requests related to order submission (URL, method, headers, body) for later analysis

#### Scenario: Save captured requests to file
- **WHEN** network capture is enabled via `--capture` flag
- **THEN** the system saves captured request details to a JSON file for offline analysis

### Requirement: API-based order submission
The system SHALL support submitting an order via direct HTTP request using parameters derived from captured network data and user configuration.

#### Scenario: Successful API purchase
- **WHEN** user provides valid credentials and all required order parameters (item ID, SKU ID, quantity, address ID)
- **THEN** the system constructs and sends the order API request and reports the result

#### Scenario: API purchase with invalid credentials
- **WHEN** the provided session cookies or tokens are expired
- **THEN** the system SHALL report "authentication failed" and prompt for re-login

#### Scenario: API purchase when item is sold out
- **WHEN** the API responds with an out-of-stock status
- **THEN** the system SHALL immediately report "sold out" without entering retry

### Requirement: API retry integration
The system SHALL integrate the API purchase mode with the rapid-retry mechanism.

#### Scenario: API purchase retry on system busy
- **WHEN** the API returns a retryable status (system busy, rate limited)
- **THEN** the system SHALL re-send the request after the configured retry interval within the configured time window

#### Scenario: API rate limit floor
- **WHEN** user configures a retry interval shorter than 100ms in API mode
- **THEN** the system SHALL enforce a minimum 100ms interval to reduce anti-bot detection risk

### Requirement: API request template
The system SHALL support configuring the API request template (endpoint URL, parameter mapping) via the config file, so it can be updated without code changes when Taobao's API changes.

#### Scenario: Custom API endpoint configuration
- **WHEN** user specifies a custom API endpoint and parameter schema in the config file
- **THEN** the system uses those values to construct the order request
