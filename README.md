# SEN-420 Assignment 2 – Automated Testing of Mattermost

Playwright (TypeScript) suite: **12 functional + 3 non-functional + 1 end-to-end = 16 tests**, run against a local
Mattermost preview server in GitHub Codespaces (authorized test environment).

| Folder / file | Purpose |
|---|---|
| `tests/module-a-auth-account.spec.ts` | Member 1 Aimen – FR-01 login, FR-06 registration (TC-A01…A04) |
| `tests/module-b-messaging-search.spec.ts` | Member 2 Bakhtawar – FR-02 messaging, FR-04 search (TC-B01…B04) |
| `tests/module-c-channels-files.spec.ts` | Member 3 Muhammad Huzaifa – FR-03 channels, FR-05 files (TC-C01…C04) |
| `tests/nfr/` | NFR-01 performance (Bakhtawar), NFR-02 security (Huzaifa), NFR-03 usability (Aimen) |
| `tests/e2e/` | E2E-01 = Assignment 1 critical workflow: sending a message in a private channel |
| `global-setup.ts` | Creates admin, team, users, channels; applies test config |
| `test-data/` | Users, inputs, NFR thresholds, requirement traceability |
| `utils/` | API client, UI helpers + selectors, evidence helpers |
| `reports/<run>/` | Original execution reports (HTML, JSON, JUnit, NFR JSON, screenshots) |

## Prerequisites
Docker and Node.js 18+ (both preinstalled in the default GitHub Codespaces image).

## Run instructions
```bash
npm ci                                  # or: npm install
npx playwright install --with-deps chromium
npm run mm:start                        # starts Mattermost on http://localhost:8065 (optional tag: bash scripts/start-mattermost.sh 10.5)

npm run test:smoke                      # 1) smoke suite: TC-A01, TC-B01, TC-C01
npm run test:all                        # 2) all 16 tests
npm run summary -- full                 # pass/fail/blocked counts + reports/full/summary.csv

npm run test:regression:before          # 3) regression subset (FR-05 + E2E) at MaxFileSize = 1 MB
npm run test:regression:after           #    same subset after the documented change (MaxFileSize = 2 MB)

npx playwright show-report reports/full/html --host 0.0.0.0 --port 9323   # view the HTML report
```
Per member: `npm run test:memberA` / `test:memberB` / `test:memberC`. One test: `npx playwright test -g "TC-A02"`.

If the server already has an admin account, pass it: `MM_ADMIN_USER=... MM_ADMIN_PASS=... npm run test:all`.

## Test environment configuration (applied by global-setup.ts)
- `FileSettings.MaxFileSize` = `MAX_FILE_SIZE_MB` (default 1 MB) – makes the FR-05 boundary testable.
- Open sign-up enabled (`EnableOpenServer`, `EnableUserCreation`) – needed for FR-06 registration tests.
- Tutorials/onboarding tours disabled for test users so they do not cover the UI.
- Test accounts: `qa.alice`, `qa.bob`, `qa.eve` (password `Qa#Pass2026`), team `qa-team`, channels `qa-scratch` (public) and `qa-private` (private; eve is **not** a member). Tests also create their own `qa-test-*`, `qa-e2e-*`, `qa-test02-*` channels and `bvam*` sign-up accounts each run.

## Script errors vs application defects
UI selectors are centralised in `utils/ui.ts`. If a test fails because an element cannot be found, open the failing
test in UI mode (`npx playwright test --ui --ui-host 0.0.0.0 --ui-port 8080`, then open port 8080 from the Ports tab),
use its "Pick locator" button, or inspect the element with browser DevTools on the forwarded port 8065.
That is a **script error** – fix the selector and rerun.
A failure where the application returns the wrong status / data is a potential **application defect** – record it.

## Reused code / references
- Playwright Test and `@axe-core/playwright` (official documentation examples for config, `AxeBuilder`).
- Mattermost REST API v4 reference (https://api.mattermost.com) for endpoints used in setup and assertions.
