"""
Pinguin Backend - FastAPI Server
Main entry point for the RAG pipeline backend service.
"""
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import List
import traceback

# Disable LangChain telemetry to prevent capture() errors
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGCHAIN_ENDPOINT"] = ""
os.environ["LANGCHAIN_API_KEY"] = ""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Add backend directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from models.schemas import (
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    EmbedRequest,
    EmbedResponse,
    DocumentListResponse,
    DeleteDocumentResponse,
    HealthResponse,
    ErrorResponse,
    DocumentMetadata,
    RetrievedChunk,
    ChunkMetadata,
)
from utils.chroma_client import ChromaClient
from utils.logger import get_logger
from rag.embedder import Embedder
from rag.ingest_v2 import EnhancedIngestPipeline
from rag.retriever import Retriever

# Initialize logger
logger = get_logger(name="pinguin_backend")

# Global state
chroma_client: ChromaClient = None
embedder: Embedder = None
ingest_pipeline: EnhancedIngestPipeline = None
retriever: Retriever = None
document_store: dict = {}  # In-memory document metadata store


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    global chroma_client, embedder, ingest_pipeline, retriever
    
    # Startup
    logger.info("Starting Pinguin backend server")
    
    chroma_ok = False
    try:
        # Initialize ChromaDB client
        chroma_client = ChromaClient()
        logger.info("ChromaDB client initialized")
        
        # Verify ChromaDB is healthy — but don't abort server startup if it's not.
        try:
            chroma_ok = chroma_client.is_healthy()
        except Exception as e:
            chroma_ok = False
            logger.exception("ChromaDB health check raised an exception (will start in degraded mode)", error=str(e))
        
        if not chroma_ok:
            # Log and continue — start the server in degraded mode.
            # APIs that depend on ChromaDB should return 503 as appropriate.
            logger.warning("ChromaDB health check failed or ChromaDB unavailable. Starting backend in degraded mode.")
        else:
            logger.info("ChromaDB health check passed")
        
        # Initialize embedder (uses Ollama embedding model from environment variable)
        embedding_model = os.environ.get("EMBEDDING_MODEL", "")
        ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
        
        if not embedding_model:
            logger.warning("No embedding model configured - embedder will not be initialized")
            embedder = None
            logger.warning("Please select and download an embedding model in the app settings")
        else:
            embedder = Embedder(
                model_name=embedding_model,
                batch_size=32,
                ollama_host=ollama_host,
                enable_cache=True,
                cache_size=1000
            )
            logger.info(f"Embedder initialized with Ollama model: {embedding_model}")
        
        # Initialize enhanced ingest pipeline (v2) and retriever only if embedder available AND ChromaDB is healthy
        if embedder and chroma_ok:
            ingest_pipeline = EnhancedIngestPipeline(
                chroma_client=chroma_client,
                embedder=embedder,
                use_enhanced_extractors=True,
                use_enhanced_chunker=True,
                use_ocr=True,
                validate_files=True
            )
            logger.info("Enhanced ingest pipeline initialized (v2)")
            
            # Initialize retriever
            retriever = Retriever(
                chroma_client=chroma_client,
                embedder=embedder,
                enable_cache=True,
                cache_size=100,
                cache_ttl=300
            )
            logger.info("Retriever initialized")
        else:
            ingest_pipeline = None
            retriever = None
            logger.warning("Ingest pipeline and retriever not initialized (embedder or ChromaDB unavailable)")
        
        logger.info("Pinguin backend server started (mode=%s)", "healthy" if chroma_ok else "degraded")
    
    except Exception as e:
        # If an unexpected error occurs here, log it but try to continue where possible.
        # This catch is to prevent unexpected exceptions from preventing the server from binding.
        logger.exception("Failed to fully initialize some components during startup; starting in degraded mode", error=str(e))
    
    yield
    
    # Shutdown
    logger.info("Shutting down Pinguin backend server")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Pinguin Backend API",
    description="RAG pipeline backend for Pinguin AI study companion",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Error Recovery Middleware
