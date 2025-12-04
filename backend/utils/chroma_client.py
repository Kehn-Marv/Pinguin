"""
ChromaDB client wrapper for Pinguin backend.
Manages vector database operations with connection management and error handling.
"""
import chromadb
from chromadb.config import Settings
from chromadb.api.models.Collection import Collection
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import uuid

from utils.logger import get_logger

logger = get_logger()


class ChromaClient:
    """
    Wrapper for ChromaDB client with connection management.
    
    Provides methods for:
    - Collection creation with cosine similarity
    - Adding chunks with embeddings
    - Querying with similarity threshold
    - Deleting documents and chunks
    """
    
    def __init__(
        self,
        persist_directory: Optional[Path] = None,
        collection_name: str = "pinguin_documents"
    ):
        """
        Initialize ChromaDB client.
        
        Args:
            persist_directory: Directory for ChromaDB persistence (default: ./chroma_db)
            collection_name: Name of the collection to use
        """
        if persist_directory is None:
            persist_directory = Path(__file__).parent.parent / "chroma_db"
        
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        self.collection_name = collection_name
        
        logger.info(
            "Initializing ChromaDB client",
            persist_directory=str(self.persist_directory),
            collection_name=collection_name
        )
        
        # Initialize ChromaDB client with persistence
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Get or create collection
        self.collection = self._get_or_create_collection()
        
        logger.info("ChromaDB client initialized successfully")
    
    def _get_or_create_collection(self) -> Collection:
        """
        Get existing collection or create new one with cosine similarity.
        
        Returns:
            ChromaDB collection
        """
        try:
            # Try to get existing collection
            collection = self.client.get_collection(name=self.collection_name)
            logger.info(f"Using existing collection: {self.collection_name}")
            return collection
        except Exception:
            # Create new collection with cosine similarity
            logger.info(f"Creating new collection: {self.collection_name}")
            collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            return collection
    
    def add_chunks(
        self,
        doc_id: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]]
    ) -> int:
        """
        Add chunks with embeddings to the collection.
        
        Args:
            doc_id: Document identifier
            chunks: List of chunk texts
            embeddings: List of embedding vectors
            metadatas: List of metadata dictionaries
        
        Returns:
            Number of chunks added
        
        Raises:
            ValueError: If input lists have different lengths
            Exception: If ChromaDB operation fails
        """
        if not (len(chunks) == len(embeddings) == len(metadatas)):
            raise ValueError(
                f"Input length mismatch: chunks={len(chunks)}, "
                f"embeddings={len(embeddings)}, metadatas={len(metadatas)}"
            )
        
        if not chunks:
            logger.warning("No chunks to add", doc_id=doc_id)
            return 0
        
        try:
            # Generate unique IDs for each chunk
            chunk_ids = [f"{doc_id}_chunk_{i}_{uuid.uuid4().hex[:8]}" for i in range(len(chunks))]
            
            # Add doc_id to all metadata entries
            for metadata in metadatas:
                metadata["doc_id"] = doc_id
            
            # Add to collection
            self.collection.add(
                ids=chunk_ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=metadatas
            )
            
            logger.info(
                "Added chunks to ChromaDB",
                doc_id=doc_id,
                chunk_count=len(chunks)
            )
            
            return len(chunks)
        
        except Exception as e:
            logger.error(
                "Failed to add chunks to ChromaDB",
                doc_id=doc_id,
                error=str(e)
            )
            raise
    
    def query(
        self,
        query_embedding: List[float],
        n_results: int = 10,
        where: Optional[Dict[str, Any]] = None,
        similarity_threshold: Optional[float] = None
    ) -> Tuple[List[str], List[Dict[str, Any]], List[float], List[str]]:
        """
        Query the collection with an embedding vector.
        
        Args:
            query_embedding: Query embedding vector
            n_results: Number of results to return
            where: Optional metadata filter
            similarity_threshold: Optional minimum similarity score (0-1)
        
        Returns:
            Tuple of (documents, metadatas, scores, ids)
            - documents: List of chunk texts
            - metadatas: List of metadata dictionaries
            - scores: List of similarity scores (converted from distances)
            - ids: List of chunk IDs
        """
        try:
            # Query ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where,
                include=["documents", "metadatas", "distances"]
            )
            
            # Extract results
            documents = results["documents"][0] if results["documents"] else []
            metadatas = results["metadatas"][0] if results["metadatas"] else []
            distances = results["distances"][0] if results["distances"] else []
            ids = results["ids"][0] if results["ids"] else []
            
            # Convert distances to cosine similarity scores (1 - distance)
            scores = [1.0 - dist for dist in distances]
            
            # Filter by similarity threshold if provided
            if similarity_threshold is not None:
                filtered_results = [
                    (doc, meta, score, chunk_id)
                    for doc, meta, score, chunk_id in zip(documents, metadatas, scores, ids)
                    if score >= similarity_threshold
                ]
                
                if filtered_results:
                    documents, metadatas, scores, ids = zip(*filtered_results)
                    documents = list(documents)
                    metadatas = list(metadatas)
                    scores = list(scores)
                    ids = list(ids)
                else:
                    documents, metadatas, scores, ids = [], [], [], []
            
            logger.info(
                "Query executed",
                results_count=len(documents),
                threshold=similarity_threshold
            )
            
            return documents, metadatas, scores, ids
        
        except Exception as e:
            logger.error("Query failed", error=str(e))
            raise
    
    def delete_document(self, doc_id: str) -> int:
        """
        Delete all chunks associated with a document.
        
        Args:
            doc_id: Document identifier
        
        Returns:
            Number of chunks deleted
        """
        try:
            # Get all chunks for this document
            results = self.collection.get(
                where={"doc_id": doc_id},
                include=[]
            )
            
            chunk_ids = results["ids"] if results["ids"] else []
            
            if not chunk_ids:
                logger.warning("No chunks found for document", doc_id=doc_id)
                return 0
            
            # Delete chunks
            self.collection.delete(ids=chunk_ids)
            
            logger.info(
                "Deleted document chunks",
                doc_id=doc_id,
                chunks_deleted=len(chunk_ids)
            )
            
            return len(chunk_ids)
        
        except Exception as e:
            logger.error(
                "Failed to delete document",
                doc_id=doc_id,
                error=str(e)
            )
            raise
    
    def delete_chunks(self, chunk_ids: List[str]) -> int:
        """
        Delete specific chunks by ID.
        
        Args:
            chunk_ids: List of chunk IDs to delete
        
        Returns:
            Number of chunks deleted
        """
        if not chunk_ids:
            return 0
        
        try:
            self.collection.delete(ids=chunk_ids)
            
            logger.info("Deleted chunks", count=len(chunk_ids))
            
            return len(chunk_ids)
        
        except Exception as e:
            logger.error("Failed to delete chunks", error=str(e))
            raise
    
    def get_document_chunks(self, doc_id: str) -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Get all chunks for a document.
        
        Args:
            doc_id: Document identifier
        
        Returns:
            Tuple of (documents, metadatas)
        """
        try:
            results = self.collection.get(
                where={"doc_id": doc_id},
                include=["documents", "metadatas"]
            )
            
            documents = results["documents"] if results["documents"] else []
            metadatas = results["metadatas"] if results["metadatas"] else []
            
            return documents, metadatas
        
        except Exception as e:
            logger.error(
                "Failed to get document chunks",
                doc_id=doc_id,
                error=str(e)
            )
            raise
    
    def count_chunks(self, doc_id: Optional[str] = None) -> int:
        """
        Count chunks in collection, optionally filtered by document.
        
        Args:
            doc_id: Optional document identifier to filter by
        
        Returns:
            Number of chunks
        """
        try:
            if doc_id:
                results = self.collection.get(
                    where={"doc_id": doc_id},
                    include=[]
                )
                return len(results["ids"]) if results["ids"] else 0
            else:
                return self.collection.count()
        
        except Exception as e:
            logger.error("Failed to count chunks", error=str(e))
            raise
    
    def reset_collection(self) -> None:
        """
        Delete and recreate the collection (WARNING: deletes all data).
        """
        try:
            logger.warning("Resetting collection - all data will be deleted")
            self.client.delete_collection(name=self.collection_name)
            self.collection = self._get_or_create_collection()
            logger.info("Collection reset complete")
        
        except Exception as e:
            logger.error("Failed to reset collection", error=str(e))
            raise
    
    def is_healthy(self) -> bool:
        """
        Check if ChromaDB is healthy and responsive.
        
        Returns:
            True if healthy, False otherwise
        """
        try:
            # Try to get collection info
            self.collection.count()
            return True
        except Exception as e:
            logger.error("ChromaDB health check failed", error=str(e))
            return False
