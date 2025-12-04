"""
Query caching implementation for Pinguin RAG system.
Provides LRU cache with TTL for query responses to improve performance.
"""
import time
import hashlib
import logging
from typing import Optional, Dict, Any, List, Tuple
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from models.schemas import RetrievedChunk, StudyMode

logger = logging.getLogger("pinguin_backend.rag.query_cache")


@dataclass
class CacheEntry:
    """Represents a cached query result."""
    key: str
    chunks: List[RetrievedChunk]
    timestamp: float
    hits: int = 0
    mode: StudyMode = StudyMode.FILES
    doc_ids: List[str] = field(default_factory=list)


class QueryCache:
    """
    LRU cache for query responses with TTL (Time To Live).
    
    Features:
    - Cache responses for identical queries (5 min TTL)
    - Generate cache key from query + mode + doc IDs
    - LRU eviction (max 100 entries)
    - Clear cache on document changes
    - Thread-safe operations
    """
    
    def __init__(
        self,
        max_size: int = 100,
        ttl_seconds: int = 300  # 5 minutes
    ):
        """
        Initialize QueryCache.
        
        Args:
            max_size: Maximum number of cache entries (default: 100)
            ttl_seconds: Time to live for cache entries in seconds (default: 300 = 5 min)
        """
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        
        # OrderedDict maintains insertion order for LRU
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        
        # Statistics
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        
        logger.info(
            f"QueryCache initialized: max_size={max_size}, ttl={ttl_seconds}s"
        )
    
    def _generate_cache_key(
        self,
        query: str,
        mode: StudyMode,
        doc_ids: Optional[List[str]] = None,
        top_k: int = 10,
        similarity_threshold: float = 0.25
    ) -> str:
        """
        Generate a unique cache key from query parameters.
        
        The cache key is a hash of:
        - Query text (normalized)
        - Study mode
        - Document IDs (sorted for consistency)
        - Retrieval parameters (top_k, similarity_threshold)
        
        Args:
            query: Search query text
            mode: Study mode
            doc_ids: Optional list of document IDs to filter
            top_k: Number of results
            similarity_threshold: Similarity threshold
            
        Returns:
            SHA-256 hash as cache key
        """
        # Normalize query (lowercase, strip whitespace)
        normalized_query = query.lower().strip()
        
        # Sort doc_ids for consistent hashing
        sorted_doc_ids = sorted(doc_ids) if doc_ids else []
        
        # Create key components
        key_components = [
            normalized_query,
            mode.value,
            ",".join(sorted_doc_ids),
            str(top_k),
            f"{similarity_threshold:.3f}"
        ]
        
        # Generate hash
        key_string = "|".join(key_components)
        cache_key = hashlib.sha256(key_string.encode()).hexdigest()
        
        return cache_key
    
    def get(
        self,
        query: str,
        mode: StudyMode,
        doc_ids: Optional[List[str]] = None,
        top_k: int = 10,
        similarity_threshold: float = 0.25
    ) -> Optional[List[RetrievedChunk]]:
        """
        Retrieve cached query results if available and not expired.
        
        Args:
            query: Search query text
            mode: Study mode
            doc_ids: Optional list of document IDs
            top_k: Number of results
            similarity_threshold: Similarity threshold
            
        Returns:
            Cached chunks if found and valid, None otherwise
        """
        cache_key = self._generate_cache_key(
            query, mode, doc_ids, top_k, similarity_threshold
        )
        
        # Check if key exists
        if cache_key not in self._cache:
            self._misses += 1
            logger.debug(f"Cache miss: key={cache_key[:16]}...")
            return None
        
        entry = self._cache[cache_key]
        current_time = time.time()
        
        # Check if entry has expired
        if current_time - entry.timestamp > self.ttl_seconds:
            # Remove expired entry
            del self._cache[cache_key]
            self._misses += 1
            logger.debug(
                f"Cache expired: key={cache_key[:16]}..., "
                f"age={current_time - entry.timestamp:.1f}s"
            )
            return None
        
        # Move to end (most recently used)
        self._cache.move_to_end(cache_key)
        
        # Update statistics
        entry.hits += 1
        self._hits += 1
        
        logger.debug(
            f"Cache hit: key={cache_key[:16]}..., "
            f"hits={entry.hits}, age={current_time - entry.timestamp:.1f}s"
        )
        
        return entry.chunks
    
    def put(
        self,
        query: str,
        mode: StudyMode,
        chunks: List[RetrievedChunk],
        doc_ids: Optional[List[str]] = None,
        top_k: int = 10,
        similarity_threshold: float = 0.25
    ) -> None:
        """
        Store query results in cache.
        
        If cache is full, evicts least recently used entry.
        
        Args:
            query: Search query text
            mode: Study mode
            chunks: Retrieved chunks to cache
            doc_ids: Optional list of document IDs
            top_k: Number of results
            similarity_threshold: Similarity threshold
        """
        cache_key = self._generate_cache_key(
            query, mode, doc_ids, top_k, similarity_threshold
        )
        
        # Check if we need to evict
        if len(self._cache) >= self.max_size and cache_key not in self._cache:
            # Remove least recently used (first item)
            evicted_key, evicted_entry = self._cache.popitem(last=False)
            self._evictions += 1
            logger.debug(
                f"Cache eviction: key={evicted_key[:16]}..., "
                f"hits={evicted_entry.hits}"
            )
        
        # Create cache entry
        entry = CacheEntry(
            key=cache_key,
            chunks=chunks,
            timestamp=time.time(),
            mode=mode,
            doc_ids=doc_ids or []
        )
        
        # Store in cache (or update if exists)
        self._cache[cache_key] = entry
        
        # Move to end (most recently used)
        self._cache.move_to_end(cache_key)
        
        logger.debug(
            f"Cache put: key={cache_key[:16]}..., "
            f"chunks={len(chunks)}, size={len(self._cache)}/{self.max_size}"
        )
    
    def invalidate_document(self, doc_id: str) -> int:
        """
        Invalidate all cache entries that include a specific document.
        
        Called when a document is deleted or modified.
        
        Args:
            doc_id: Document ID to invalidate
            
        Returns:
            Number of cache entries invalidated
        """
        keys_to_remove = []
        
        for key, entry in self._cache.items():
            # Check if this entry includes the document
            if doc_id in entry.doc_ids:
                keys_to_remove.append(key)
            # Also check if entry has no doc filter (includes all docs)
            elif not entry.doc_ids:
                keys_to_remove.append(key)
        
        # Remove invalidated entries
        for key in keys_to_remove:
            del self._cache[key]
        
        if keys_to_remove:
            logger.info(
                f"Invalidated {len(keys_to_remove)} cache entries for doc_id={doc_id}"
            )
        
        return len(keys_to_remove)
    
    def clear(self) -> None:
        """
        Clear all cache entries.
        
        Called when documents are added/removed or on explicit cache clear.
        """
        entries_cleared = len(self._cache)
        self._cache.clear()
        
        logger.info(f"Cache cleared: {entries_cleared} entries removed")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with cache statistics
        """
        total_requests = self._hits + self._misses
        hit_rate = (self._hits / total_requests * 100) if total_requests > 0 else 0
        
        # Calculate average age of entries
        current_time = time.time()
        ages = [current_time - entry.timestamp for entry in self._cache.values()]
        avg_age = sum(ages) / len(ages) if ages else 0
        
        # Find most hit entry
        most_hit_entry = max(
            self._cache.values(),
            key=lambda e: e.hits,
            default=None
        )
        
        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "evictions": self._evictions,
            "hit_rate": f"{hit_rate:.1f}%",
            "avg_age_seconds": f"{avg_age:.1f}",
            "most_hits": most_hit_entry.hits if most_hit_entry else 0,
            "ttl_seconds": self.ttl_seconds
        }
    
    def __len__(self) -> int:
        """Return number of entries in cache."""
        return len(self._cache)
    
    def __repr__(self) -> str:
        stats = self.get_stats()
        return (
            f"QueryCache(size={stats['size']}/{stats['max_size']}, "
            f"hit_rate={stats['hit_rate']}, ttl={self.ttl_seconds}s)"
        )
