---
name: Obsidian Violet
colors:
  surface: '#10131e'
  surface-dim: '#10131e'
  surface-bright: '#363945'
  surface-container-lowest: '#0b0e18'
  surface-container-low: '#181b26'
  surface-container: '#1c1f2b'
  surface-container-high: '#272935'
  surface-container-highest: '#313440'
  on-surface: '#e0e1f1'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e0e1f1'
  inverse-on-surface: '#2d303c'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#cebdff'
  on-tertiary: '#381385'
  tertiary-container: '#9b7fed'
  on-tertiary-container: '#31057e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e8ddff'
  tertiary-fixed-dim: '#cebdff'
  on-tertiary-fixed: '#21005e'
  on-tertiary-fixed-variant: '#4f319c'
  background: '#10131e'
  on-background: '#e0e1f1'
  surface-variant: '#313440'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a high-performance, studio-grade aesthetic for a modern media extraction and transcoding utility. Combining dark minimalism with refined technical elegance, it removes the clunky, ad-heavy tropes of legacy video downloaders, replacing them with the precision feel of professional developer and creative tools (e.g., Linear, Raycast, and DaVinci Resolve).

### Brand Personality & Emotional Core
- **Precision & Reliability:** Unwavering execution, transparent progress metrics, zero clutter.
- **Stealth Luxury:** Deep obsidian and charcoal backdrops offset by crystalline violet highlights.
- **Empowerment:** Fast, friction-free conversion workflows designed for power users, video editors, and archivists alike.

### Visual Style
A tailored blend of **Minimalist Dark Mode** and **Sleek Technical SaaS**:
- Deep obsidian foundation layers with layered tonal surfaces (`#0B0D13` through `#1A1F2E`).
- Hairline architectural borders (`#262D42`) defining structure without heavy container weight.
- Controlled electric violet energy lines, subtle inner glows on active focus elements, and high-visibility status indicators.

## Colors

The palette is engineered specifically for prolonged, low-light desktop and mobile sessions. The deep charcoal/obsidian base reduces luminance stress while providing infinite contrast for progress visualization and format badges.

### Color Architecture
- **Obsidian Canvas Base (`#0B0D13`):** Canvas bedrock and root application frame.
- **Layer 1 Surface (`#121520`):** Default card, panel, and sidebar background.
- **Layer 2 Elevated Surface (`#1A1F2E`):** Interactive inputs, nested containers, dropdown sheets, and modal viewports.
- **Structural Stroke / Hairline (`#262D42`):** Primary border token for soft visual segregation.
- **Primary Electric Violet (`#8B5CF6` / `#7C3AED` hover):** Core brand actions, primary CTAs, format selectors, and speed burst highlights.
- **Secondary Active Emerald (`#10B981`):** Complete downloads, active socket connections, valid URL parses, and health pings.
- **Tertiary Soft Iris (`#A78BFA`):** Focused selection states, keyboard shortcut tooltips, and secondary metadata badges.
- **Functional State Accents:**
  - Alert / Extraction Error: `#EF4444`
  - In-Progress Transcode Warning / Re-encoding: `#F59E0B`
  - Text Primary: `#F9FAFB`
  - Text Muted: `#94A3B8`

## Typography

Typography balances Swiss clarity with developer-grade technical rigor:
- **Headlines (Geist):** Clean, geometric, geometric-grotesque authority with optical tightness for large UI titles and status headlines.
- **Interface & Content Body (Inter):** Highly legible across screens, maintaining optical balance for video metadata, format descriptions, and tooltips.
- **Data & Telemetry (JetBrains Mono):** Reserved for bitrates (e.g., `320 kbps`), resolution tags (`4K UHD`, `1080p60`), transfer rates (`14.2 MB/s`), output paths, and CLI parameters.

## Layout & Spacing

The layout adapts seamlessly across web, desktop shell (Electron/Tauri), and mobile wrappers (iOS/Android):
- **Desktop/Web Framework:** 12-column responsive grid with a persistent 240px collapsable navigation rail for queue, history, presets, and FFmpeg configuration. The main workspace adheres to an 8px modular baseline.
- **Mobile/Compact Framework:** Single-column fluid stack with bottom navigation bar for core conversion, active queue, and settings.
- **Spacing Rhythm:** Standard spacing intervals govern queue item distance (`space-sm` for compact lists, `space-md` for standard card lists) and internal container padding (`space-md` to `space-lg`).

## Elevation & Depth

Visual hierarchy uses tonal surface layering combined with low-contrast structural outlines rather than heavy drop shadows:

