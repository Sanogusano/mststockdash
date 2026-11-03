# Project architecture rules

- Executive budget selection lives in a pure frontend helper, matching physical goals by location_id and preserving inclusive daily proration; this isolates tab correctness without changing database functions.
- Executive compliance uses the active panel's net-sales KPI as its numerator; the unfiltered total retains the existing compliance RPC's budget.
- KPI amounts use the shared compact Colombian-peso formatter; exports and transaction-table money retain their full-value formats.
- Shared layout/cards have shrinkable widths, and wide tables and mobile tab bars own their scrolling; this prevents page-level horizontal overflow across modules.
- Wholesale composition dimensions each own their query and error state within the shared panel, so a failed dimension cannot block the other cards.