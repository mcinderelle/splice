# Splice Sample Browser

A minimalist, clean alternative frontend for the popular [Splice](https://splice.com/features/sounds) sample library. It does not require any kind of authentication, and contains all of the most important features of the regular desktop app (including drag-and-drop).

## Features

- OpenAI Sans typography
- Optimized performance (virtualized list, memoized rows, cached waveforms)
- No authentication required
- Full drag-and-drop support (desktop) and web-friendly drag (WAV/MP3 DownloadURL)
- Minimalist black and white design with subtle, fast animations
- Keyboard + mouse workflow: play on hover (optional), auto‑play on Arrow keys (optional)
- Exact‑match boosting + query highlighting
- Adjustable waveform lane width; accurate, cached waveforms
- Duration + BPM range filters, key proximity sort
- Pitch/time preview: playback rate (0.5x–2.0x) and ±12 semitone pitch (preview only)
- Download button with animated feedback
- Diagnostics modal and error boundary
- Cross-platform support (Web, Windows/macOS/Linux via Tauri)

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

1. When you first launch the app, you'll be prompted to configure your sample directory
2. Choose a folder where you want downloaded samples to be saved
3. Optionally enable placeholder files for faster drag-and-drop
4. Click "Apply" to save your settings

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

1. **Search** – Type in the search bar; spinner shows while fetching. Exact matches are boosted and highlighted.
2. **Preview** – Click play, or enable “Play on hover” / “Auto‑play on Arrow keys” in the header controls.
3. **Filter** – Use inline sliders for Duration/BPM; toggle Favorites; optionally sort by key proximity.
4. **Waveform** – Accurate waveform renders in a fixed lane; adjust width from the header.
5. **Pitch/Time** – For quick audition, adjust Rate and Pitch sliders in the row (preview‑only).
6. **Drag & Drop** – Desktop: drag WAV into your DAW. Web: provides WAV/MP3 DownloadURL for many targets.
7. **Download** – Click Download; animated feedback confirms the action.

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
- Queue/favorites export (CSV/text)
- Offline cache of decoded previews

## License

This project is open source. Check the LICENSE file for details.

## Credits

**Developed by [Mayukhjit Chakraborty](https://github.com/mcinderelle) - Made without AI**
