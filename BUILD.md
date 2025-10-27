# Building Splice Sample Browser

This guide will help you build the application for your platform.

## Prerequisites

Before building, you need to install:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **Rust** - [Download](https://www.rust-lang.org/tools/install)
3. **Platform-specific tools**:
   - **Windows**: Visual Studio C++ Build Tools
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: Build essentials

## Quick Build Steps

### 1. Install Node.js Dependencies

```bash
npm install
```

### 2. Build for Your Platform

#### Windows

```bash
npm run tauri build -- --target x86_64-pc-windows-msvc
```

The output will be in: `src-tauri/target/x86_64-pc-windows-msvc/release/`

#### macOS (Intel)

```bash
npm run tauri build -- --target x86_64-apple-darwin
```

#### macOS (Apple Silicon/M1/M2)

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

The output will be in: `src-tauri/target/*/release/bundle/`

#### Linux

```bash
# Install Linux dependencies
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libjavascriptcoregtk-4.0-dev

# Build
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

The output will be in: `src-tauri/target/x86_64-unknown-linux-gnu/release/`

## Development Mode

To run the app in development mode with hot reload:

```bash
npm run dev  # For web version
npm run tauri dev  # For desktop app with Tauri
```

## Troubleshooting

### Windows: "program not found" error

Install Microsoft C++ Build Tools from: https://visualstudio.microsoft.com/downloads/

### macOS: "linker not found" error

Install Xcode Command Line Tools:
```bash
xcode-select --install
```

### Linux: Missing dependencies

Install the required packages:
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libjavascriptcoregtk-4.0-dev
```

## Creating Releases on GitHub

The GitHub Actions workflow automatically builds releases when you create a git tag:

```bash
# Tag a new version
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

This will trigger the build workflow and create pre-built executables for all platforms in the Releases section.

