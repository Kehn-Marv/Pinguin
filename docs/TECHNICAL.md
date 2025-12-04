# Pinguin Technical Documentation

## Architecture Overview

Pinguin is built as a desktop application using Electron, with a Python FastAPI backend for AI processing. The architecture is designed for optimal performance on Arm devices while maintaining cross-platform compatibility.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Startup    │  │   Process    │  │   IPC Handlers   │  │
│  │   Manager    │  │   Manager    │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─────────────────────────┐
                              ▼                         ▼
┌─────────────────────────────────────┐   ┌──────────────────────────┐
│     React Renderer Process          │   │   Python FastAPI Backend │
│  ┌────────────┐  ┌────────────────┐ │   │  ┌────────────────────┐ │
│  │    Chat    │  │   Documents    │ │   │  │   RAG Pipeline     │ │
│  │  Interface │  │   Management   │ │   │  │  - Ingest          │ │
│  └────────────┘  └────────────────┘ │   │  │  - Retrieval       │ │
│  ┌────────────┐  ┌────────────────┐ │   │  │  - Embedding       │ │
│  │  Settings  │  │   Course Mgmt  │ │   │  └────────────────────┘ │
│  └────────────┘  └────────────────┘ │   │  ┌────────────────────┐ │
└─────────────────────────────────────┘   │  │   ChromaDB Store   │ │
                                          │  └────────────────────┘ │
                                          └──────────────────────────┘
                                                      │
                                                      ▼
                                          ┌──────────────────────────┐
                                          │   Ollama (Local LLM)     │
                                          │  - Arm64 Native Builds   │
                                          │  - Model Management      │
                                          │  - Inference Engine      │
                                          └──────────────────────────┘
```

## Core Components

### 1. Electron Main Process

**Startup Manager** (`src/main/startup/startupManager.ts`)
- Orchestrates application initialization sequence
- Manages service dependencies (Ollama → Backend → UI)
- Handles first-run wizard flow
- Implements graceful error recovery

**Process Manager** (`src/main/ProcessManager.ts`)
- Spawns and monitors Python backend process
- Manages Ollama service lifecycle
- Implements health checks and auto-restart
- Handles inter-process communication

**IPC Handlers** (`src/main/IPCHandlers.ts`)
- Bridges renderer and main process
- Exposes system APIs to React frontend
- Manages file system operations
- Handles configuration persistence

### 2. React Frontend

**Component Structure**
```
src/renderer/
├── Chat/              # Chat interface and message handling
├── Documents/         # Document upload and management
├── Settings/          # Model selection and configuration
├── Welcome/           # First-run onboarding wizard
├── Sidebar/           # Navigation and course organization
└── components/        # Reusable UI components
```

**Key Features**
- Material-UI for consistent, accessible design
- React Router for navigation
- Context API for global state management
- Error boundaries for graceful error handling
- Optimistic UI updates for responsiveness

### 3. Python Backend

**FastAPI Server** (`backend/server.py`)
- RESTful API for document processing and querying
- Async request handling for concurrent operations
- Structured error responses with recovery strategies
- Health monitoring and status endpoints

**RAG Pipeline** (`backend/rag/`)
- **Ingest Pipeline**: Document extraction, chunking, embedding, storage
- **Retriever**: Semantic search with multiple ranking strategies
- **Embedder**: Batch embedding generation with caching

**Document Extractors** (`backend/extractors/`)
- PDF: Text and image extraction with OCR fallback
- DOCX: Structured content extraction
- EPUB: E-book parsing
- TXT: Plain text with encoding detection
- OCR: Tesseract integration for scanned documents

### 4. Vector Database

**ChromaDB Integration** (`backend/utils/chroma_client.py`)
- Local vector storage with persistence
- Efficient similarity search
- Metadata filtering for document-specific queries
- Automatic index management

**Schema**
```python
{
  "id": "doc_id_chunk_index",
  "embedding": [float],  # 768-dim for nomic-embed-text
  "metadata": {
    "doc_id": str,
    "chunk_index": int,
    "file_path": str,
    "page_number": int,
    "total_pages": int,
    "chunk_type": str
  },
  "document": str  # Chunk text content
}
```

## Arm Optimization Strategies

### 1. Native Compilation

All components are compiled for Arm64 architecture:
- **Electron**: Uses official Arm64 builds
- **Python**: CPython Arm64 with native extensions
- **Ollama**: Arm-optimized inference engine
- **Tesseract**: Compiled with Arm NEON optimizations
- **Poppler**: Native Arm64 builds for PDF processing

### 2. Model Selection

Optimized model recommendations for Arm devices:

**Embedding Models**
- `nomic-embed-text` (137M params): Best balance of speed and quality
- `mxbai-embed-large` (335M params): Higher quality, slightly slower

**LLMs**
- `llama3.2:3b`: Fast inference, good for quick queries
- `qwen2.5:3b`: Excellent reasoning, efficient on Arm
- `phi3:mini`: Microsoft's efficient model, great for Arm

### 3. Memory Management

- **Lazy Loading**: Models loaded on-demand
- **Batch Processing**: Efficient embedding generation
- **Caching**: LRU caches for embeddings and queries
- **Streaming**: Chunked responses for large documents

### 4. Performance Optimizations

**Backend**
- Async I/O for concurrent document processing
- Connection pooling for database operations
- Request queuing to prevent memory spikes
- Timeout management for long-running operations

**Frontend**
- Virtual scrolling for large document lists
- Debounced search inputs
- Lazy component loading
- Optimized re-renders with React.memo

## API Reference

### Document Ingestion

**POST** `/ingest`

Ingest a document into the knowledge base.

```json
{
  "doc_id": "string",
  "file_path": "string",
  "metadata": {
    "title": "string",
    "course": "string",
    "tags": ["string"]
  }
}
```

**Response**
```json
{
  "status": "success",
  "chunks_created": 42,
  "doc_id": "string",
  "message": "Document processed successfully"
}
```

### Query Documents

**POST** `/query`

Query the knowledge base with semantic search.

```json
{
  "query": "string",
  "top_k": 5,
  "similarity_threshold": 0.7,
  "mode": "balanced",
  "document_ids": ["string"]
}
```

**Response**
```json
{
  "chunks": [
    {
      "content": "string",
      "score": 0.95,
      "metadata": {
        "doc_id": "string",
        "page_number": 1,
        "file_path": "string"
      }
    }
  ],
  "query": "string",
  "total_results": 5
}
```

### Health Check

**GET** `/health`

Check backend and database status.

**Response**
```json
{
  "status": "healthy",
  "chroma_ready": true,
  "timestamp": "2025-12-04T00:00:00Z"
}
```

## Data Flow

### Document Ingestion Flow

```
1. User uploads document
   ↓
