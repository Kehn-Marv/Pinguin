"""
Retrieval and ranking implementation for Pinguin RAG system.
Provides semantic search with filtering, deduplication, and mode-specific ranking.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from dataclasses import dataclass

from utils.chroma_client import ChromaClient
from rag.embedder import Embedder
from rag.query_cache import QueryCache
from models.schemas import StudyMode, RetrievedChunk, ChunkMetadata

logger = logging.getLogger("pinguin_backend.rag.retriever")


@dataclass
class RetrievalConfig:
    """Configuration for retrieval behavior."""
    top_k: int = 10
    similarity_threshold: float = 0.15
    deduplication_threshold: float = 0.92
    mode: StudyMode = StudyMode.FILES


class Retriever:
    """
    Retriever class for semantic search and ranking.
    
    Provides:
    - Vector search with ChromaDB
    - Similarity threshold filtering (default 0.25)
    - Deduplication of similar chunks (>0.92 similarity)
    - Mode-specific ranking adjustments
    """
    
    def __init__(
        self,
        chroma_client: ChromaClient,
        embedder: Embedder,
        enable_cache: bool = True,
        cache_size: int = 100,
        cache_ttl: int = 300
    ):
        """
        Initialize Retriever with ChromaDB client and embedder.
        
        Args:
            chroma_client: ChromaDB client for vector search
            embedder: Embedder for query embedding generation
            enable_cache: Whether to enable query caching (default: True)
            cache_size: Maximum cache size (default: 100)
            cache_ttl: Cache TTL in seconds (default: 300 = 5 min)
        """
        self.chroma = chroma_client
        self.embedder = embedder
        
        # Initialize query cache
        self.cache_enabled = enable_cache
        self.cache = QueryCache(max_size=cache_size, ttl_seconds=cache_ttl) if enable_cache else None
        
        logger.info(
            f"Retriever initialized successfully (cache_enabled={enable_cache})"
        )
    
    def retrieve(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.15,
        mode: StudyMode = StudyMode.FILES,
        doc_filter: Optional[str] = None
    ) -> List[RetrievedChunk]:
        """
        Retrieve relevant chunks for a query with filtering and ranking.
        
        Process:
        1. Check cache for existing results
        2. Embed the query
        3. Perform vector search in ChromaDB
        4. Convert distances to cosine similarity scores
        5. Filter by similarity threshold
        6. Deduplicate similar chunks
        7. Apply mode-specific ranking
        8. Cache and return top-k results
        
        Args:
            query: Search query text
            top_k: Number of results to return (default: 10)
            similarity_threshold: Minimum similarity score 0-1 (default: 0.15)
            mode: Study mode for ranking adjustments (default: FILES)
            doc_filter: Optional document ID to filter results
            
        Returns:
            List of RetrievedChunk objects sorted by relevance
            
        Raises:
            ValueError: If query is empty
            RuntimeError: If retrieval fails
        """
        if not query or not query.strip():
            raise ValueError("Query cannot be empty")
        
        try:
            # Step 1: Check cache
            if self.cache_enabled and self.cache:
                doc_ids = [doc_filter] if doc_filter else None
                cached_results = self.cache.get(
                    query=query,
                    mode=mode,
                    doc_ids=doc_ids,
                    top_k=top_k,
                    similarity_threshold=similarity_threshold
                )
                
                if cached_results is not None:
                    logger.info(
                        f"Cache hit: returning {len(cached_results)} cached results"
                    )
                    return cached_results
            
            logger.info(
                f"Starting retrieval: query_length={len(query)}, top_k={top_k}, "
                f"threshold={similarity_threshold}, mode={mode.value}"
            )
            
            # Step 1: Embed query
            query_embedding = self.embedder.embed(query)
            
            # Step 2: Perform vector search (retrieve more for filtering)
            # Limit retrieval to top-k (8-12) chunks for performance
            # Retrieve 2x top_k to account for filtering and deduplication
            # But cap at 50 to avoid excessive retrieval
            search_k = min(max(top_k * 2, 12), 50)
            
            where_filter = {"doc_id": doc_filter} if doc_filter else None
            
            documents, metadatas, scores, chunk_ids = self.chroma.query(
                query_embedding=query_embedding,
                n_results=search_k,
                where=where_filter,
                similarity_threshold=None  # We'll filter manually for better control
            )
            
            # Step 3: Scores are already converted to cosine similarity by ChromaClient
            # Step 4: Filter by similarity threshold with early termination
            filtered_chunks = []
            low_score_count = 0
            
            # Log all scores for debugging
            if scores:
                logger.info(
                    f"Retrieved scores: min={min(scores):.3f}, max={max(scores):.3f}, "
                    f"avg={sum(scores)/len(scores):.3f}, threshold={similarity_threshold:.3f}"
                )
            
            for doc, meta, score, chunk_id in zip(documents, metadatas, scores, chunk_ids):
                # Early termination: if we see 3 consecutive low scores, stop processing
                if score < similarity_threshold:
                    low_score_count += 1
                    if low_score_count >= 3:
                        logger.debug(
                            f"Early termination: 3 consecutive scores below threshold "
                            f"(last_score={score:.3f})"
                        )
                        break
                    continue
                
                low_score_count = 0  # Reset counter on good score
                
                # Convert metadata dict to ChunkMetadata
                chunk_metadata = ChunkMetadata(
                    doc_id=meta.get("doc_id", "unknown"),
                    filename=meta.get("filename", "unknown"),
                    page=meta.get("page"),
                    heading=meta.get("heading"),
                    position=meta.get("position", 0),
                    tokens=meta.get("tokens", 0),
                    chunk_type=meta.get("chunk_type"),
                    # Include additional fields for frontend
                    documentTitle=meta.get("documentTitle"),
                    courseId=meta.get("courseId"),
                    chatId=meta.get("chatId"),
                    docType=meta.get("docType")
                )
                
                filtered_chunks.append(
                    RetrievedChunk(
                        chunk_id=chunk_id,
                        text=doc,
                        metadata=chunk_metadata,
                        score=score
                    )
                )
            
            logger.info(
                f"Filtered chunks by threshold: original_count={len(documents)}, "
                f"filtered_count={len(filtered_chunks)}"
            )
            
            if not filtered_chunks:
                logger.warning("No chunks passed similarity threshold")
                return []
            
            # Step 5: Deduplicate similar chunks
            deduped_chunks = self.deduplicate(
                filtered_chunks,
                threshold=0.92
            )
            
            logger.info(
                f"Deduplicated chunks: before={len(filtered_chunks)}, "
                f"after={len(deduped_chunks)}"
            )
            
            # Step 6: Apply mode-specific ranking
            ranked_chunks = self.apply_mode_ranking(deduped_chunks, mode)
            
            # Step 7: Return top-k results
            final_results = ranked_chunks[:top_k]
            
            avg_score = sum(c.score for c in final_results) / len(final_results) if final_results else 0
            logger.info(
                f"Retrieval complete: results_returned={len(final_results)}, "
                f"avg_score={avg_score:.3f}"
            )
            
            # Step 8: Cache results
            if self.cache_enabled and self.cache and final_results:
                doc_ids = [doc_filter] if doc_filter else None
                self.cache.put(
                    query=query,
                    mode=mode,
                    chunks=final_results,
                    doc_ids=doc_ids,
                    top_k=top_k,
                    similarity_threshold=similarity_threshold
                )
            
            return final_results
            
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            raise RuntimeError(f"Retrieval failed: {e}")
    
    def deduplicate(
        self,
        chunks: List[RetrievedChunk],
        threshold: float = 0.92
    ) -> List[RetrievedChunk]:
        """
        Remove near-duplicate chunks based on text similarity.
        
        Compares chunks pairwise and removes duplicates with similarity > threshold.
        Preserves the highest-scoring chunk from each duplicate group.
        
        Args:
            chunks: List of retrieved chunks
            threshold: Similarity threshold for considering chunks as duplicates (default: 0.92)
            
        Returns:
            List of unique chunks with duplicates removed
        """
        if not chunks:
            return []
        
        if len(chunks) == 1:
            return chunks
        
        # Sort by score descending to preserve highest-scoring chunks
        sorted_chunks = sorted(chunks, key=lambda c: c.score, reverse=True)
        
        unique_chunks = []
        seen_texts = []
        
        for chunk in sorted_chunks:
            is_duplicate = False
            
            # Compare with all previously seen chunks
            for seen_text in seen_texts:
                similarity = self._text_similarity(chunk.text, seen_text)
                
                if similarity > threshold:
                    is_duplicate = True
                    logger.debug(
                        f"Duplicate chunk detected: similarity={similarity:.3f}, "
                        f"chunk_id={chunk.chunk_id}"
                    )
                    break
            
            if not is_duplicate:
                unique_chunks.append(chunk)
                seen_texts.append(chunk.text)
        
        return unique_chunks
    
    def _text_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts using character-level overlap.
        
        Uses Jaccard similarity on character n-grams as a fast approximation.
        For more accurate similarity, could use embeddings, but this is faster.
        
        Args:
            text1: First text
            text2: Second text
            
        Returns:
            Similarity score between 0 and 1
        """
        # Use character 3-grams for similarity
        def get_ngrams(text: str, n: int = 3) -> set:
            text = text.lower().strip()
            return set(text[i:i+n] for i in range(len(text) - n + 1))
        
        ngrams1 = get_ngrams(text1)
        ngrams2 = get_ngrams(text2)
        
        if not ngrams1 or not ngrams2:
            return 0.0
        
        # Jaccard similarity
        intersection = len(ngrams1 & ngrams2)
        union = len(ngrams1 | ngrams2)
        
        return intersection / union if union > 0 else 0.0
    
    def apply_mode_ranking(
        self,
        chunks: List[RetrievedChunk],
        mode: StudyMode
    ) -> List[RetrievedChunk]:
        """
        Apply mode-specific ranking adjustments to chunks.
        
        Ranking adjustments:
        - FILES mode: No adjustment (default ranking)
        - CODING mode: Boost chunks containing code (1.2x)
        - THINKING mode: Boost conceptual/theoretical chunks (1.15x)
        
        Args:
            chunks: List of retrieved chunks
            mode: Study mode
            
        Returns:
            List of chunks re-sorted by adjusted scores
        """
        if not chunks:
            return []
        
        # Create copies to avoid modifying originals
        adjusted_chunks = []
        
        for chunk in chunks:
            # Create a copy with potentially adjusted score
            adjusted_chunk = RetrievedChunk(
                chunk_id=chunk.chunk_id,
                text=chunk.text,
                metadata=chunk.metadata,
                score=chunk.score
            )
            
            # Apply mode-specific boosts
            if mode == StudyMode.CODING:
                # Boost chunks with code indicators
                if self._contains_code(chunk.text):
                    adjusted_chunk.score *= 1.2
                    logger.debug(
                        f"Applied coding boost: chunk_id={chunk.chunk_id}, "
                        f"original_score={chunk.score:.3f}, adjusted_score={adjusted_chunk.score:.3f}"
                    )
            
            elif mode == StudyMode.THINKING:
                # Boost chunks with conceptual content
                if self._is_conceptual(chunk.text):
                    adjusted_chunk.score *= 1.15
                    logger.debug(
                        f"Applied thinking boost: chunk_id={chunk.chunk_id}, "
                        f"original_score={chunk.score:.3f}, adjusted_score={adjusted_chunk.score:.3f}"
                    )
            
            # FILES mode: no adjustment needed
            
            adjusted_chunks.append(adjusted_chunk)
        
        # Re-sort by adjusted scores
        sorted_chunks = sorted(adjusted_chunks, key=lambda c: c.score, reverse=True)
        
        chunks_adjusted = sum(1 for c, orig in zip(sorted_chunks, chunks) if c.score != orig.score)
        logger.info(
            f"Applied mode-specific ranking: mode={mode.value}, "
            f"chunks_adjusted={chunks_adjusted}"
        )
        
        return sorted_chunks
    
    def _contains_code(self, text: str) -> bool:
        """
        Check if text contains code indicators.
        
        Looks for:
        - Code blocks (```)
        - Function definitions (def, function, class)
        - Common programming keywords
        - Code-like syntax patterns
        
        Args:
            text: Text to check
            
        Returns:
            True if text appears to contain code
        """
        text_lower = text.lower()
        
        # Code block markers
        if '```' in text or '~~~' in text:
            return True
        
        # Function/class definitions
        code_keywords = [
            'def ', 'function ', 'class ', 'const ', 'let ', 'var ',
            'import ', 'from ', 'return ', 'if __name__',
            'public ', 'private ', 'protected ',
            '=>', '->', '::', '//', '/*', '*/'
        ]
        
        if any(keyword in text_lower for keyword in code_keywords):
            return True
        
        # Check for code-like patterns (multiple lines with indentation)
        lines = text.split('\n')
        indented_lines = sum(1 for line in lines if line.startswith('    ') or line.startswith('\t'))
        
        if len(lines) > 3 and indented_lines / len(lines) > 0.3:
            return True
        
        return False
    
    def _is_conceptual(self, text: str) -> bool:
        """
        Check if text contains conceptual/theoretical content.
        
        Looks for:
        - Theoretical keywords (theory, concept, principle)
        - Explanatory phrases (why, because, reason)
        - Abstract thinking indicators
        
        Args:
            text: Text to check
            
        Returns:
            True if text appears to be conceptual
        """
        text_lower = text.lower()
        
        # Conceptual keywords
        conceptual_keywords = [
            'theory', 'concept', 'principle', 'framework',
            'why', 'because', 'reason', 'explanation',
            'understand', 'meaning', 'significance',
            'abstract', 'fundamental', 'underlying',
            'philosophy', 'approach', 'methodology',
            'perspective', 'viewpoint', 'interpretation'
        ]
        
        # Count keyword occurrences
        keyword_count = sum(1 for keyword in conceptual_keywords if keyword in text_lower)
        
        # Consider conceptual if multiple keywords present
        return keyword_count >= 2
    
    def invalidate_cache_for_document(self, doc_id: str) -> int:
        """
        Invalidate cache entries for a specific document.
        
        Called when a document is deleted or modified.
        
        Args:
            doc_id: Document ID to invalidate
            
        Returns:
            Number of cache entries invalidated
        """
        if not self.cache_enabled or not self.cache:
            return 0
        
        invalidated = self.cache.invalidate_document(doc_id)
        logger.info(f"Invalidated {invalidated} cache entries for doc_id={doc_id}")
        return invalidated
    
    def clear_cache(self) -> None:
        """
        Clear all cache entries.
        
        Called when documents are added/removed or on explicit cache clear.
        """
        if not self.cache_enabled or not self.cache:
            return
        
        self.cache.clear()
        logger.info("Cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with cache statistics or empty dict if cache disabled
        """
        if not self.cache_enabled or not self.cache:
            return {"enabled": False}
        
        stats = self.cache.get_stats()
        stats["enabled"] = True
        return stats
    
    def __repr__(self) -> str:
        cache_info = f", cache={len(self.cache)}" if self.cache_enabled and self.cache else ""
        return f"Retriever(chroma={self.chroma.collection_name}, embedder={self.embedder.model_name}{cache_info})"
