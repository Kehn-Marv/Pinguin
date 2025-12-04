# Known Issues and Limitations

This document outlines current known issues and limitations in Pinguin v1.0.0. We're actively working on fixes for the next release.

## Current Issues

### 1. First Query Latency (High Priority)

**Issue**: The first query after launching the app can take 1-2 minutes to respond.

**Cause**: 
- LLM models need to be loaded into memory on first use
- Ollama initializes the inference engine
- Embedding model loads for the first time

**Subsequent Queries**: 30-50 seconds depending on query complexity and document size.

**Workaround**: 
- Be patient on first query - this is expected behavior
- Keep the app running to avoid reloading models
- Use smaller models (3B instead of 7B) for faster responses

**Fix Status**: 
- Planned for v1.1: Model preloading during startup
- Planned for v1.1: Progress indicator showing model loading status
- Planned for v1.2: Persistent model caching

---

### 2. UI State Synchronization Issues (High Priority)

**Issue**: After sending a message, the UI doesn't always update correctly:
- Sent message may not appear immediately
- Input field doesn't clear after sending
- Input field remains locked after response completes
- Previous query text appears in other chats

**Cause**: 
- Race condition in React state updates
- IPC message handling timing issues
- Chat context not properly isolated

**Workaround**:
1. If message doesn't appear: Navigate to another chat and back
2. If input is locked: Navigate away and return to unlock
3. If old text appears: Clear manually or navigate between chats

**Fix Status**:
- **Planned for v1.1** (Next Release):
  - Refactor chat state management
  - Implement proper message queue
  - Add optimistic UI updates
  - Fix input field state handling
  - Isolate chat contexts properly

**Impact**: Annoying but doesn't affect core functionality. Responses are still generated correctly.

---

### 3. Scanned Document Processing Time (Medium Priority)

**Issue**: Documents with scanned images (OCR required) take 20-30 minutes to process.

**Cause**:
- Tesseract OCR is CPU-intensive
- Each page must be processed individually
- High-quality scans produce large images
- No GPU acceleration for OCR on current setup

**Processing Times**:
- Text-based PDF (50 pages): ~8 seconds
- Scanned PDF (50 pages): ~25 minutes
- Mixed content PDF: Varies based on scanned page count

**Workaround**:
- **Recommended**: Use text-based PDFs when possible
- For scanned documents: Process overnight or during breaks
- Split large scanned PDFs into smaller chunks
- Reduce scan quality/DPI before uploading if acceptable

**Fix Status**:
- Planned for v1.2: Parallel OCR processing
- Planned for v1.2: Progress indicator with page count
- Planned for v1.3: GPU-accelerated OCR (if available)
- Investigating: Pre-processing optimization

**Note**: OCR functionality works correctly - it just takes time. This is a performance optimization issue, not a bug.

---

### 4. Limited File Format Support (Low Priority)

**Issue**: Not all document formats are currently supported.

**Currently Supported**:
- ✅ PDF (text and scanned)
- ✅ DOCX (Microsoft Word)
- ✅ EPUB (E-books)
- ✅ TXT (Plain text)

**Not Yet Supported**:
- ❌ PPTX (PowerPoint) - Planned for v1.2
- ❌ XLSX (Excel) - Planned for v1.3
- ❌ HTML/Markdown - Planned for v1.2
- ❌ RTF (Rich Text Format) - Planned for v1.3
- ❌ ODT (OpenDocument) - Planned for v1.3
- ❌ Images (JPG, PNG) - OCR only, planned for v1.2

**Workaround**:
- Convert unsupported formats to PDF or DOCX
- Use online converters or "Save As PDF" features
- For images: Create a PDF with the images

**Fix Status**:
- v1.2: PPTX, HTML, Markdown, standalone images
- v1.3: XLSX, RTF, ODT, and other formats

---

## Performance Considerations

### Memory Usage

**Expected Behavior**:
- Idle: ~300MB
- With 3B model loaded: ~2.5GB
- With 7B model loaded: ~5GB
- During document processing: Up to 3.5GB

