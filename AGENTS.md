# Project architecture rules

- Black Friday Live owns a scoped broadcast theme and uses only the existing bf_live RPC on a 20-second query interval; shared permission matching for its menu and route keeps access consistent without database changes. Its budget renders supplied blocks with shared animated amounts and pure Bogota month-progress/pace helpers so display thresholds remain testable without altering RPC calculations.

- Executive budget selection lives in a pure frontend helper, matching physical goals by location_id and preserving inclusive daily proration; this isolates tab correctness without changing database functions.
- Executive compliance uses the active panel's net-sales KPI as its numerator; the unfiltered total retains the existing compliance RPC's budget.
- KPI amounts use the shared compact Colombian-peso formatter; exports and transaction-table money retain their full-value formats.
- Shared layout/cards have shrinkable widths, and wide tables and mobile tab bars own their scrolling; this prevents page-level horizontal overflow across modules.
- Wholesale composition dimensions each own their query and error state within the shared panel, so a failed dimension cannot block the other cards.
- Executive and wholesale views reuse extracted executive presentation and supplied-data variants of compliance/ranking rows; wholesale never fetches retail budgets or SKU metrics through these variants.
- Wholesale reuses supplied-data collection donuts and the store leaderboard podium/list; optional supplied content and medal controls leave retail rendering unchanged and avoid retail queries.
- Wholesale receivables isolate current balances and rolling monthly collections from period filters; each existing RPC has its own query/error state, with pure frontend totals, sorting and export mapping.
- Wholesale RFM shares a seller-keyed query and pure aggregation/filter helpers across the executive panel and customer tab; segment classifications come from the existing RPC, not duplicated frontend thresholds.
- NetSuite customer creation uses a preview/confirmation flow invoking the existing edge function; its response owns customer data and order-state updates, avoiding frontend writes for this action.
- Document conflicts in NetSuite creation require a fresh preview with the chosen document, and confirmation reuses that choice; table document sources come from the supplied billing fields.
- Billing-report state maps (tab lists, card predicates, filter options, badge labels, unfiltered totals) live in a pure frontend helper so counter and label rules stay testable without touching database functions.
- Product behavior enriches complete RPC rows by product_id from the independently cached, paginated identifier view; search runs after enrichment so parent/reference matches are not discarded by RPC filtering.
- Rebajas and product behavior use fetchAllRpc with stable ordering and optional accumulated progress; this keeps full RPC pagination and error propagation in one implementation.- Store discount reporting lives in one reusable DescuentosTiendasReport component used by /descuentos-tiendas and the /pedidos "vista" tab; it owns its filters, RPC queries and Excel export so both entry points stay identical.
- Catalog JPG cards are built off-screen as fixed 1080x1350 HTML (src/lib/catalogo-ficha.ts) and rasterized with html-to-image; images load via fetch→blob first to avoid CORS-tainted exports.
