## ADDED Requirements

### Requirement: Store search box keyword pre-fill
The system SHALL navigate to the configured store URL and pre-fill the search box with the specified keyword without triggering a search.

#### Scenario: Search box found and filled
- **WHEN** the store page loads and a search input element matching configured selectors is found
- **THEN** the system fills the search keyword into the input field and does NOT submit the search

#### Scenario: Search box not found
- **WHEN** the store page loads and no search input element matches the configured selectors within a timeout
- **THEN** the system SHALL report an error and exit

### Requirement: Timed search polling
The system SHALL start polling search results at `targetTime - searchLead` by clicking the search button and waiting for results to load.

#### Scenario: Search triggered on schedule
- **WHEN** the system time reaches `targetTime - searchLead`
- **THEN** the system clicks the search button and waits for the search results page to render

#### Scenario: Search polling on no results
- **WHEN** a search completes but no matching product is found in the results
- **THEN** the system SHALL wait for `searchInterval` milliseconds, then click search again, repeating until a match is found or `searchTimeout` expires

#### Scenario: Search timeout
- **WHEN** the search polling exceeds `searchTimeout` without finding a matching product
- **THEN** the system SHALL report an error and exit

### Requirement: Product identification in search results
The system SHALL identify the target product from search results by applying the "新品" (new items) filter and matching the product price against a configured range.

#### Scenario: New items filter applied
- **WHEN** search results are loaded
- **THEN** the system clicks the "新品" filter tab if available

#### Scenario: Product matched by price range
- **WHEN** the new-items-filtered search results contain a product whose price falls within `[priceMin, priceMax]`
- **THEN** the system clicks that product to navigate to its detail page

#### Scenario: Multiple price matches
- **WHEN** multiple products in the filtered results match the price range
- **THEN** the system SHALL select the first matching product

#### Scenario: No product matches price range
- **WHEN** no product in the filtered results matches the price range
- **THEN** the system SHALL continue polling (search again after `searchInterval`)

### Requirement: Seamless handoff to purchase flow
After entering the product detail page, the system SHALL seamlessly hand off to the existing purchase flow, skipping SKU selection when only a single default SKU exists.

#### Scenario: Enter product page and skip SKU selection
- **WHEN** the target product page loads
- **THEN** the system skips SKU selection and proceeds directly to clicking "立即购买"

#### Scenario: Product page with multiple SKUs
- **WHEN** the product page loads and the product has multiple SKU options
- **THEN** the system SHALL select the first/default SKU and proceed
