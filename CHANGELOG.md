# Change Log

## [1.0.23] - 2026-09-08

### Fixed
- Keep the auxiliary overlay canvas below SuperSplat UI panels so points and cameras no longer cover the Scene Manager.

## [1.0.22] - 2026-09-08

### Changed
- Set the default COLMAP camera glyph size to `0.001` of the scene diagonal.
- Switch COLMAP cameras to a vivid magenta color for stronger visibility.

## [1.0.21] - 2026-09-08

### Added
- Add a compact camera size slider for COLMAP camera overlays.

### Changed
- Reduce the default COLMAP camera glyph size again.
- Use a quieter amber camera color and render camera center dots to make dense camera sets easier to read.

## [1.0.20] - 2026-09-08

### Changed
- Reduce COLMAP camera glyph size.
- Normalize COLMAP overlay row labels to `Points` and `Cameras` while keeping actual counts in one place.

## [1.0.19] - 2026-09-08

### Changed
- Make the Scene Manager overlay controls more compact.
- Show actual point, edge, and camera counts in the overlay list.
- Draw COLMAP cameras as compact camera glyphs instead of long frustum rays.

## [1.0.18] - 2026-09-08

### Added
- Add click-to-fly behavior for COLMAP camera frustums.
- Add a Scene Manager overlay list with checkboxes for turning loaded point, mesh, and COLMAP camera overlays on and off.

## [1.0.17] - 2026-09-08

### Added
- Add a Scene Manager `+ COLMAP` action that accepts a project, `sparse`, or `sparse/0` folder and overlays sparse points plus camera frustums.
- Parse COLMAP `cameras.bin`, `images.bin`, and `points3D.bin` together for reconstruction overlays.

### Fixed
- Align auxiliary point, mesh, and COLMAP overlays with SuperSplat's displayed 3DGS coordinate transform.

## [1.0.16] - 2026-09-08

### Added
- Add COLMAP `points3D.bin` support for point overlays.
- Add pending overlay load state with an explicit Cancel control in the Scene Manager panel.

### Fixed
- Reset overlay UI state when a point or mesh file selection is cancelled.

## [1.0.15] - 2026-09-08

### Added
- Add auxiliary overlay loading from the Scene Manager panel.
- Support point overlays from PLY, XYZ, TXT, CSV, and COLMAP-style `points3D.txt` rows.
- Support OBJ mesh overlays as camera-synced wireframes.

### Changed
- Downsample large point overlays to protect webview memory while keeping scene alignment visible.

## [1.0.14] - 2026-09-08

### Changed
- Move GaussianViewer orbit controls into the SuperSplat scene manager panel when available.
- Expand cinematic orbit modes to Turntable, Reverse, Dolly Orbit, Bob Orbit, and Sway.
- Let camera orbit continue from the latest user-adjusted pose instead of overriding zoom, pan, or drag input.

## [1.0.13] - 2026-09-08

### Added
- Add an in-viewer GaussianViewer toolbar with Orbit/Stop buttons and orbit speed presets.

## [1.0.12] - 2026-09-08

### Added
- Add a cinematic orbit mode that automatically rotates the active viewer camera around the current target.
- Add command palette actions to start and stop cinematic orbit with normal, slow, and fast presets.

## [1.0.11] - 2026-09-08

### Added
- Add command palette actions to copy, save, and load the current SuperSplat camera viewpoint as JSON.
- Store camera position, target, and fov so the same scene framing can be restored later.

## [1.0.10] - 2026-09-08

### Fixed
- Use the single streaming fallback path for files above 500MB so large remote PLY files show progress and avoid direct webview fetch stalls.

## [1.0.9] - 2026-09-08

### Fixed
- Avoid duplicate large-file loading paths that could stream, assemble, and reinitialize the same model repeatedly.
- Load files below the VS Code buffer limit through direct webview resource URLs instead of IPC chunk assembly.

## [1.0.8] - 2026-09-08

### Fixed
- Avoid running the PLY optimizer on `.splat` and `.gsplat` files.
- Honor the optimized document loader path so large files are not read into extension-host memory unnecessarily.
- Improve ASCII PLY header parsing for CRLF files and vertex-only property handling.
- Preserve the final newline after `end_header` when converting ASCII PLY files to binary.

