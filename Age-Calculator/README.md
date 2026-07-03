# Age Calculator

A premium, minimal, and fast age calculator web application built with vanilla HTML, CSS, and JavaScript. Installable as a Progressive Web App (PWA).

## Features

- **Accurate Age Calculation** – Years, months, days, weeks, hours, minutes, and seconds.
- **Age at Any Date** – Calculate age on a specific past date (useful for forms, exams, visas, jobs).
- **Live Seconds Counter** – Seconds update in real-time.
- **Next Birthday** – Shows days remaining and the exact date.
- **Day Born, Zodiac Sign, Leap Year** – Optional information displayed cleanly.
- **Dark Mode** – Light and dark themes, automatically remembers your preference.
- **PWA** – Installable on Android and desktop, works offline after first visit.
- **Fully Responsive** – Looks perfect from 320px to 1440px+.
- **No Dependencies** – Pure vanilla code. No frameworks, no libraries.
- **SEO Optimized** – Open Graph, Twitter Cards, Schema markup included.

## File Structure

```
Age-Calculator/
  index.html          – Main HTML with SEO and PWA tags
  style.css           – Premium minimal CSS with light/dark themes
  script.js           – All calculation logic and UI interactions
  manifest.json       – PWA manifest for installability
  service-worker.js   – Offline caching service worker
  favicon.svg         – SVG favicon
  icons/              – PNG icons in all required PWA sizes
  README.md           – This file
```

## Usage

Open `index.html` in any modern browser, or serve the folder:

```bash
# Python
python -m http.server 8080

# Node
npx serve -l 8080
```

Visit the URL and enjoy.

## PWA Installation

- **Android**: Open in Chrome → menu → "Install Age Calculator"
- **Desktop**: Open in Chrome/Edge → install icon in address bar
- **iOS**: Open in Safari → Share → "Add to Home Screen"

## License

MIT
