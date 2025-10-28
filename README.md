# Splice Sample Browser

A minimalist, clean alternative frontend for the popular [Splice](https://splice.com/features/sounds) sample library. It does not require any kind of authentication, and contains all of the most important features of the regular desktop app (including drag-and-drop).

## Features

- OpenAI Sans typography
- Optimized performance (virtualized list, memoized rows, cached waveforms)
- No authentication required
- Drag & drop
  - Desktop: direct WAV drag into DAW (local write via Tauri)
  - Web: WAV/MP3 DownloadURL for many targets
- Minimalist black UI with subtle, fast glassmorphic animations
- Keyboard + mouse workflow: Play on hover (optional), Auto‑play on Arrow keys (optional)
- Exact‑match boosting + query highlighting
- Adjustable waveform lane width; accurate, cached waveforms
- Duration + BPM range filters, key proximity sort
- Pitch/time preview
  - Rate (0.5x–2.0x) and ±12 semitone pitch (preview only)
  - Dynamic key badge (yellow) updates with pitch
  - Dynamic BPM badge (blue) updates with rate (rounded)
- Exclusive playback (only one sample plays at a time)
- Pagination or Infinite scroll (toggleable)
- Refined dropdowns (Instruments/Genres/Tags) with unique SVG icons
- Diagnostics modal and error boundary
- Cross-platform: Web and Desktop (Windows/macOS/Linux via Tauri)

## Keyboard Shortcuts

- **/** - Focus search bar
- **Esc** - Clear search  
- **Space** - Play/Pause current sample
- **H** - Open help
- **Ctrl+,** (or Cmd+, on Mac) - Open settings
- **↑/↓** - Move through results (optional auto‑play toggle)

## Download & Install

### Pre-built Releases

Download the latest release for your operating system from the [Releases](https://github.com/mcinderelle/splice/releases) section.

1. Go to the [Releases](https://github.com/mcinderelle/splice/releases) page
2. Download the installer for your OS:
   - **Windows**: `splice_X.X.X_x64-setup.exe`
   - **macOS**: `Splice_X.X.X_aarch64.dmg` or `Splice_X.X.X_x64.dmg`
   - **Linux**: `splice_X.X.X_amd64.deb` or `splice_X.X.X_amd64.AppImage`
3. Run the installer and follow the on-screen instructions

### First Time Setup

Desktop only:
1. On first launch you’ll be prompted to configure your sample directory
2. Choose a folder where downloads will be saved
3. Optionally enable placeholder files for faster drag-and-drop
4. Click "Apply" to save your settings

Web:
- No local path configuration required. Download opens the preview audio in a new tab. Drag provides WAV/MP3 DownloadURL where supported.

## Building from Source

### Prerequisites

- Node.js (v18 or higher)
- Rust (for Tauri builds)
- Platform-specific tools:
  - **Windows**: Visual Studio C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: Build essentials (`sudo apt install build-essential` or equivalent)

### Install Development Dependencies

```bash
# Install Node.js dependencies
npm install
```

### Development Mode

Run the app in development mode with hot reload:

```bash
npm run dev
```

This will start the web version at `http://localhost:1420/`

### Build Desktop App

Build the Tauri desktop application:

```bash
# Development build
npm run tauri dev

# Production build
npm run tauri build
```

The built application will be in `src-tauri/target/release/` directory.

### Build for Multiple Platforms

To build for all platforms, you can use:

**Windows:**
```bash
npm run tauri build -- --target x86_64-pc-windows-msvc
```

**macOS:**
```bash
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin
```

**Linux:**
```bash
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

## How It Works

1. **Search** – Type in the search bar; spinner shows while fetching. Exact matches are boosted and highlighted. Transient errors keep the last results.
2. **Preview** – Click play, enable Play on hover, or Auto‑play on Arrow keys (optional). Only one row plays at a time; the current row shows a Stop button.
3. **Filter** – Use inline sliders for Duration/BPM; toggle Favorites; optionally sort by key proximity. Instruments/Genres/Tags menus open as popovers.
4. **Waveform** – Accurate waveform renders responsively; width is adjustable.
5. **Pitch/Time** – Adjust Rate and Pitch. Key badge (yellow) and new BPM (blue) update in real time.
6. **Drag & Drop** – Desktop: drag WAV into your DAW (local write). Web: WAV/MP3 DownloadURL where supported.
7. **Download** – Desktop: saves to configured sample folder. Web: opens preview audio in a new tab.
8. **Pagination/Infinite** – Toggle in header to switch between classic pagination and infinite scroll.

## Project Structure

```
splicedd/
├── src/                 # Frontend source code
│   ├── ui/             # UI components and styles
│   ├── splice/         # Splice API integration
│   └── utils/          # Utility functions
├── src-tauri/          # Rust backend for Tauri
│   └── src/            # Tauri commands
└── public/             # Static assets
```

## Roadmap

- Label/pack filters and exclude‑tag search
- Key/scale‑aware recommendation sort
- Queue/favorites export (CSV/text)
- Offline cache of decoded previews

## License

This project is open source. Check the LICENSE file for details.

## Credits

**Developed by [Mayukhjit Chakraborty](https://github.com/mcinderelle) - Made without AI**
