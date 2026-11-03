# Roadmap

What is built, what isn't, and where help would be useful. Everything runs on made-up sample data. Nothing is deployed.

## The goal

For every item on a shopping list, tell you where to buy it close to you, so you pay less.

Two things decide whether that works: fresh, legal price data, and whether splitting a list across shops saves enough to be worth the extra stops. The app shows the per-item answer next to the best single shop so you can see the difference and choose.

## Built

| Area | What exists |
| --- | --- |
| List and compare | Typed list with suggestions, postcode or device location, distance setting, cheapest shop per item, total, best single shop, saving on the items both sides cover, results by item and by shop, map links |
| Price data | CSV import with checks for bad rows and big jumps, price history, a 14-day freshness limit, freshness and quality reports, a `PriceSource` interface |
| Sent-in prices | Text receipt reading (in memory, personal details dropped), confirm screen, item matching, outlier and abuse checks, a review queue, "price looks wrong" reports |
| Running it | Tests for the logic and every request handler, `setup_service.sh`, a size-limited log, backup and restore scripts, request size limits, basic security headers, a load test script, VS Code debug configs |

## Not built

| Area | Why |
| --- | --- |
| Real prices | There is no approved price source. Hand-collected prices, prices people send in, and open or licensed data are the intended order |
| Reading receipt photos | Needs a vision provider behind the `ReceiptReader` interface |
| A database | CSV files are enough for now. PostgreSQL is the plan when they stop being enough |
| Real launch area | The areas in `config/areas.json` are made up |
| Second language | Waits for an area that needs one |
| Tested on a real server | `setup_service.sh` has never been run on a real VM, and there is no HTTPS, monitor or Content-Security-Policy yet |
| Accessibility | Labels and focus styles are in, but nobody has tested with a screen reader |

## Possible later

Each of these needs its own decision. None is promised.

- Other products beyond groceries.
- A native mobile app, if the web app isn't enough.
- Route planning, barcode scanning, loyalty card prices and stock information.

## Where help is useful

- A `PriceSource` for an open price data feed, with the licence checked first.
- A real `ReceiptReader`.
- A browser test suite for the main flow.
- Screen reader and keyboard testing.
- Better item matching, using the unmatched report.
