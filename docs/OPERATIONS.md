# Running it

How to look after CheapCart once it is on a VM. Everything here works on sample data today. Anything marked Proposed is a default the operator can change.

## Every week

1. `npm run report:freshness`. It exits with an error when most prices are too old. A daily timer runs the same check.
2. `npm run report:unmatched`. Add the common ones as aliases or items.
3. `npm run review -- list`, then `approve` or `reject` each waiting price.
4. `npm run review -- reports`. Check each reported price in the shop or against a receipt, and fix it with a new price row.
5. `npm run report:quality`. Look at whether an area is still ready.

## Every month

- Check that the daily backup archives are there (`ls /var/backups/cheapcart`) and copy the newest one off the VM.
- Restore the newest archive into a spare folder and look at it (see below).
- Run `npm audit` and update dependencies. Run `npm test` before restarting.
- Check the hosting bill.

## Backup and restore

`scripts/backup.sh` writes `cheapcart-<time>.tar.gz` with three folders: `data`, `runtime` and `config`. It keeps the newest 14.

To restore:

```bash
sudo systemctl stop cheapcart.service
scripts/restore.sh /var/backups/cheapcart/cheapcart-<time>.tar.gz
sudo systemctl start cheapcart.service
curl -s localhost:3000/api/health
```

The old folders stay next to the new ones as `*.before-restore-<time>`. Delete them by hand once you are happy. Config is not restored, it comes from git.

## When a shop complains about a price or its name

Proposed process:

1. Reply within 5 working days, from the contact address in the legal pages.
2. Check the price against the shop. If it is wrong, add a corrected price row and say so.
3. If the shop asks to be removed, set `active` to `false` for it in `shops.csv`. It stops showing straight away.
4. Write down the date and what was done. No personal details beyond what the shop sent.

The contact address and the time limit are up to whoever runs the service. Check the local rules on showing shop names before launch.

## When a user asks about their data

The app holds no account and no location, so there is usually nothing to find. Search `unmatched.csv` and `reports.csv` for the text the person says they typed, and delete the rows if they ask. Answer within the legal time limit for the launch country (Proposed: one month).

## Load

`npx tsx scripts/loadtest.ts http://localhost:3100 10 20` sends compare requests from 20 virtual users for 10 seconds and prints the timings. Each virtual user has its own fake address, so the rate limiter allows about 60 requests per minute for each of them. Run it against your own copy, never someone else's site.
