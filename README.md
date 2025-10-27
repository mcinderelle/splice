# Splice Sample Browser

A minimalist, clean alternative frontend for the popular [Splice](https://splice.com/features/sounds) sample library. It does not require any kind of authentication, and contains all of the most important features of the regular desktop app (including drag-and-drop).

## Features

- OpenAI Sans typography
- Optimized performance  
- No authentication required
- Full drag-and-drop support
- Minimalist black and white design
- Keyboard shortcuts for rapid workflow
- Buttery smooth liquid animations
- One-click play/pause for samples
- Cross-platform support (Windows, macOS, Linux)

## Keyboard Shortcuts

- **/** - Focus search bar
- **Esc** - Clear search  
- **Space** - Play/Pause current sample
- **H** - Open help
- **Ctrl+,** (or Cmd+, on Mac) - Open settings

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

1. **Search** - Type in the search bar to find samples
2. **Preview** - Click the play button to listen to samples
3. **Filter** - Use filters to narrow down by genre, instrument, BPM, key, etc.
4. **Drag & Drop** - Drag samples directly into your DAW from the desktop app
5. **Download** - Samples are automatically saved to your configured directory

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

## License

This project is open source. Check the LICENSE file for details.

## Credits

**Developed by [Mayukhjit Chakraborty](https://github.com/mcinderelle) - Made without AI**
