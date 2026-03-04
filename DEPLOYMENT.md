# Deployment (Cloudflare Pages)

This repository is ready for Cloudflare Pages as a static site.

## What to upload

Upload the repository root contents directly (not inside an extra parent folder):

- `index.html`
- page folders (`apps/`, `downloads/`, `auth/`, `hub/`, `web-apps/`)
- `assets/`
- `_redirects`
- `_headers`
- `robots.txt`, `sitemap.xml`, `ads.txt`, `favicon.ico`

## Cloudflare Pages (recommended)

1. Create a new Pages project and connect this GitHub repo.
2. Framework preset: `None`.
3. Build command: leave empty.
4. Build output directory: `.` (repo root).
5. Deploy.
6. Keep `_redirects` and `_headers` at the root for redirects and response headers.

## Other static hosts (cPanel, S3+CloudFront, etc.)

1. Upload all files/folders to the web root (`public_html` or bucket root).
2. Ensure `index.html` is the default document.
3. If host supports redirect/header rules, replicate `_redirects` and `_headers` in host-native format.

## Runtime requirement

`/assets/js/firebase-config.js` must be present and readable at runtime.
