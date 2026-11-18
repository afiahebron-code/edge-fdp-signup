# Edge FDP chapter sign-up

Sign-up sheet for the 11 chapters of the Edge Field Development Plan, 2 people per chapter, first come first served.

- `docs/` — the website (GitHub Pages): sign-up, success, who-picked-what, admin.
- `worker/` — Cloudflare Worker + D1 database that stores sign-ups and enforces the 2-per-chapter limit.

Class link: https://edge-fdp-signup.edgefdp.workers.dev  ·  Test link: add `?test`  ·  Admin: `/admin.html` (password = repo secret `ADMIN_KEY`).
