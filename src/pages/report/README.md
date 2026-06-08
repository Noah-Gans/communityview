# Property reports (Regrid batch)

Launch builds **do not** ship this feature. Code is kept for when your Regrid plan includes batch API access.

## Enable locally

```bash
REACT_APP_ENABLE_REGRID_BATCH_REPORTS=true npm start
```

## Files

| File | Role |
|------|------|
| `Report.js` | Route guard — redirects to `/map` when flag is off |
| `ReportRegridBatch.js` | Full batch UI (submit, poll, table, CSV) |
| `ReportTable.js` | Table presentation |
| `../../utils/regridBatchApi.js` | Batch job API client |
| `../../utils/regridBatchReport.js` | NDJSON → report rows / columns |
| `../../utils/reportSelectionPreview.js` | Map selection preview before batch runs |

## Re-enable for launch later

1. Confirm Regrid subscription includes batch.
2. Set `REACT_APP_ENABLE_REGRID_BATCH_REPORTS=true` in production env (or change default in `featureFlags.js`).
3. Reports tab and map “Report Builder” entry points are gated by the same flag.
