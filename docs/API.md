# Pinguin Backend API Reference

## Base URL

```
http://localhost:8000
```

## Authentication

No authentication required. The API is designed for local-only access.

## Endpoints

### Health Check

Check the health status of the backend and ChromaDB.

**Endpoint**: `GET /health`

**Response**
```json
{
  "status": "healthy",
  "chroma_ready": true,
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Status Codes**
- `200 OK`: Service is healthy
- `503 Service Unavailable`: ChromaDB is not ready

---

### Ingest Document

Process and ingest a document into the knowledge base.

**Endpoint**: `POST /ingest`

**Request Body**
```json
{
  "doc_id": "string",
  "file_path": "string",
  "metadata": {
    "title": "string",
    "course": "string",
    "author": "string",
    "tags": ["string"]
  }
}
```

**Parameters**
- `doc_id` (required): Unique identifier for the document
- `file_path` (required): Absolute path to the document file
- `metadata` (optional): Additional metadata for the document

**Response**
```json
{
  "status": "success",
  "chunks_created": 42,
  "doc_id": "doc_12345",
  "message": "Document processed successfully"
}
```

**Status Codes**
- `200 OK`: Document ingested successfully
- `400 Bad Request`: Invalid file or parameters
- `503 Service Unavailable`: No embedding model configured
- `504 Gateway Timeout`: Processing took longer than 60 minutes

**Notes**
- Supports PDF, DOCX, EPUB, TXT, and more
- OCR is automatically applied to scanned PDFs
- Large documents may take several minutes to process
- Maximum timeout: 60 minutes for very large documents

---

### Query Documents

Query the knowledge base using semantic search.

**Endpoint**: `POST /query`

**Request Body**
```json
{
  "query": "What is machine learning?",
  "top_k": 5,
  "similarity_threshold": 0.7,
  "mode": "balanced",
  "document_ids": ["doc_12345", "doc_67890"]
}
```

**Parameters**
- `query` (required): The question or search query
- `top_k` (optional): Number of results to return (default: 5)
- `similarity_threshold` (optional): Minimum similarity score (default: 0.7)
- `mode` (optional): Retrieval mode - "precision", "recall", or "balanced" (default: "balanced")
- `document_ids` (optional): Filter results to specific documents

**Response**
```json
{
  "chunks": [
    {
      "content": "Machine learning is a subset of artificial intelligence...",
      "score": 0.95,
      "metadata": {
        "doc_id": "doc_12345",
        "chunk_index": 5,
        "file_path": "/path/to/document.pdf",
        "page_number": 3,
        "total_pages": 100,
        "chunk_type": "text"
      }
    }
  ],
  "query": "What is machine learning?",
  "total_results": 5
}
```

**Status Codes**
- `200 OK`: Query successful
- `400 Bad Request`: Invalid query parameters
- `503 Service Unavailable`: No embedding model configured

**Retrieval Modes**
- `precision`: Prioritizes highly relevant results (higher threshold)
- `recall`: Returns more results with lower threshold
- `balanced`: Balance between precision and recall (default)

---

### List Documents

Get a list of all ingested documents.

**Endpoint**: `GET /documents`

**Response**
```json
{
  "documents": [
    {
      "doc_id": "doc_12345",
      "file_path": "/path/to/document.pdf",
      "chunks_created": 42,
      "metadata": {
        "title": "Introduction to AI",
        "course": "CS101",
        "tags": ["ai", "ml"]
      }
    }
  ],
  "total": 1
}
```

**Status Codes**
- `200 OK`: List retrieved successfully

**Notes**
- Returns documents from in-memory store
- May not include documents ingested before server restart
- Use verify endpoint to check ChromaDB for complete list

---

### Delete Document

Delete a document and all its associated chunks.

**Endpoint**: `DELETE /documents/{doc_id}`

**Parameters**
- `doc_id` (required): Document identifier to delete

**Response**
```json
{
  "status": "success",
  "doc_id": "doc_12345",
  "chunks_deleted": 42,
  "message": "Document doc_12345 and 42 chunks deleted successfully"
}
```

**Status Codes**
- `200 OK`: Document deleted successfully
- `404 Not Found`: Document does not exist
- `503 Service Unavailable`: ChromaDB not available

---

### Verify Document

Check if a document exists in ChromaDB and get chunk count.

**Endpoint**: `GET /documents/{doc_id}/verify`

**Parameters**
- `doc_id` (required): Document identifier to verify

**Response**
```json
{
  "exists": true,
  "doc_id": "doc_12345",
  "chunks_count": 42
}
```

**Status Codes**
- `200 OK`: Verification complete
- `503 Service Unavailable`: ChromaDB not available

**Use Case**
- Verify document ingestion after timeout errors
- Check if document exists before re-ingesting
- Get accurate chunk count from database

---

### Generate Embeddings

Generate embeddings for arbitrary text.

**Endpoint**: `POST /embed`

**Request Body**
```json
{
  "texts": [
    "First text to embed",
    "Second text to embed"
  ]
}
```

**Parameters**
- `texts` (required): Array of strings to generate embeddings for

**Response**
```json
{
  "embeddings": [
    [0.123, -0.456, 0.789, ...],
    [0.234, -0.567, 0.890, ...]
  ],
  "count": 2
}
```

**Status Codes**
- `200 OK`: Embeddings generated successfully
- `400 Bad Request`: Invalid input
- `503 Service Unavailable`: No embedding model configured

**Notes**
- Embeddings are 768-dimensional for nomic-embed-text
- Batch processing is used for efficiency
- Failed embeddings are filtered out

---

### Root Endpoint

Get API information.

**Endpoint**: `GET /`

**Response**
```json
{
  "name": "Pinguin Backend API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "health": "/health",
    "ingest": "/ingest",
    "query": "/query",
    "documents": "/documents",
    "embed": "/embed"
  }
}
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error Type",
  "detail": "Human-readable error message",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

