# Change Log

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
