# Documented local change (regression)

| Field | Value |
|---|---|
| Change ID | CHG-01 |
| Date | <fill in> |
| Made by | Muhammad Huzaifa (Member 3, owner of FR-05) |
| What changed | Mattermost `FileSettings.MaxFileSize` raised from 1 MB (1,048,576 B) to 2 MB (2,097,152 B) |
| How | `MAX_FILE_SIZE_MB=2` applied by `global-setup.ts` through `PUT /api/v4/config/patch` (equivalent to System Console › Environment › File Storage › Maximum File Size) |
| Why | Allow larger attachments (simulated change request for FR-05; A1 QO-05 showed users hitting the size limit) |
| Affected requirement(s) | FR-05 (and the E2E workflow, which attaches a file) |
| Affected tests rerun | TC-C03, TC-C04, E2E-01 |
| Before results | `reports/regression-before/` |
| After results | `reports/regression-after/` |
| Outcome | <e.g. 3/3 passed before and after; boundary moved from 1,048,576 to 2,097,152 B> |

If a genuine defect is found and fixed (or a script error corrected), add a second row block (CHG-02)
and rerun the failed case on its own for confirmation: `RUN_NAME=confirmation npx playwright test -g "<TC-ID>"`.
