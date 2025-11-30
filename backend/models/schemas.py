"""
Pydantic models and schemas for Pinguin backend API.
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class FileType(str, Enum):
    """Supported file types."""
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"
    EPUB = "epub"
    TXT = "txt"


class ProcessingStatus(str, Enum):
    """Document processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class StudyMode(str, Enum):
    """Study modes for different learning contexts."""
    FILES = "files"
    CODING = "coding"
    THINKING = "thinking"


# Request/Response Models

class IngestRequest(BaseModel):
    """Request model for document ingestion."""
    file_path: str = Field(..., description="Path to the document file")
    doc_id: str = Field(..., description="Unique document identifier")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class IngestResponse(BaseModel):
    """Response model for document ingestion."""
    status: str = Field(..., description="Processing status")
    chunks_created: int = Field(..., description="Number of chunks created")
    doc_id: str = Field(..., description="Document identifier")
    message: Optional[str] = Field(None, description="Additional message")


class QueryRequest(BaseModel):
    """Request model for vector search query."""
    query: str = Field(..., description="Search query text")
    top_k: int = Field(default=10, ge=1, le=50, description="Number of results to return")
    mode: StudyMode = Field(default=StudyMode.FILES, description="Study mode")
    similarity_threshold: float = Field(default=0.15, ge=0.0, le=1.0, description="Minimum similarity score")
    document_ids: Optional[List[str]] = Field(default=None, description="Optional list of document IDs to filter by")


class ChunkMetadata(BaseModel):
    """Metadata for a document chunk."""
    doc_id: str
    filename: str
    page: Optional[int] = None
    heading: Optional[str] = None
    position: int
    tokens: int
    chunk_type: Optional[str] = None
    # Additional fields for frontend display and filtering
    documentTitle: Optional[str] = None
    courseId: Optional[str] = None
    chatId: Optional[str] = None
    docType: Optional[str] = None


class RetrievedChunk(BaseModel):
    """A chunk retrieved from vector search."""
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    score: float = Field(..., description="Similarity score (0-1)")


class QueryResponse(BaseModel):
    """Response model for vector search query."""
    chunks: List[RetrievedChunk] = Field(..., description="Retrieved chunks")
    query: str = Field(..., description="Original query")
    total_results: int = Field(..., description="Total number of results")


class EmbedRequest(BaseModel):
    """Request model for embedding generation."""
    texts: List[str] = Field(..., description="Texts to embed")


class EmbedResponse(BaseModel):
    """Response model for embedding generation."""
    embeddings: List[List[float]] = Field(..., description="Generated embeddings")
    count: int = Field(..., description="Number of embeddings generated")


class DocumentMetadata(BaseModel):
    """Metadata for a stored document."""
    id: str
    filename: str
    filepath: str
    file_type: FileType
    file_size: int
    upload_date: datetime
    page_count: Optional[int] = None
    chunk_count: int
    content_hash: str
    processing_status: ProcessingStatus
    error_message: Optional[str] = None


class DocumentListResponse(BaseModel):
    """Response model for listing documents."""
    documents: List[DocumentMetadata]
    total: int


class DeleteDocumentResponse(BaseModel):
    """Response model for document deletion."""
    status: str
    doc_id: str
    chunks_deleted: int
    message: Optional[str] = None


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    timestamp: datetime
    version: str = "1.0.0"


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
