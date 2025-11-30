"""
Enhanced document ingestion pipeline with improved extractors and chunkers.
"""
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass

from extractors.extractor_factory_v2 import EnhancedExtractorFactory, ExtractionError
from rag.chunker_v2 import EnhancedSemanticChunker, EnhancedChunk
from rag.embedder import Embedder
from utils.chroma_client import ChromaClient
from utils.logger import get_logger

logger = get_logger()


@dataclass
class EnhancedIngestResult:
    """Result of enhanced document ingestion."""
    doc_id: str
    chunks_created: int
    status: str
    message: Optional[str] = None
    error: Optional[str] = None
    extraction_method: Optional[str] = None
    has_formatting: bool = False
    has_tables: bool = False


class EnhancedIngestPipeline:
    """
    Enhanced document ingestion pipeline with improved extraction and chunking.
    
    Features:
    - Enhanced PDF extraction with tables and structure
    - DOCX extraction with formatting (bold, italic, lists)
    - Sentence-aware chunking (no mid-sentence splits)
    - Structure preservation (tables, code blocks, lists)
    - Backward compatible with existing pipeline
    """
    
    def __init__(
        self,
        chroma_client: ChromaClient,
        embedder: Embedder,
        use_enhanced_extractors: bool = True,
        use_enhanced_chunker: bool = True,
        use_ocr: bool = False,
        validate_files: bool = True
    ):
        """
        Initialize enhanced ingestion pipeline.
        
        Args:
            chroma_client: ChromaDB client for storage
            embedder: Embedder for generating embeddings
            use_enhanced_extractors: Use enhanced extractors (v2)
            use_enhanced_chunker: Use enhanced sentence-aware chunker
            use_ocr: Whether to use OCR for scanned PDFs
            validate_files: Whether to validate files before processing
        """
        self.chroma = chroma_client
        self.embedder = embedder
        self.use_enhanced_chunker = use_enhanced_chunker
        
        # Initialize enhanced extractor factory
        self.extractor = EnhancedExtractorFactory(
            validate_files=validate_files,
            use_ocr=use_ocr,
            use_enhanced_extractors=use_enhanced_extractors
        )
        
        # Initialize enhanced chunker
        if use_enhanced_chunker:
            self.chunker = EnhancedSemanticChunker(
                chunk_size=320,
                overlap=50
            )
        else:
            # Fallback to basic chunker
            from rag.chunker import SemanticChunker
            self.chunker = SemanticChunker(
                chunk_size=320,
                overlap=50
            )
        
        logger.info(
            "EnhancedIngestPipeline initialized",
            enhanced_extractors=use_enhanced_extractors,
            enhanced_chunker=use_enhanced_chunker,
            use_ocr=use_ocr,
            validate_files=validate_files
        )
    
    def process_document(
        self,
        file_path: str,
        doc_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ) -> EnhancedIngestResult:
        """
        Process a document through the enhanced ingestion pipeline.
        
        Args:
            file_path: Path to document file
            doc_id: Optional document ID (generates UUID if None)
            metadata: Optional additional metadata
            progress_callback: Optional callback(stage, current, total) for progress
            
        Returns:
            EnhancedIngestResult with processing details
        """
        # Generate doc_id if not provided
        if doc_id is None:
            doc_id = str(uuid.uuid4())
        
        metadata = metadata or {}
        path = Path(file_path)
        
        logger.info(
            "Starting enhanced document ingestion",
            doc_id=doc_id,
            filename=path.name
        )
        
        try:
            # Stage 1: Extract text with enhanced extractor
            if progress_callback:
                progress_callback("extraction", 0, 100)
            
            text, extraction_metadata = self._extract_text(file_path)
            
            if progress_callback:
                progress_callback("extraction", 100, 100)
            
            # Merge metadata
            full_metadata = {
                **metadata,
                **extraction_metadata,
                'doc_id': doc_id,
                'filename': path.name,
                'file_type': path.suffix.lower().lstrip('.')
            }
            
            # Stage 2: Chunk text with enhanced chunker
            if progress_callback:
                progress_callback("chunking", 0, 100)
            
            chunks = self._chunk_text(text, full_metadata)
            
            if progress_callback:
                progress_callback("chunking", 100, 100)
            
            if not chunks:
                logger.warning("No chunks created", doc_id=doc_id)
                return EnhancedIngestResult(
                    doc_id=doc_id,
                    chunks_created=0,
                    status="completed",
                    message="No content to process"
                )
            
            # Stage 3: Generate embeddings
            if progress_callback:
                progress_callback("embedding", 0, len(chunks))
            
            embeddings = self._generate_embeddings(chunks, progress_callback)
            
            if progress_callback:
                progress_callback("embedding", len(chunks), len(chunks))
            
            # Stage 4: Store in ChromaDB
            if progress_callback:
                progress_callback("storage", 0, 100)
            
            chunks_stored = self._store_chunks(doc_id, chunks, embeddings)
            
            if progress_callback:
                progress_callback("storage", 100, 100)
            
            logger.info(
                "Enhanced document ingestion completed",
                doc_id=doc_id,
                chunks_created=chunks_stored
            )
            
            return EnhancedIngestResult(
                doc_id=doc_id,
                chunks_created=chunks_stored,
                status="completed",
                message=f"Successfully processed {chunks_stored} chunks",
                extraction_method=extraction_metadata.get('extraction_method', 'standard'),
                has_formatting=extraction_metadata.get('has_formatting', False),
                has_tables=extraction_metadata.get('has_tables', False)
            )
        
        except ExtractionError as e:
            logger.error("Extraction failed", doc_id=doc_id, error=str(e))
            self.cleanup_failed_ingestion(doc_id)
            
            return EnhancedIngestResult(
                doc_id=doc_id,
                chunks_created=0,
                status="failed",
                error=f"Extraction failed: {str(e)}"
            )
        
        except Exception as e:
            logger.error("Document ingestion failed", doc_id=doc_id, error=str(e), exc_info=True)
            self.cleanup_failed_ingestion(doc_id)
            
            return EnhancedIngestResult(
                doc_id=doc_id,
                chunks_created=0,
                status="failed",
                error=f"Unexpected error: {str(e)}"
            )
    
    def _extract_text(self, file_path: str) -> tuple[str, Dict[str, Any]]:
        """Extract text using enhanced extractor."""
        try:
            logger.info(f"[EXTRACTION] Starting extraction for: {file_path}")
            text, metadata = self.extractor.extract(file_path)
            
            logger.info(
                f"[EXTRACTION] Extracted {len(text)} characters from {metadata.get('page_count', 0)} pages",
                is_scanned=metadata.get('is_scanned', False),
                extraction_method=metadata.get('extraction_method', 'standard'),
                has_tables=metadata.get('has_tables', False),
                has_formatting=metadata.get('has_formatting', False)
            )
            
            if not text or not text.strip():
                logger.error(f"[EXTRACTION] No text content extracted from document: {file_path}")
                raise ExtractionError("No text content extracted from document")
            
            return text, metadata
        
        except ExtractionError:
            raise
        except Exception as e:
            logger.error(f"[EXTRACTION] Text extraction failed: {str(e)}", exc_info=True)
            raise ExtractionError(f"Text extraction failed: {str(e)}") from e
    
    def _chunk_text(self, text: str, metadata: Dict[str, Any]) -> List:
        """Chunk text using enhanced or basic chunker."""
        try:
            logger.info(
                f"[CHUNKING] Starting chunking with {'enhanced' if self.use_enhanced_chunker else 'basic'} chunker",
                text_length=len(text)
            )
            
            if self.use_enhanced_chunker:
                # Use enhanced sentence-aware chunker
                chunks = self.chunker.chunk_with_structure(text, metadata)
            else:
                # Use basic chunker
                chunks = self.chunker.chunk(text, metadata)
            
            logger.info(f"[CHUNKING] Created {len(chunks)} chunks from {len(text)} characters")
            
            return chunks
        
        except Exception as e:
            logger.error(f"[CHUNKING] Chunking failed: {e}", exc_info=True)
            raise RuntimeError(f"Text chunking failed: {str(e)}") from e
    
    def _generate_embeddings(
        self,
        chunks: List,
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ) -> List[List[float]]:
        """Generate embeddings for chunks."""
        try:
            # Extract chunk texts
            chunk_texts = [chunk.text for chunk in chunks]
            
            logger.info(f"[EMBEDDING] Generating embeddings for {len(chunk_texts)} chunks")
            
            # Define progress callback for embedder
            def embedding_progress(current: int, total: int):
                if progress_callback:
                    progress_callback("embedding", current, total)
            
            # Generate embeddings in batches
            embeddings = self.embedder.embed_batch(
                chunk_texts,
                show_progress=len(chunk_texts) > 50,
                progress_callback=embedding_progress
            )
            
            # Filter out None embeddings
            valid_embeddings = [e for e in embeddings if e is not None]
            
            # Check failure rate
            failure_rate = (len(chunks) - len(valid_embeddings)) / len(chunks)
            if failure_rate > 0.5:
                logger.error(
                    f"[EMBEDDING] High failure rate: {len(chunks) - len(valid_embeddings)}/{len(chunks)} failed"
                )
                raise RuntimeError(
                    f"Embedding generation failed for {len(chunks) - len(valid_embeddings)} "
                    f"out of {len(chunks)} chunks ({failure_rate:.1%} failure rate)"
                )
            
            if len(valid_embeddings) < len(chunks):
                logger.warning(
                    f"[EMBEDDING] Some embeddings failed: {len(chunks) - len(valid_embeddings)} chunks skipped"
                )
            
            logger.info(f"[EMBEDDING] Successfully generated {len(valid_embeddings)} embeddings")
            
            return valid_embeddings
        
        except Exception as e:
            logger.error(f"[EMBEDDING] Embedding generation failed: {e}", exc_info=True)
            raise RuntimeError(f"Embedding generation failed: {str(e)}") from e
    
    def _store_chunks(
        self,
        doc_id: str,
        chunks: List,
        embeddings: List[List[float]]
    ) -> int:
        """Store chunks with embeddings in ChromaDB."""
        try:
            chunk_texts = []
            chunk_metadatas = []
            valid_embeddings = []
            
            logger.info(f"[STORAGE] Preparing to store {len(chunks)} chunks with {len(embeddings)} embeddings")
            
            # Handle case where some embeddings failed
            embedding_idx = 0
            for chunk in chunks:
                if embedding_idx < len(embeddings) and embeddings[embedding_idx] is not None:
                    chunk_texts.append(chunk.text)
                    
                    # Prepare metadata
                    chunk_metadata = {
                        'doc_id': doc_id,
                        'filename': chunk.metadata.get('filename', 'unknown'),
                        'position': chunk.position,
                        'tokens': chunk.tokens,
                        'chunk_type': chunk.metadata.get('chunk_type', 'generic')
                    }
                    
                    # Add optional fields
                    if chunk.page_number is not None:
                        chunk_metadata['page'] = chunk.page_number
                    
                    if chunk.heading is not None:
                        chunk_metadata['heading'] = chunk.heading
                    
                    # Add enhanced chunk metadata
                    if hasattr(chunk, 'sentence_count') and chunk.sentence_count:
                        chunk_metadata['sentence_count'] = chunk.sentence_count
                    
                    if hasattr(chunk, 'has_table'):
                        chunk_metadata['has_table'] = chunk.has_table
                    
                    if hasattr(chunk, 'has_list'):
                        chunk_metadata['has_list'] = chunk.has_list
                    
                    if hasattr(chunk, 'has_code'):
                        chunk_metadata['has_code'] = chunk.has_code
                    
                    # Preserve important metadata fields
                    important_fields = ['documentTitle', 'courseId', 'chatId', 'docType']
                    for field in important_fields:
                        if field in chunk.metadata:
                            chunk_metadata[field] = chunk.metadata[field]
                    
                    # Add any additional metadata
                    for key, value in chunk.metadata.items():
                        if key not in chunk_metadata and isinstance(value, (str, int, float, bool)):
                            chunk_metadata[key] = value
                    
                    chunk_metadatas.append(chunk_metadata)
                    valid_embeddings.append(embeddings[embedding_idx])
                    embedding_idx += 1
            
            if not chunk_texts:
                logger.error(f"[STORAGE] No valid chunks to store for doc_id: {doc_id}")
                return 0
            
            logger.info(
                f"[STORAGE] Storing {len(chunk_texts)} chunks in ChromaDB for doc_id: {doc_id}"
            )
            
            # Store in ChromaDB
            chunks_stored = self.chroma.add_chunks(
                doc_id=doc_id,
                chunks=chunk_texts,
                embeddings=valid_embeddings,
                metadatas=chunk_metadatas
            )
            
            logger.info(f"[STORAGE] Successfully stored {chunks_stored} chunks in ChromaDB")
            
            return chunks_stored
        
        except Exception as e:
            logger.error(f"[STORAGE] Failed to store chunks: {e}", doc_id=doc_id, exc_info=True)
            raise RuntimeError(f"Chunk storage failed: {str(e)}") from e
    
    def cleanup_failed_ingestion(self, doc_id: str) -> None:
        """Clean up partial data from a failed ingestion."""
        try:
            logger.info("Cleaning up failed ingestion", doc_id=doc_id)
            
            deleted_count = self.chroma.delete_document(doc_id)
            
            if deleted_count > 0:
                logger.info(
                    "Cleanup completed - removed partial data",
                    doc_id=doc_id,
                    chunks_deleted=deleted_count
                )
            else:
                logger.debug(
                    "Cleanup completed - no partial data found",
                    doc_id=doc_id
                )
        
        except Exception as e:
            logger.error(
                "Cleanup failed - manual intervention may be required",
                doc_id=doc_id,
                error=str(e)
            )
    
    def validate_document(self, file_path: str) -> tuple[bool, Optional[str]]:
        """Validate a document before processing."""
        try:
            path = Path(file_path)
            if not path.exists():
                return False, f"File not found: {file_path}"
            
            if not path.is_file():
                return False, f"Path is not a file: {file_path}"
            
            # Validate using extractor
            validation_result = self.extractor.validate_file(file_path)
            
            if not validation_result.is_valid:
                error_msg = "; ".join(validation_result.errors)
                return False, f"Validation failed: {error_msg}"
            
            # Log warnings if any
            if validation_result.warnings:
                for warning in validation_result.warnings:
                    logger.warning(f"Validation warning: {warning}")
            
            return True, None
        
        except Exception as e:
            logger.error(f"Validation error: {e}")
            return False, f"Validation error: {str(e)}"
    
    def get_supported_file_types(self) -> List[str]:
        """Get list of supported file extensions."""
        return self.extractor.get_supported_extensions()
