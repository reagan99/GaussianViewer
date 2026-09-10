# Change Log

## [1.0.10] - 2026-09-10

### Fixed
- Fixed mid-sized and large PLY files opening to an empty coordinate/grid view in VS Code Remote SSH by streaming files from 128MB upward instead of relying on direct webview URL fetches.

## [1.0.9] - 2026-09-09

### Major Update
- Added Scene Manager controls for loading auxiliary scene overlays without leaving the viewer.
- Added COLMAP sparse reconstruction overlays from project, `sparse`, or `sparse/0` folders.
- Added support for COLMAP `cameras.bin`, `images.bin`, and `points3D.bin` together, drawing sparse points and camera poses in the 3DGS scene.
- Added camera overlay visibility toggles, point/camera count labels, and a compact camera size slider.
- Added click-to-fly behavior for COLMAP camera glyphs.
- Added vivid, compact COLMAP camera glyphs with adjustable size.
- Added standalone point overlays from PLY, XYZ, TXT, CSV, and COLMAP `points3D.bin` or `points3D.txt` style data.
- Added OBJ mesh overlays as camera-synced wireframes.
- Added viewpoint copy, save, and load commands.
- Added cinematic camera orbit controls with multiple orbit modes inside the Scene Manager.
- Improved large PLY loading by avoiding unnecessary full-memory reads where streaming/direct loading is available.
- Improved ASCII and binary PLY parsing compatibility.
- Improved PLY cache pruning and cache statistics.
- Fixed overlay coordinate alignment with SuperSplat's displayed 3DGS transform.
- Fixed overlay rendering order so points and cameras no longer cover SuperSplat UI panels.
- Fixed Scene Manager layering so File, Select, Render, and Help menus open above the panel.
- Added a compact collapse button and draggable header for the Scene Manager.
- Fixed overlay file-picker cancellation state.

### Release Notes
- This release is the public rollup of the recent GaussianViewer improvements after 1.0.7.

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
