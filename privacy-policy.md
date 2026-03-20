# Privacy Policy for Lab Policy Whitelist

Effective date: March 20, 2026

Lab Policy Whitelist is a Chrome extension used to enforce whitelist-only browsing on shared or managed lab computers. This privacy policy explains what data the extension may handle, how that data is used, and when it may be shared.

## Summary

The extension stores configuration and session data locally in the browser. It may also send limited usage and administration data to operator-configured services such as Firebase, Google Analytics, or a custom backend when those services are enabled in the extension configuration.

## Data the extension may collect or process

The extension may collect, store, or process the following categories of data:

- Browsing data, including visited URLs, page titles, whether a page was allowed or blocked, and attempted blocked URLs
- User-provided identifiers, including class code and roll number
- Device and lab identifiers, including a generated device ID and PC code
- Admin configuration data, including whitelist entries and hashed admin password data
- Extension status data, including install, heartbeat, and uninstall status events when a backend is configured
- ChatGPT prompt text submitted on `chatgpt.com`, when prompt logging is enabled by the installed extension behavior

## How data is collected

The extension collects data in the following ways:

- From browser events used to determine whether a visited page is allowed or blocked
- From information entered by users or administrators in the extension interface, such as class code, roll number, PC code, and whitelist rules
- From extension-generated identifiers, such as a random device ID stored in `chrome.storage.local`
- From operator-configured remote services used to validate class wishlists or receive logs and heartbeat events

## How data is used

The extension uses data to:

- Enforce whitelist-only browsing rules
- Show the current class code, roll number, and PC code in the extension UI
- Load class-specific whitelist data from Firebase Firestore
- Log browsing activity for lab or school administration
- Log submitted ChatGPT prompts for lab or school administration
- Monitor extension installation and heartbeat status on managed devices
- Support troubleshooting, auditing, and policy enforcement by the extension operator

## Where data is stored

### Stored locally in the browser

The extension stores the following data in `chrome.storage.local` on the device:

- Whitelist data
- Class wishlist cache
- Student information such as class code and roll number
- PC code
- Generated device ID
- Admin password hash and salt
- Setup state and extension UI preferences
- Cached Firebase authentication token data
- Last heartbeat status

### Sent to remote services when configured

Depending on how the extension is configured by the operator, data may be transmitted to:

- Google Firebase Authentication, to obtain anonymous authentication tokens for Firestore access
- Google Firebase Firestore, to read class wishlist data and write browsing or prompt logs
- Google Analytics, to record site visit analytics events
- A custom operator backend, to record install, heartbeat, or uninstall events

If these remote services are not configured or are left blank, related transmissions may be disabled, but local browser storage may still be used.

## Data sharing

The extension does not sell personal information.

The extension may share data with the following parties:

- The school, lab, organization, or administrator operating the extension
- Google Firebase services, if the operator enables Firebase
- Google Analytics, if the operator enables Google Analytics
- A custom backend service provider chosen by the operator, if configured

Data shared with these parties may include browsing URLs, page titles, allow/block status, class code, roll number, PC code, device ID, timestamps, and ChatGPT prompt text, depending on the enabled features and configuration.

## Data retention

Local data remains in browser storage until it is changed, cleared, or the extension is removed. Remote data retention is determined by the operator of the configured Firebase project, analytics property, or backend service.

## Security

The extension stores the admin password as a hash with salt rather than as plain text. However, no method of electronic storage or transmission is completely secure, and the extension operator is responsible for securing any connected backend services and published configuration.

## Children and school use

This extension may be used in school or lab environments on shared devices. The organization deploying the extension is responsible for obtaining any required notices, consents, or approvals for student or user data.

## Changes to this policy

This privacy policy may be updated from time to time. The latest published version should always reflect the current behavior of the extension and any connected services.

## Contact

For questions about this privacy policy or the operation of this extension, contact the extension publisher or the organization administering the lab environment.