@app.middleware("http")
async def error_recovery_middleware(request: Request, call_next):
    """
    Middleware for error recovery and structured error responses.
    Catches ChromaDB, embedding, and general errors.
    """
    try:
        response = await call_next(request)
        return response
    
    except HTTPException:
        # Re-raise HTTP exceptions (they're already handled)
        raise
    
    except Exception as e:
        # Log the error with full traceback
        error_traceback = traceback.format_exc()
        logger.exception(
            "Unhandled exception in request",
            path=request.url.path,
            method=request.method,
            error_type=type(e).__name__,
            traceback=error_traceback
        )
        
        # Determine error type and message
        error_message = str(e)
        error_type_name = type(e).__name__
        
        # Check for specific error types and provide appropriate status codes
        if "chroma" in error_message.lower() or "chromadb" in error_type_name.lower():
            error_type = "ChromaDB Error"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            user_message = "Database service is temporarily unavailable. Please try again."
        elif "embedding" in error_message.lower() or "sentencetransformer" in error_type_name.lower():
            error_type = "Embedding Error"
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            user_message = "Failed to generate embeddings. Please check if the embedding model is available."
        elif "ollama" in error_message.lower():
            error_type = "Ollama Error"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            user_message = "LLM service is unavailable. Please ensure Ollama is running."
        elif isinstance(e, FileNotFoundError):
            error_type = "File Not Found"
            status_code = status.HTTP_404_NOT_FOUND
            user_message = f"File not found: {error_message}"
        elif isinstance(e, PermissionError):
            error_type = "Permission Error"
            status_code = status.HTTP_403_FORBIDDEN
            user_message = "Permission denied accessing the requested resource."
        elif isinstance(e, ValueError):
            error_type = "Validation Error"
            status_code = status.HTTP_400_BAD_REQUEST
            user_message = f"Invalid input: {error_message}"
        elif isinstance(e, TimeoutError):
            error_type = "Timeout Error"
            status_code = status.HTTP_504_GATEWAY_TIMEOUT
            user_message = "Operation timed out. Please try again."
        else:
            error_type = "Internal Server Error"
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            user_message = "An unexpected error occurred. Please try again."
        
        # Return structured error response
        return JSONResponse(
            status_code=status_code,
            content=ErrorResponse(
                error=error_type,
                detail=user_message,
                timestamp=datetime.utcnow()
            ).dict()
        )


# API Endpoints

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    Returns server status and ChromaDB readiness.
    """
    chroma_ready = False
    
    if chroma_client:
        try:
            chroma_ready = chroma_client.is_healthy()
        except Exception:
            chroma_ready = False
    
    logger.debug("Health check", chroma_ready=chroma_ready)
    
    return HealthResponse(
        status="healthy" if chroma_ready else "degraded",
        chroma_ready=chroma_ready,
        timestamp=datetime.utcnow()
    )


@app.post("/ingest", response_model=IngestResponse)
async def ingest_document(request: IngestRequest):
    """
    Ingest a document into the RAG pipeline.
    
    Processes document through extraction, chunking, embedding, and storage.
    Timeout: 10 minutes for large documents with OCR.
    """
    import asyncio
    
    logger.info(
        "Document ingestion requested",
        doc_id=request.doc_id,
        file_path=request.file_path
    )
    
    if not ingest_pipeline or not embedder:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No embedding model configured. Please select and download an embedding model in Settings."
        )
    
    try:
        # Validate document first
        is_valid, error_msg = ingest_pipeline.validate_document(request.file_path)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        # Process document with timeout (60 minutes for large OCR documents)
        # Very generous timeout to handle large scanned PDFs with OCR
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    ingest_pipeline.process_document,
                    file_path=request.file_path,
                    doc_id=request.doc_id,
                    metadata=request.metadata
                ),
                timeout=3600.0  # 60 minutes (1 hour)
            )
        except asyncio.TimeoutError:
            logger.error(f"Document ingestion timed out after 60 minutes: {request.doc_id}")
            # Clean up any partial data
            ingest_pipeline.cleanup_failed_ingestion(request.doc_id)
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Document processing timed out after 60 minutes. The file may be too large or complex. Try splitting it into smaller parts."
            )
        
        if result.status == "failed":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.error or "Document processing failed"
            )
        
        # Store document metadata
        document_store[request.doc_id] = {
            "doc_id": request.doc_id,
            "file_path": request.file_path,
            "chunks_created": result.chunks_created,
            "metadata": request.metadata
        }
        
        return IngestResponse(
            status=result.status,
            chunks_created=result.chunks_created,
            doc_id=result.doc_id,
            message=result.message
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document ingestion failed: {str(e)}"
        )


@app.get("/documents/{doc_id}/verify")
async def verify_document(doc_id: str):
    """
    Verify if a document exists in ChromaDB and return chunk count.
    Used to check if a document was successfully ingested despite timeout errors.
    """
    logger.info(f"Verifying document: {doc_id}")
    
    if not chroma_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ChromaDB client not available"
        )
    
    try:
        # Try to get the collection
        collection = chroma_client.get_collection()
        
        # Query for documents with this doc_id
        results = collection.get(
            where={"doc_id": doc_id},
            limit=1
        )
        
        exists = len(results['ids']) > 0
        
        if exists:
            # Count total chunks for this document
            all_results = collection.get(
                where={"doc_id": doc_id}
            )
            chunks_count = len(all_results['ids'])
            
            logger.info(f"Document {doc_id} verified: {chunks_count} chunks found")
            
            return {
                "exists": True,
                "doc_id": doc_id,
                "chunks_count": chunks_count
            }
        else:
            logger.info(f"Document {doc_id} not found in ChromaDB")
            return {
                "exists": False,
                "doc_id": doc_id,
                "chunks_count": 0
            }
    
    except Exception as e:
        logger.error(f"Error verifying document {doc_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify document: {str(e)}"
        )


@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query the vector database for relevant chunks.
    
    Performs semantic search with mode-specific ranking and filtering.
    """
    logger.info(
        "Query requested",
        query=request.query[:50],
        mode=request.mode,
        top_k=request.top_k
    )
    
    if not retriever or not embedder:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No embedding model configured. Please select and download an embedding model in Settings."
        )
    
    try:
        # If document_ids are provided, query each document and combine results
        if request.document_ids and len(request.document_ids) > 0:
            logger.info(f"Filtering by {len(request.document_ids)} document IDs: {request.document_ids}")
            all_chunks = []
            
            for doc_id in request.document_ids:
                doc_chunks = retriever.retrieve(
                    query=request.query,
                    top_k=request.top_k,
                    similarity_threshold=request.similarity_threshold,
                    mode=request.mode,
                    doc_filter=doc_id
                )
                all_chunks.extend(doc_chunks)
            
            # Sort by score and take top_k
            all_chunks.sort(key=lambda c: c.score, reverse=True)
            chunks = all_chunks[:request.top_k]
            
            logger.info(f"Retrieved {len(chunks)} chunks from {len(request.document_ids)} documents")
        else:
            # No filter, retrieve from all documents
            chunks = retriever.retrieve(
                query=request.query,
                top_k=request.top_k,
                similarity_threshold=request.similarity_threshold,
                mode=request.mode
            )
        
        return QueryResponse(
            chunks=chunks,
            query=request.query,
            total_results=len(chunks)
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)}"
        )