### Common Error Types

**ChromaDB Error** (503)
```json
{
  "error": "ChromaDB Error",
  "detail": "Database service is temporarily unavailable. Please try again.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Embedding Error** (500)
```json
{
  "error": "Embedding Error",
  "detail": "Failed to generate embeddings. Please check if the embedding model is available.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Ollama Error** (503)
```json
{
  "error": "Ollama Error",
  "detail": "LLM service is unavailable. Please ensure Ollama is running.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Validation Error** (400)
```json
{
  "error": "Validation Error",
  "detail": "Invalid input: file path does not exist",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

**Timeout Error** (504)
```json
{
  "error": "Timeout Error",
  "detail": "Operation timed out. Please try again.",
  "timestamp": "2025-12-04T12:00:00.000Z"
}
```

## Rate Limiting

No rate limiting is enforced. However, the backend uses request queuing to prevent memory spikes from concurrent operations.

## CORS

CORS is enabled for all origins in development. In production, restrict to specific origins.

## WebSocket Support

Not currently supported. All communication is via HTTP REST API.

## Examples

### Python Client

```python
import requests

BASE_URL = "http://localhost:8000"

# Health check
response = requests.get(f"{BASE_URL}/health")
print(response.json())

# Ingest document
ingest_data = {
    "doc_id": "my_doc_001",
    "file_path": "/path/to/document.pdf",
    "metadata": {
        "title": "My Document",
        "course": "CS101"
    }
}
response = requests.post(f"{BASE_URL}/ingest", json=ingest_data)
print(response.json())

# Query
query_data = {
    "query": "What is the main topic?",
    "top_k": 5,
    "mode": "balanced"
}
response = requests.post(f"{BASE_URL}/query", json=query_data)
print(response.json())
```

### JavaScript Client

```javascript
const BASE_URL = "http://localhost:8000";

// Health check
fetch(`${BASE_URL}/health`)
  .then(res => res.json())
  .then(data => console.log(data));

// Ingest document
fetch(`${BASE_URL}/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    doc_id: "my_doc_001",
    file_path: "/path/to/document.pdf",
    metadata: {
      title: "My Document",
      course: "CS101"
    }
  })
})
  .then(res => res.json())
  .then(data => console.log(data));

// Query
fetch(`${BASE_URL}/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "What is the main topic?",
    top_k: 5,
    mode: "balanced"
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

### cURL Examples

```bash
# Health check
curl http://localhost:8000/health

# Ingest document
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "doc_id": "my_doc_001",
    "file_path": "/path/to/document.pdf",
    "metadata": {
      "title": "My Document",
      "course": "CS101"
    }
  }'

# Query
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the main topic?",
    "top_k": 5,
    "mode": "balanced"
  }'

# List documents
curl http://localhost:8000/documents

# Delete document
curl -X DELETE http://localhost:8000/documents/my_doc_001

# Verify document
curl http://localhost:8000/documents/my_doc_001/verify
```
