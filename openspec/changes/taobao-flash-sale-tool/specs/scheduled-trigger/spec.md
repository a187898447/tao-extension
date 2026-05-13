## ADDED Requirements

### Requirement: Scheduled purchase trigger
The system SHALL support setting a target time and automatically executing the purchase at that moment.

#### Scenario: Purchase triggered at target time
- **WHEN** user sets a target time (e.g., `--at "2026-05-14 10:00:00"`)
- **THEN** the system starts preparation in advance, and fires the first click/purchase action exactly at the specified time

#### Scenario: Automatic lead time calculation
- **WHEN** using browser mode with scheduled trigger
- **THEN** the system calculates the required lead time (page navigation, SKU selection) and starts early enough to be on the checkout page before the target time

#### Scenario: Target time in the past
- **WHEN** the specified target time is already in the past
- **THEN** the system SHALL report an error and exit immediately

### Requirement: Countdown display
The system SHALL display a countdown to the target time so the user can monitor progress.

#### Scenario: Countdown output
- **WHEN** the system is waiting for the target time
- **THEN** it periodically outputs the remaining time to the console

### Requirement: Precision timing
The system SHALL use millisecond-precision timing for the scheduled trigger.

#### Scenario: Exact moment trigger
- **WHEN** the target time arrives
- **THEN** the system initiates the first purchase action within single-digit milliseconds of the target, using a pre-warmed `setTimeout` or equivalent mechanism
