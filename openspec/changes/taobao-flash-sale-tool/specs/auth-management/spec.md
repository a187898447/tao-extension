## ADDED Requirements

### Requirement: Interactive login via browser
The system SHALL launch a browser window for the user to manually log in, then automatically extract session credentials after successful login.

#### Scenario: Successful login and credential extraction
- **WHEN** user completes login in the browser window (including any CAPTCHA or 2FA)
- **THEN** the system detects login success, extracts cookies and relevant tokens, and persists them to a local credential file

#### Scenario: Login timeout
- **WHEN** the user does not complete login within 5 minutes
- **THEN** the system SHALL close the browser and report "login timeout"

#### Scenario: Login detection
- **WHEN** the browser navigates to the user's account page or Taobao homepage with authenticated state after login
- **THEN** the system SHALL detect the authentication by checking for the presence of login cookies

### Requirement: Credential persistence
The system SHALL store extracted credentials in a local file and load them on subsequent runs.

#### Scenario: Load saved credentials
- **WHEN** a credential file exists and the session has not expired
- **THEN** the system loads credentials from the file without requiring a new login

#### Scenario: Credential file permissions
- **WHEN** the system writes credentials to disk
- **THEN** the file SHALL be created with restrictive permissions (owner read/write only, mode 600)

#### Scenario: Multiple credential profiles
- **WHEN** user specifies a profile name via `--profile`
- **THEN** the system SHALL store and load credentials from `~/.taobao-tool/credentials/<profile>.json`

### Requirement: Credential validity check
The system SHALL verify credential validity before attempting a purchase.

#### Scenario: Valid credentials pass check
- **WHEN** a lightweight authentication check API call succeeds
- **THEN** the system proceeds with the purchase

#### Scenario: Expired credentials
- **WHEN** the validity check fails due to expired session
- **THEN** the system SHALL report "session expired" and prompt user to re-login

### Requirement: Credential security
The system SHALL never display or log credential values in plain text.

#### Scenario: Credential masking in logs
- **WHEN** the system writes log output
- **THEN** all cookie and token values are masked as `***`
