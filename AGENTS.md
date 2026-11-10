# Project architecture rules

- Executive budget selection lives in a pure frontend helper, matching physical goals by location_id and preserving inclusive daily proration; this isolates tab correctness without changing database functions.
- Executive compliance uses the active panel's net-sales KPI as its numerator; the unfiltered total retains the existing compliance RPC's budget.
- KPI amounts use the shared compact Colombian-peso formatter; exports and transaction-table money retain their full-value formats.
- Shared layout/cards have shrinkable widths, and wide tables and mobile tab bars own their scrolling; this prevents page-level horizontal overflow across modules.
- Wholesale composition dimensions each own their query and error state within the shared panel, so a failed dimension cannot block the other cards.
- Executive and wholesale views reuse extracted executive presentation and supplied-data variants of compliance/ranking rows; wholesale never fetches retail budgets or SKU metrics through these variants.
- Wholesale reuses supplied-data collection donuts and the store leaderboard podium/list; optional supplied content and medal controls leave retail rendering unchanged and avoid retail queries.
- Wholesale receivables isolate current balances and rolling monthly collections from period filters; each existing RPC has its own query/error state, with pure frontend totals, sorting and export mapping.
- Wholesale RFM shares a seller-keyed query and pure aggregation/filter helpers across the executive panel and customer tab; segment classifications come from the existing RPC, not duplicated frontend thresholds.