2. Frontend validates file type and size
   ↓
3. IPC call to main process
   ↓
4. Main process copies file to app data directory
   ↓
5. Backend API call: POST /ingest
   ↓
6. Document extraction (text/OCR)
   ↓
7. Smart chunking with overlap
   ↓
8. Batch embedding generation (Ollama)
   ↓
9. Vector storage (ChromaDB)
   ↓
10. Success response to frontend
```

### Query Flow

```
1. User enters question
   ↓
2. Frontend sends query to backend
   ↓
3. Backend generates query embedding (Ollama)
   ↓
4. Vector similarity search (ChromaDB)
   ↓
5. Retrieve top-k relevant chunks
   ↓
6. Construct context from chunks
   ↓
7. LLM generates answer (Ollama)
   ↓
8. Stream response to frontend
   ↓
9. Display answer with sources
```

## Configuration

### Electron Store Schema

```typescript
{
  activeLLM: string;              // Selected LLM model
  activeEmbeddingModel: string;   // Selected embedding model
  ollamaHost: string;             // Ollama API endpoint
  backendHost: string;            // Python backend endpoint
  firstRun: boolean;              // First-run wizard flag
  theme: 'light' | 'dark';        // UI theme
  courses: Course[];              // Course definitions
}
```

### Environment Variables

```bash
# Backend Configuration
OLLAMA_HOST=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
LANGCHAIN_TRACING_V2=false

# ChromaDB Configuration
CHROMA_PERSIST_DIRECTORY=./chroma_db
CHROMA_COLLECTION_NAME=pinguin_docs
```

## Security Considerations

### Data Privacy
- All data stored locally in user's app data directory
- No telemetry or analytics
- No external API calls (except Ollama, which is local)
- Documents never leave the device

### File System Security
- Sandboxed file access via Electron
- Input validation on all file operations
- Path traversal prevention
- Safe file type checking

### Process Isolation
- Backend runs in separate Python process
- IPC communication over local sockets
- No shell command injection vulnerabilities
- Proper error handling prevents information leakage

## Performance Benchmarks (Arm64)

Tested on Windows on Arm (Snapdragon X Elite):

**Document Processing**
- PDF (10 pages): ~5 seconds
- PDF with OCR (10 pages): ~30 seconds
- DOCX (50 pages): ~8 seconds
- Batch upload (10 documents): ~60 seconds

**Query Performance**
- Embedding generation: ~100ms
- Vector search: ~50ms
- LLM response (3B model): ~2-3 seconds
- End-to-end query: ~3-4 seconds

**Memory Usage**
- Idle: ~300MB
- With 3B model loaded: ~2.5GB
- Processing documents: ~3GB peak
- With 7B model loaded: ~5GB

## Troubleshooting

### Common Issues

**Ollama Not Found**
- Ensure Ollama is installed and running
- Check `ollama serve` is accessible
- Verify firewall settings allow localhost connections

**Backend Startup Failure**
- Check Python dependencies are installed
- Verify port 8000 is not in use
- Review backend logs in app data directory

**Slow Inference**
- Use smaller models (3B instead of 7B)
- Ensure sufficient RAM available
- Close other applications
- Check CPU isn't thermal throttling

**OCR Not Working**
- Verify Tesseract is bundled correctly
- Check extraResources directory exists
- Ensure language data files are present

## Development

### Running in Development Mode

```bash
# Terminal 1: Start Electron
npm start

# Terminal 2: Start backend manually (optional)
cd backend
python server.py
```

### Building for Production

```bash
# Build for current platform
npm run make

# Build for specific Arm platform
npm run make -- --arch=arm64 --platform=win32
```

### Testing

```bash
# Frontend tests
npm test

# Backend tests
cd backend
pytest

# E2E tests
npm run test:e2e
```

## Future Enhancements

- Multi-language support for UI
- Cloud sync (optional, encrypted)
- Collaborative study groups
- Advanced citation management
- Mobile companion app
- Voice input/output
- Spaced repetition integration
- Export to Anki/Quizlet

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines and contribution process.
