## MODIFIED Requirements

### Requirement: Direct purchase from product detail page
The system SHALL automate purchasing from a product detail page by navigating to the product URL, selecting specified SKU properties, and clicking through the purchase flow to submit the order. When `listingType` is "scheduled", the product URL is discovered via store search rather than provided directly.

#### Scenario: Direct purchase with default SKU
- **WHEN** user provides a product URL and the product has a single default SKU
- **THEN** the system navigates to the product page, clicks "立即购买", then clicks "提交订单" on the confirmation page

#### Scenario: Direct purchase with SKU selection
- **WHEN** user provides a product URL and specifies SKU properties (e.g., color, size)
- **THEN** the system selects the matching SKU options on the product page before clicking "立即购买"

#### Scenario: Purchase flow with page navigation
- **WHEN** the system clicks "立即购买" on the detail page
- **THEN** the system waits for the checkout page to load and then clicks "提交订单"

#### Scenario: Purchase via store search discovery
- **WHEN** user configures `listingType: "scheduled"` with `storeUrl`, `searchKeyword`, and `priceRange` instead of a `productUrl`
- **THEN** the system discovers the product via store search, enters the product page, and proceeds with the purchase flow
