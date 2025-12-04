"""
Embedding generation implementation using Ollama.
Provides efficient batch processing and async support for non-blocking execution.
"""
import asyncio
import logging
import hashlib
import os
from typing import List, Optional, Callable, Dict
from collections import OrderedDict
import aiohttp

logger = logging.getLogger("pinguin_backend.rag.embedder")


class Embedder:
    """
    Embedder class for generating text embeddings using Ollama.
    
    Supports both single and batch embedding generation with async support
    for non-blocking execution.
    """
    
    def __init__(
        self, 
        model_name: Optional[str] = None,
        batch_size: int = 32,
        ollama_host: str = "http://localhost:11434",
        enable_cache: bool = True,
        cache_size: int = 1000
    ):
        """
        Initialize the Embedder with an Ollama embedding model.
        
        Args:
            model_name: Name of the Ollama embedding model to use.
                       If None, uses model from EMBEDDING_MODEL environment variable.
                       Examples: "nomic-embed-text:v1.5", "bge-m3:567m", "all-minilm:33m"
            batch_size: Batch size for batch processing (default: 32)
            ollama_host: Ollama server URL (default: http://localhost:11434)
            enable_cache: Whether to enable embedding caching (default: True)
            cache_size: Maximum cache size (default: 1000)
        """
        # Get model name from environment if not provided
        if model_name is None:
            model_name = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text:v1.5")
        
        self.model_name = model_name
        self.batch_size = batch_size
        self.ollama_host = ollama_host.rstrip('/')
        
        # Initialize embedding cache (LRU)
        self.cache_enabled = enable_cache
        self.cache_size = cache_size
        self._embedding_cache: OrderedDict[str, List[float]] = OrderedDict()
        self._cache_hits = 0
        self._cache_misses = 0
        
        logger.info(
            f"Initialized Ollama embedder with model: {model_name} "
            f"(cache_enabled={enable_cache})"
        )
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key from text."""
        # Use first 200 chars + hash of full text for cache key
        text_normalized = text.strip().lower()
        text_hash = hashlib.md5(text_normalized.encode()).hexdigest()
        return text_hash
    
    def _call_ollama_embed(self, text: str) -> List[float]:
        """
        Call Ollama API to generate embedding (synchronous).
        
        Args:
            text: Input text to embed
            
        Returns:
            Embedding vector as list of floats
        """
        import requests
        
        url = f"{self.ollama_host}/api/embeddings"
        payload = {
            "model": self.model_name,
            "prompt": text
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            return data.get("embedding", [])
        except Exception as e:
            logger.error(f"Ollama embedding request failed: {e}")
            raise RuntimeError(f"Failed to get embedding from Ollama: {e}")
    
    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for a single text using Ollama.
        
        Args:
            text: Input text to embed
            
        Returns:
            Embedding vector as list of floats
            
        Raises:
            ValueError: If text is empty
            RuntimeError: If embedding generation fails
        """
        if not text or not text.strip():
            raise ValueError("Cannot embed empty text")
        
        # Check cache
        if self.cache_enabled:
            cache_key = self._get_cache_key(text)
            
            if cache_key in self._embedding_cache:
                # Move to end (most recently used)
                self._embedding_cache.move_to_end(cache_key)
                self._cache_hits += 1
                logger.debug(f"Embedding cache hit (hits={self._cache_hits})")
                return self._embedding_cache[cache_key]
            
            self._cache_misses += 1
        
        try:
            # Generate embedding via Ollama
            embedding_list = self._call_ollama_embed(text)
            
            if not embedding_list:
                raise RuntimeError("Ollama returned empty embedding")
            
            # Store in cache
            if self.cache_enabled:
                # Evict oldest if cache is full
                if len(self._embedding_cache) >= self.cache_size:
                    self._embedding_cache.popitem(last=False)
                
                self._embedding_cache[cache_key] = embedding_list
            
            return embedding_list
            
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise RuntimeError(f"Embedding generation failed: {e}")
    
    def embed_batch(
        self, 
        texts: List[str],
        show_progress: bool = False,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts using Ollama.
        
        Processes embeddings one by one (Ollama doesn't support true batch processing).
        Handles errors gracefully.
        
        Args:
            texts: List of input texts to embed
            show_progress: Whether to show progress bar (default: False)
            progress_callback: Optional callback function(current, total) for progress updates
            
        Returns:
            List of embedding vectors
            
        Raises:
            ValueError: If texts list is empty
            RuntimeError: If embedding generation fails
        """
        if not texts:
            raise ValueError("Cannot embed empty text list")
        
        # Filter out empty texts and track indices
        valid_texts = []
        valid_indices = []
        
        for i, text in enumerate(texts):
            if text and text.strip():
                valid_texts.append(text)
                valid_indices.append(i)
            else:
                logger.warning(f"Skipping empty text at index {i}")
        
        if not valid_texts:
            raise ValueError("All texts are empty")
        
        try:
            # For large batches, show progress
            if len(valid_texts) > 50 and show_progress:
                logger.info(f"Processing {len(valid_texts)} texts via Ollama")
            
            # Call progress callback at start
            if progress_callback:
                progress_callback(0, len(valid_texts))
            
            # Generate embeddings one by one
            embedding_list = []
            for i, text in enumerate(valid_texts):
                embedding = self.embed(text)
                embedding_list.append(embedding)
                
                # Update progress
                if progress_callback and (i + 1) % 10 == 0:
                    progress_callback(i + 1, len(valid_texts))
            
            # Call progress callback at completion
            if progress_callback:
                progress_callback(len(valid_texts), len(valid_texts))
            
            logger.info(f"Successfully generated {len(embedding_list)} embeddings via Ollama")
            
            # If some texts were filtered out, create full result with None for invalid
            if len(valid_texts) < len(texts):
                full_results = [None] * len(texts)
                for idx, embedding in zip(valid_indices, embedding_list):
                    full_results[idx] = embedding
                return full_results
            
            return embedding_list
            
        except Exception as e:
            logger.error(f"Failed to generate batch embeddings: {e}")
            raise RuntimeError(f"Batch embedding generation failed: {e}")
    
    async def embed_async(self, text: str) -> List[float]:
        """
        Generate embedding for a single text asynchronously.
        
        Runs embedding generation in a thread pool to avoid blocking
        the event loop.
        
        Args:
            text: Input text to embed
            
        Returns:
            Embedding vector as list of floats
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.embed, text)
    
    async def embed_batch_async(
        self, 
        texts: List[str],
        show_progress: bool = False,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts asynchronously.
        
        Runs batch embedding generation in a thread pool to avoid blocking
        the event loop. For large batches, processes in chunks and yields
        control between batches.
        
        Args:
            texts: List of input texts to embed
            show_progress: Whether to show progress bar (default: False)
            progress_callback: Optional callback function(current, total) for progress updates
            
        Returns:
            List of embedding vectors
        """
        if not texts:
            raise ValueError("Cannot embed empty text list")
        
        # For small batches, use simple async execution
        if len(texts) <= self.batch_size * 2:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, 
                self.embed_batch, 
                texts, 
                show_progress,
                progress_callback
            )
        
        # For large batches, process in chunks and yield control
        return await self._embed_batch_chunked_async(
            texts, 
            show_progress, 
            progress_callback
        )
    
    async def _embed_batch_chunked_async(
        self,
        texts: List[str],
        show_progress: bool = False,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[List[float]]:
        """
        Process large batches in chunks, yielding control between batches.
        
        This prevents blocking the event loop for long periods when processing
        many embeddings.
        
        Args:
            texts: List of input texts to embed
            show_progress: Whether to show progress bar
            progress_callback: Optional callback for progress updates
            
        Returns:
            List of embedding vectors
        """
        # Process in chunks of batch_size * 4 (e.g., 128 texts at a time)
        chunk_size = self.batch_size * 4
        total_texts = len(texts)
        all_embeddings = []
        
        logger.info(f"Processing {total_texts} texts in chunks of {chunk_size}")
        
        # Create progress bar if requested
        pbar = None
        if show_progress:
            pbar = tqdm(total=total_texts, desc="Generating embeddings", unit="text")
        
        try:
            for i in range(0, total_texts, chunk_size):
                chunk = texts[i:i + chunk_size]
                
                # Process chunk in thread pool
                loop = asyncio.get_event_loop()
                chunk_embeddings = await loop.run_in_executor(
                    None,
                    self._embed_chunk_with_error_handling,
                    chunk,
                    False  # Don't show progress for individual chunks
                )
                
                all_embeddings.extend(chunk_embeddings)
                
                # Update progress
                processed = min(i + chunk_size, total_texts)
                if pbar:
                    pbar.update(len(chunk))
                
                if progress_callback:
                    progress_callback(processed, total_texts)
                
                # Yield control to event loop
                await asyncio.sleep(0)
            
            if pbar:
                pbar.close()
            
            logger.info(f"Successfully generated {len(all_embeddings)} embeddings")
            return all_embeddings
            
        except Exception as e:
            if pbar:
                pbar.close()
            logger.error(f"Failed during chunked batch processing: {e}")
            raise RuntimeError(f"Chunked batch embedding failed: {e}")
    
    def _embed_chunk_with_error_handling(
        self,
        texts: List[str],
        show_progress: bool = False
    ) -> List[List[float]]:
        """
        Embed a chunk of texts with error handling.
        
        Falls back to processing texts individually if needed.
        
        Args:
            texts: List of texts to embed
            show_progress: Whether to show progress
            
        Returns:
            List of embeddings (None for failed texts)
        """
        embeddings = []
        for i, text in enumerate(texts):
            try:
                if text and text.strip():
                    embedding = self.embed(text)
                    embeddings.append(embedding)
                else:
                    embeddings.append(None)
                    logger.warning(f"Skipping empty text at index {i}")
            except Exception as text_error:
                logger.error(f"Failed to embed text at index {i}: {text_error}")
                embeddings.append(None)
        
        return embeddings
    
    def get_embedding_dimension(self) -> int:
        """
        Get the dimension of embeddings produced by this model.
        
        Returns:
            Embedding dimension (queries Ollama with a test embedding)
        """
        try:
            # Generate a test embedding to get dimension
            test_embedding = self.embed("test")
            return len(test_embedding)
        except Exception as e:
            logger.warning(f"Failed to get embedding dimension: {e}, using default 768")
            return 768  # Common default dimension
    
    def get_cache_stats(self) -> Dict[str, any]:
        """
        Get embedding cache statistics.
        
        Returns:
            Dictionary with cache statistics
        """
        if not self.cache_enabled:
            return {"enabled": False}
        
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        return {
            "enabled": True,
            "size": len(self._embedding_cache),
            "max_size": self.cache_size,
            "hits": self._cache_hits,
            "misses": self._cache_misses,
            "hit_rate": f"{hit_rate:.1f}%"
        }
    
    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        if self.cache_enabled:
            self._embedding_cache.clear()
            logger.info("Embedding cache cleared")
    
    def __repr__(self) -> str:
        cache_info = f", cache={len(self._embedding_cache)}/{self.cache_size}" if self.cache_enabled else ""
        return (
            f"Embedder(model={self.model_name}, "
            f"batch_size={self.batch_size}, "
            f"device={self.model.device}{cache_info})"
        )
