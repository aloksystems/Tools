# Number Counter Animation Tool

A web-based tool to create animated number counter videos using HTML, CSS, and JavaScript. No installation required — just open the page in any modern browser.

## Features

- **Custom range** — Set any whole-number start and end value
- **Custom step** — Count by 1, 5, 100, or any other whole number
- **Text color** — Pick any color for the number (color picker + hex input)
- **Background color** — Choose any background color
- **Font size** — Adjustable, with automatic fitting for large numbers
- **Font style** — Inter plus seven system font families
- **Animation length** — Control how long the count-up takes
- **End text** — Add a custom suffix like `+`, `Lakh`, or `Cr`
- **Quick presets** — One-click end values for 1K, 10K, 1L, 10L, and 1Cr
- **Optional sound** — Soft ticks and a finish chime in the live preview
- **Download as video** — Export a silent 16:9 WebM or MP4 clip, depending on browser support

## How to Use

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, or Safari)
2. Set your desired **start** and **end** numbers, plus an optional step
3. Pick **text color** and **background color**
4. Adjust **font size**, **font style**, and **animation length**
5. Click **Start counting** to preview
6. Click **Download video** to save the animation

## Files

- `index.html` — Page structure and content
- `style.css` — Theme, layout, and component styles
- `script.js` — Counting, sound, and video export logic

## Browser Support

Works in current versions of Chrome, Firefox, Edge, and Safari. Video export requires MediaRecorder and canvas capture support; the file format is chosen by the browser.

## No Dependencies

Pure HTML, CSS, and JavaScript — no frameworks, no libraries, no installation needed.
