# Step-by-Step Instructions: Running Pinguin on Windows on Arm

## Prerequisites

- **Windows 11 on Arm** (build 22000 or later)
- **Arm64 Device** (e.g., Surface Pro X, Snapdragon X Elite laptop)
- **4GB+ RAM** (8GB recommended)
- **5GB+ Storage** (for models and documents)

## Installation Steps

### 1. Install Ollama

1. Visit [ollama.com](https://ollama.com)
2. Download **Ollama for Windows (ARM64)**
3. Run the installer
4. Ollama will start automatically in the background
5. Close the installer when complete

### 2. Download Pinguin

1. Go to [GitHub Releases](https://github.com/Kehn-Marv/Pinguin/releases)
2. Download `Pinguin-Setup-1.0.0-arm64.exe`
3. Save to your Downloads folder

### 3. Install Pinguin

1. Double-click `Pinguin-Setup-1.0.0-arm64.exe`
2. Follow the installation wizard
3. Click "Install" (default location is fine)
4. Wait for installation to complete
5. Launch Pinguin from Start Menu or desktop shortcut

### 4. First-Run Setup

When Pinguin launches for the first time:

**Step 1: Welcome Screen**
- Click "Next"

**Step 2: Select LLM Model**
- Choose `llama3.2:3b` (recommended - fast, 2GB)
- Or choose `qwen2.5:3b` (better reasoning, 2GB)
- Click "Download"
- Wait 2-5 minutes for download to complete
- Status will show "Model Ready"

**Step 3: Select Embedding Model**
- Choose `nomic-embed-text` (recommended - fast, 274MB)
- Or choose `mxbai-embed-large` (better quality, 670MB)
- Click "Download"
- Wait 1-2 minutes for download to complete
- Status will show "Model Ready"

**Step 4: Finish**
- Click "Finish"
- Pinguin is now ready to use!

### 5. Using Pinguin

**Upload a Document:**
1. Click "Documents" in the left sidebar
2. Click "Upload Document" button
3. Select a PDF, DOCX, EPUB, or TXT file
4. **Recommended**: Use text-based PDFs (not scanned) for best performance
5. Wait for processing (10-30 seconds for text-based documents)
6. Document will appear in your library

**Ask Questions:**
1. Click "Chat" in the left sidebar
2. Type your question in the input box
3. Press Enter or click Send
4. **Note**: First query takes 1-2 minutes (models loading)
5. Subsequent queries: 30-50 seconds
6. AI will generate an answer with source citations

**Verify Performance:**
1. Open Task Manager (Ctrl+Shift+Esc)
2. Go to "Performance" tab
3. Watch CPU usage during query processing
4. Note memory usage (~2.5GB with 3B model)
5. All processing happens locally on your Arm device

## Troubleshooting

**Ollama Not Found:**
- Ensure Ollama is installed and running
- Check system tray for Ollama icon
- Restart Ollama if needed

**Backend Won't Start:**
- Check port 8000 is not in use
- Restart Pinguin
- Check Windows Firewall settings

**Slow Performance:**
- Use 3B models instead of 7B
- Close other applications
- Ensure adequate RAM available

**UI Doesn't Update:**
- Navigate to another chat and back
- See KNOWN_ISSUES.md for details

## Building from Source (Optional)

If you want to build Pinguin yourself:

### Prerequisites
- Node.js 18+ (Arm64)
- Python 3.10+ (Arm64)
- Visual Studio 2022 with C++ build tools (Arm64)
- Git for Windows (Arm64)

### Build Steps

```powershell
# Clone repository
git clone https://github.com/Kehn-Marv/Pinguin.git
cd Pinguin

# Install Node.js dependencies
npm install

# Install Python dependencies
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Download external dependencies
npm run setup-architecture-binaries

# Build the application
npm run make

# Installer will be in: out/make/squirrel.windows/arm64/
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/Kehn-Marv/Pinguin/issues
- Email: kehnmarv30@gmail.com
- Documentation: https://github.com/Kehn-Marv/Pinguin/tree/main/docs

---

**Total Setup Time**: ~10-15 minutes (including model downloads)

**Ready to Use**: Upload documents and start asking questions!
