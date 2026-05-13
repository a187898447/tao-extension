## ADDED Requirements

### Requirement: Direct purchase from product detail page
The system SHALL automate purchasing from a product detail page by navigating to the product URL, selecting specified SKU properties, and clicking through the purchase flow to submit the order.

#### Scenario: Direct purchase with default SKU
- **WHEN** user provides a product URL and the product has a single default SKU
- **THEN** the system navigates to the product page, clicks "立即购买", then clicks "提交订单" on the confirmation page

#### Scenario: Direct purchase with SKU selection
- **WHEN** user provides a product URL and specifies SKU properties (e.g., color, size)
- **THEN** the system selects the matching SKU options on the product page before clicking "立即购买"

#### Scenario: Purchase flow with page navigation
- **WHEN** the system clicks "立即购买" on the detail page
- **THEN** the system waits for the checkout page to load and then clicks "提交订单"

### Requirement: Purchase from shopping cart
The system SHALL automate purchasing from the shopping cart by navigating to the cart page, selecting items, and proceeding through settlement.

#### Scenario: Cart checkout with single item
- **WHEN** user configures a single item for cart checkout
- **THEN** the system navigates to the cart page, ensures the item is selected, clicks "结算", then clicks "提交订单"

#### Scenario: Cart checkout with all items selected
- **WHEN** user wants to check out all items in the cart
- **THEN** the system selects all available items and proceeds to settlement

### Requirement: Configurable page selectors
The system SHALL use configurable CSS selectors for key page elements so selectors can be updated when Taobao's UI changes, without code modifications.

#### Scenario: Built-in default selectors
- **WHEN** no custom selectors are configured
- **THEN** the system uses hardcoded default selectors matching Taobao's current page structure

#### Scenario: Custom selector override via config
- **WHEN** user provides custom selectors in the YAML configuration
- **THEN** the system uses the custom selectors instead of built-in defaults
