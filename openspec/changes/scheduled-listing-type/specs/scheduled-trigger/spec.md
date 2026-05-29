## MODIFIED Requirements

### Requirement: Scheduled purchase trigger
The system SHALL support setting a target time and automatically executing the purchase at that moment. When `listingType` is "scheduled", the preparation phase includes store search polling instead of direct product URL navigation.

#### Scenario: Purchase triggered at target time
- **WHEN** user sets a target time (e.g., `--at "2026-05-14 10:00:00"`)
- **THEN** the system starts preparation in advance, and fires the first click/purchase action exactly at the specified time

#### Scenario: Automatic lead time calculation
- **WHEN** using browser mode with scheduled trigger
- **THEN** the system calculates the required lead time (page navigation, SKU selection) and starts early enough to be on the checkout page before the target time

#### Scenario: Scheduled listing lead time calculation
- **WHEN** using browser mode with scheduled trigger and `listingType: "scheduled"`
- **THEN** the system starts at `targetTime - leadTime`, performs store search polling starting at `targetTime - searchLead`, and proceeds through the purchase flow once the product is discovered

#### Scenario: Target time in the past
- **WHEN** the specified target time is already in the past
- **THEN** the system SHALL report an error and exit immediately