@app.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    """
    List all ingested documents.
    
    Returns document metadata from the in-memory store.
    """
    logger.info("Document list requested")
    
    documents = list(document_store.values())
    
    return DocumentListResponse(
        documents=documents,
        total=len(documents)
    )


@app.delete("/documents/{doc_id}", response_model=DeleteDocumentResponse)
async def delete_document(doc_id: str):
    """
    Delete a document and all associated chunks.
    
    Args:
        doc_id: Document identifier
    
    Returns:
        Deletion status and count of chunks deleted
    """
    logger.info("Document deletion requested", doc_id=doc_id)
    
    if not chroma_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ChromaDB client not initialized"
        )
    
    try:
        # Delete chunks from ChromaDB (this is the source of truth)
        chunks_deleted = chroma_client.delete_document(doc_id)
        
        # If no chunks were deleted, document doesn't exist in ChromaDB
        if chunks_deleted == 0:
            logger.warning(f"Document {doc_id} not found in ChromaDB")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document {doc_id} not found"
            )
        
        # Remove from document store if it exists (may not exist after server restart)
        if doc_id in document_store:
            del document_store[doc_id]
        
        # Invalidate retriever cache for this document
        if retriever:
            retriever.invalidate_cache_for_document(doc_id)
        
        logger.info(
            "Document deleted successfully",
            doc_id=doc_id,
            chunks_deleted=chunks_deleted
        )
        
        return DeleteDocumentResponse(
            status="success",
            doc_id=doc_id,
            chunks_deleted=chunks_deleted,
            message=f"Document {doc_id} and {chunks_deleted} chunks deleted successfully"
        )
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error("Failed to delete document", doc_id=doc_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )


@app.post("/embed", response_model=EmbedResponse)
async def generate_embeddings(request: EmbedRequest):
    """
    Generate embeddings for given texts.
    
    Uses Ollama for efficient batch embedding generation.
    """
    logger.info("Embedding generation requested", text_count=len(request.texts))
    
    if not embedder:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No embedding model configured. Please select and download an embedding model in Settings."
        )
    
    try:
        # Generate embeddings in batch
        embeddings = embedder.embed_batch(
            texts=request.texts,
            show_progress=False
        )
        
        # Filter out None values (failed embeddings)
        valid_embeddings = [e for e in embeddings if e is not None]
        
        if len(valid_embeddings) < len(request.texts):
            logger.warning(
                f"Some embeddings failed: {len(request.texts) - len(valid_embeddings)} out of {len(request.texts)}"
            )
        
        return EmbedResponse(
            embeddings=valid_embeddings,
            count=len(valid_embeddings)
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding generation failed: {str(e)}"
        )


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
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


def main():
    """Main entry point for the server."""
    logger.info("Starting uvicorn server")
    
    # Run uvicorn server
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False  # Set to True for development
    )


if __name__ == "__main__":
    main()