- **Level 0 (Canvas):** `#0B0D13` base floor. Completely flat.
- **Level 1 (Panels & Inactive Queue Cards):** `#121520` with a 1px border of `#262D42`.
- **Level 2 (Active Transcoding Containers & Inputs):** `#1A1F2E` with an inner border highlight (`rgba(255, 255, 255, 0.04)` top edge) and outer border `#262D42`.
- **Level 3 (Modals, Overlays, Dropdowns):** `#1A1F2E` with a subtle diffused shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.65), 0 0 0 1px #262D42`.
- **Electric Accent Glow:** Used strictly for active processing nodes and focused primary search/URL fields: an inner glow of `inset 0 0 0 1px #8B5CF6` paired with an ambient violet bloom `0 0 16px -2px rgba(139, 92, 246, 0.25)`.
- **Success Bloom:** Completed task bars receive an ambient emerald halo: `0 0 12px -2px rgba(16, 185, 129, 0.3)`.

## Shapes

The design system utilizes rounded shapes (`roundedness: 2`) to balance modern consumer software warmth with engineered precision:
- **Base Components (0.5rem / 8px):** Standard buttons, text fields, dropdown triggers, and audio/video badges.
- **Containers & Cards (1rem / 16px):** Download queue cards, format selection grids, video thumbnail wrappers, and transcode log consoles.
- **Modal Dialogs & Floating Panels (1.5rem / 24px):** Quick-paste overlay, batch configuration modal, and floating mobile bottom sheets.
- **Pill Elements (Full Radius):** Connection status indicators, resolution chips (`4K`, `1080p`), and download speed tags.

## Components

### 1. Primary Action & Paste Input Bar
- **Architecture:** Large high-priority container (`#121520`) with 1px `#262D42` border and `rounded-xl`.
- **Input Field:** Borderless inside the container, featuring a clean clipboard icon prefix, placeholder `"Paste video, playlist, or audio URL..."`, and an inline keyboard shortcut tag (`⌘V` / `Ctrl+V`).
- **Submit Button:** Integrated inside the right boundary of the field. Electric Violet (`#8B5CF6`) background with white typography, icon-supported (`Sparkles` or `ArrowRight`), active scale animation (`scale: 0.98` on click).

### 2. Download Queue & Progress Card
- **Layout:** Horizontal layout on desktop, stacked on mobile. Left: Video thumbnail with embedded timestamp chip (`label-mono-sm`). Center: Video title (`body-md`, semibold), codec info (`H.264 / AAC`), source icon (YouTube, Vimeo, etc.), and mono download metric row (`14.8 MB/s • 45.2 MB / 120 MB • ETA 00:08`).
- **Progress Track:** 4px ultra-sleek line across the bottom border of the card. Inactive track: `#262D42`. Active fill: `#8B5CF6` linear gradient to `#A78BFA` with animated sheen. Completed fill: Solid `#10B981`.
- **Controls:** Minimal icon buttons (`Pause`, `FolderOpen`, `Trash2`) in `#94A3B8` hover-transitioning to `#F9FAFB`.

### 3. Chips & Format Badges
- **Format Chips (Resolution / Extension):** `rounded-md` with `label-code` typography. Default: Background `#1A1F2E`, border `1px solid #262D42`, text `#94A3B8`.
- **Selected State:** Border `#8B5CF6`, background `rgba(139, 92, 246, 0.12)`, text `#F9FAFB`.
- **Status Badges:** Pill-shaped (`rounded-full`), containing a 6px pulsating dot. Emerald (`#10B981`) for "Transcoded / Ready", Violet (`#8B5CF6`) for "Downloading", Amber (`#F59E0B`) for "FFmpeg Muxing".

### 4. Form Controls & Checkboxes
- **Checkboxes:** 18x18px, `rounded-md`, border `1.5px solid #262D42`, background `#121520`. Checked state: `#8B5CF6` background with sharp white checkmark icon.
- **Segmented Controls (Video / Audio Only / Subtitles):** Background `#0B0D13`, border `1px solid #262D42`, sliding thumb `#1A1F2E` with subtle inner white highlight.

### 5. Terminal / CLI transcode drawer (Product-Specific)
- **Log Drawer:** Collapsible collapsible pane at viewport bottom displaying real-time yt-dlp/FFmpeg output.
- **Styling:** `#0B0D13` background, monospace `JetBrains Mono` at `11px`, with stream tags colored systematically (Violet for stdout, Amber for warnings, Red for stderr).