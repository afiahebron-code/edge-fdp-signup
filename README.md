# Edge FDP chapter sign-up

Sign-up sheet for the 11 chapters of the Edge Field Development Plan, 2 people per chapter, first come first served.

- `docs/` — the website (GitHub Pages): sign-up, success, who-picked-what, admin.
- `worker/` — Cloudflare Worker + D1 database that stores sign-ups and enforces the 2-per-chapter limit.

Admin page: `admin.html` (password is the Worker secret `ADMIN_KEY`).
