# SARkart Dependencies

## Node.js dependencies (server-side)

| Package | Installed | Latest | Status | Notes |
|---------|-----------|--------|--------|-------|
| express | 4.22.1 | 5.2.1 | ⚠️ Major behind | Express 5 is a breaking change (removed deprecated APIs, new router). Upgrade is optional — Express 4 is still maintained with security patches. |
| hbs | 4.2.1 | 4.2.1 | ✅ Latest | |
| handlebars | 4.7.9 | 4.7.9 | ✅ Latest | |
| ini | 1.3.8 | 7.0.0 | ⚠️ Major behind | Used only for parsing SAR config. v2+ changed the API. Low risk since it's barely used. May be removable. |
| nodemon | 3.1.14 | 3.1.14 | ✅ Latest | Dev only |
| ansi-regex | 6.0.1 | 6.x | ✅ Latest | Transitive security override |
| playwright | 1.59.1 | 1.59.1 | ✅ Latest | Dev only (benchmarks) |

## Browser-side libraries (static files in `/public/js/`)

| Library | File | Version | Latest | Status |
|---------|------|---------|--------|--------|
| Plotly.js (cartesian) | `plotly-cartesian-3.5.1.min.js` | 3.5.1 | ~3.5.x | ✅ Current |
| jQuery | `jquery-3.5.1.min.js` | 3.5.1 | 3.7.1 | ⚠️ Minor behind |
| Bootstrap JS | `bootstrap.min.js` | 4.x | 4.6.2 / 5.3.x | ⚠️ Minor behind (within 4.x) |
| html2canvas | `html2canvas.min.js` | unknown | 1.4.1 | ❓ Check file header |
| jsPDF | `jspdf.umd.min.js` | unknown | 2.5.x | ❓ Check file header |
| Font Awesome | `all.min.css` | 5.x | 6.x | ⚠️ Major behind (but 5.x still works fine) |

## Security audit

As of May 2026: **0 vulnerabilities** (`npm audit`).

## Recommendations

- **Express 4 → 5**: Not urgent. Express 4 still gets security patches. Upgrade when convenient.
- **jQuery 3.5.1 → 3.7.1**: Patch-level security fixes. Worth upgrading (just swap the file).
- **ini 1.x → 7.x**: Likely unused — consider removing from `package.json` entirely.
- **Font Awesome 5 → 6**: Cosmetic only. All icons used are available in both versions.
- **Bootstrap 4 → 5**: Would require markup changes (data-toggle → data-bs-toggle, etc.). Not worth it unless doing a full rewrite of the sidebar collapse logic.