**If experiencing high memory usage**:
- Close other applications
- Use 3B models instead of 7B
- Restart the app periodically
- Ensure adequate RAM (8GB+ recommended)

### Query Response Time

**Typical Response Times** (on Snapdragon X Elite):
- Embedding generation: ~100ms
- Vector search: ~50ms
- LLM inference: 2-4 seconds (3B model)
- Total: 2-4 seconds for typical queries

**Slower than expected?**
- First query is always slower (model loading)
- Complex queries take longer
- Multiple document filtering adds overhead
- Check CPU isn't thermal throttling
- Ensure Ollama is running properly

---

## Limitations by Design

### 1. Offline-Only Operation

**Limitation**: No cloud sync or backup features.

**Rationale**: Privacy-first design - your data never leaves your device.

**Future**: Optional encrypted cloud sync planned for v2.0 (user choice).

---

### 2. Single-User Application

**Limitation**: No multi-user support or collaboration features.

**Rationale**: Desktop application designed for individual use.

**Future**: Collaborative features planned for v1.4 (encrypted sharing).

---

### 3. English UI Only

**Limitation**: User interface is currently English-only.

**Rationale**: Initial release focused on core functionality.

**Future**: Multi-language UI planned for v1.3.

**Note**: The AI models support multiple languages - only the UI is English.

---

### 4. Windows on Arm Only

**Limitation**: Currently supports Windows 11 on Arm only.

**Rationale**: Initial release focused on Windows on Arm for the hackathon.

**Future**: 
- macOS (Apple Silicon) support planned for v1.2
- Linux Arm64 support planned for v1.2
- Mobile companion app (iOS/Android) planned for v2.0

---

## Reporting New Issues

Found a bug not listed here? Please report it!

1. Check [GitHub Issues](https://github.com/Kehn-Marv/Pinguin/issues) first
2. If not reported, create a new issue using the bug report template
3. Include:
   - Detailed description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (OS, device, versions)
   - Logs (if applicable)

---

## Roadmap for Fixes

### v1.1 (Next Release - Priority Fixes)
- ✅ Fix UI state synchronization issues
- ✅ Add model preloading during startup
- ✅ Implement proper message queue
- ✅ Add loading indicators for model initialization
- ✅ Fix input field state handling

### v1.2 (Performance & Features)
- ⏳ Parallel OCR processing
- ⏳ Additional file format support (PPTX, HTML, Markdown)
- ⏳ Progress indicators for long operations
- ⏳ Optimize document chunking algorithm
- ⏳ Improve error messages

### v1.3 (Polish & Expansion)
- ⏳ Multi-language UI support
- ⏳ More file formats (XLSX, RTF, ODT)
- ⏳ Advanced settings for power users
- ⏳ Keyboard shortcuts
- ⏳ Improved accessibility

### v2.0 (Major Features)
- ⏳ Mobile companion app
- ⏳ Optional encrypted cloud sync
- ⏳ Collaborative features
- ⏳ Plugin system
- ⏳ Advanced analytics

---

## Workarounds Summary

**For slow first query**: Be patient, keep app running, use smaller models

**For UI glitches**: Navigate between chats to refresh state

**For scanned documents**: Use text-based PDFs when possible, process during breaks

**For unsupported formats**: Convert to PDF or DOCX

---

## Positive Notes

Despite these issues, Pinguin delivers on its core promise:

✅ **Privacy-first**: All data stays on your device  
✅ **Offline operation**: No internet required  
✅ **Arm-optimized**: Native performance on Arm devices  
✅ **Accurate responses**: RAG prevents hallucination  
✅ **Production-ready**: Stable core functionality  
✅ **Open source**: Community can contribute fixes  

The issues listed are primarily UX polish and performance optimizations. The core RAG pipeline, document processing, and AI inference all work correctly.

---

## Contributing Fixes

Want to help fix these issues? We welcome contributions!

1. Check [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
2. Look for issues tagged `good first issue` or `help wanted`
3. Comment on the issue you want to work on
4. Submit a pull request with your fix

---

**Last Updated**: December 4, 2025  
**Version**: 1.0.0  
**Next Release**: v1.1 (Estimated: January 2026)