### Changed
- Prune the PLY cache by age and size instead of clearing the entire cache periodically.
- Make performance commands available from the command palette and add a PLY explorer context action.
- Replace placeholder cache stats and cache clearing with working implementations.

## [1.0.7] - 2026-01-27

### Added
- Eyedropper selection tool for selecting splats with similar colors (adjustable threshold).
- Live threshold updates that re-run the last eyedropper selection.
- Sponsor metadata for marketplace profiles.

### Changed
- About dialog/version display now matches the extension version.

### Fixed
- Prevented stale webview cache from serving outdated SuperSplat bundles.

## [1.0.6] - 2025-12-01

### Fixed
- Large files (>2GB) now load reliably by streaming bytes instead of hitting the Buffer size limit.
- Prevented invalid base64 decode errors during chunked streaming for big files.

### Changed
- Switched webview/extension transfer from base64 to `Uint8Array` to reduce overhead and memory usage.
- Receiver now branches automatically based on binary/base64 mode for safer chunk handling.

## [1.0.5] - 2025-08-31

### 🎯 Major Feature: Save/Export System Implementation

#### Added
- **Local Save/Export**: Fully functional save and export capabilities for PLY files
- **Chunked Data Transfer**: 4MB optimized chunks for memory-efficient large file handling
- **Original Filename Preservation**: Maintains actual file names instead of generic placeholders
- **Download Interception**: Automatic capture of SuperSplat save/export operations

#### Fixed
- **SecurityError**: Resolved cross-origin file picker issues by implementing fallback download interception
- **File Dialog Integration**: Save dialogs now work properly in VS Code environment
- **Binary Data Integrity**: Prevents data corruption during transfer with proper Uint8Array handling

#### Technical Improvements
- **Performance**: Optimized chunk size (4MB) for better streaming performance
- **Memory Efficiency**: Stream-based file processing to handle large files without OOM
- **Error Handling**: Comprehensive error messages and fallback mechanisms
- **Debug Logging**: Enhanced console output for troubleshooting save operations

#### How It Works
- **Export**: Automatic interception of SuperSplat save/export events via DownloadWriter hooks
- **Storage**: Uses VS Code's file system API for reliable file saving
- **Fallback**: When `showSaveFilePicker` fails, falls back to custom download handling

---

## [1.0.4] - 2025-08-25

### Documentation
- **README Update**: Enhanced documentation with better installation and usage instructions
- **Feature Descriptions**: Updated feature list to reflect current capabilities

---

## [1.0.3] - 2025-07-26

### Added
- **File Import Dialog**: Added file picker functionality to load PLY files directly within the SuperSplat viewer interface.
- Enhanced SSH remote environment support for file operations.

### Fixed
- Improved cross-origin iframe security handling for file operations.
- Enhanced VS Code webview integration for better file system access.

---

## [1.0.2] - 2025-07-25

### 🚀 Major Performance Breakthrough
- **3–10× faster loading** on large 3DGS files (tested on 1–5GB scenes).
- **Files under 500 MB load directly into memory**; larger files use optimized streaming with bigger chunks and more parallel requests.
- Automatic compression and lightweight validation for faster transfer and startup.

### Fixed
- Resolved a critical JS initialization error that blocked loading.
- Implemented the missing fallback handler for normal mode.
- Cleaned up variable scoping issues in both streaming and direct-load paths.

### Changed
- Increased default chunk size and parallelism to match high-end 3DGS hardware.
- Adaptive tuning now picks optimal parameters based on file size.

---

**If you have a powerful 3DGS setup, this release gives you unprecedented load speeds. 🔥**  
*Older versions remain available for memory-constrained systems.*

## [1.0.1] - 2025-07-17

### Fixed
- Viewer freezes/crashes on very large files due to excessive memory usage.
- Intermittent errors when using certain edit tools.

### Changed
- Improved chunk processing and overall stability/performance.

### Added
- Status bar now shows total point count of the loaded Splat.

---

## [1.0.0] - 2025-07-16

### Added
- Initial release of the VS Code SuperSplat extension.
- Integrated 3D Gaussian Splat viewer/editor.
- Support for `.ply`, `.splat`, `.gsplat`.
- Remote SSH compatibility and configurable viewer settings.
- Hot reload for file changes.
