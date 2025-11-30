"""
Enhanced semantic chunking with sentence-aware splitting and better structure preservation.
"""
import logging
import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
import nltk
from nltk.tokenize import sent_tokenize

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

logger = logging.getLogger("pinguin_backend.rag.chunker_v2")


@dataclass
class EnhancedChunk:
    """Enhanced chunk with additional metadata."""
    id: str
    doc_id: str
    text: str
    tokens: int
    position: int
    page_number: Optional[int] = None
    heading: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    sentence_count: Optional[int] = None
    has_table: bool = False
    has_list: bool = False
    has_code: bool = False
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class EnhancedSemanticChunker:
    """
    Enhanced semantic chunker with sentence-aware splitting.
    
    Features:
    - Sentence boundary detection (no mid-sentence splits)
    - Preserves formatting (bold, italic, lists)
    - Keeps tables intact
    - Better handling of code blocks
    - Semantic coherence (keeps related sentences together)
    """
    
    def __init__(
        self,
        chunk_size: int = 320,
        overlap: int = 50
    ):
        """
        Initialize enhanced semantic chunker.
        
        Args:
            chunk_size: Target chunk size in tokens (approximate word count)
            overlap: Overlap between chunks in tokens (approximate word count)
        """
        self.chunk_size = chunk_size
        self.overlap = overlap
        
        logger.info(
            f"EnhancedSemanticChunker initialized: chunk_size={chunk_size}, "
            f"overlap={overlap}"
        )
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text using word-based approximation.
        Since we're using Ollama, we approximate tokens as words.
        """
        if not text:
            return 0
        return len(text.split())
    
    def sentence_aware_chunk(
        self,
        text: str,
        chunk_size: Optional[int] = None,
        overlap: Optional[int] = None
    ) -> List[str]:
        """
        Split text into chunks respecting sentence boundaries.
        
        Args:
            text: Input text to chunk
            chunk_size: Target chunk size in tokens
            overlap: Overlap in tokens
            
        Returns:
            List of text chunks
        """
        if not text or not text.strip():
            return []
        
        chunk_size = chunk_size or self.chunk_size
        overlap = overlap or self.overlap
        
        # Split into sentences
        try:
            sentences = sent_tokenize(text)
        except Exception as e:
            logger.warning(f"Sentence tokenization failed: {e}. Using fallback.")
            # Fallback: split on periods followed by space and capital letter
            sentences = re.split(r'\.(?=\s+[A-Z])', text)
            sentences = [s.strip() + '.' for s in sentences if s.strip()]
        
        if not sentences:
            return [text]
        
        # Group sentences into chunks
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for sentence in sentences:
            sentence_tokens = self.count_tokens(sentence)
            
            # If single sentence exceeds chunk_size, split it
            if sentence_tokens > chunk_size:
                # Save current chunk if it has content
                if current_chunk:
                    chunks.append(' '.join(current_chunk))
                    current_chunk = []
                    current_tokens = 0
                
                # Split long sentence using sliding window
                long_chunks = self._split_long_sentence(sentence, chunk_size, overlap)
                chunks.extend(long_chunks)
                continue
            
            # Check if adding this sentence would exceed chunk_size
            if current_tokens + sentence_tokens > chunk_size and current_chunk:
                # Save current chunk
                chunks.append(' '.join(current_chunk))
                
                # Start new chunk with overlap
                # Keep last few sentences for overlap
                overlap_sentences = []
                overlap_tokens = 0
                
                for sent in reversed(current_chunk):
                    sent_tokens = self.count_tokens(sent)
                    if overlap_tokens + sent_tokens <= overlap:
                        overlap_sentences.insert(0, sent)
                        overlap_tokens += sent_tokens
                    else:
                        break
                
                current_chunk = overlap_sentences
                current_tokens = overlap_tokens
            
            # Add sentence to current chunk
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
        
        # Add final chunk
        if current_chunk:
            chunks.append(' '.join(current_chunk))
        
        logger.debug(f"Created {len(chunks)} sentence-aware chunks from {len(sentences)} sentences")
        return chunks
    
    def _split_long_sentence(self, sentence: str, chunk_size: int, overlap: int) -> List[str]:
        """
        Split a long sentence using word-based sliding window.
        
        Args:
            sentence: Long sentence to split
            chunk_size: Target chunk size in words
            overlap: Overlap in words
            
        Returns:
            List of sentence chunks
        """
        words = sentence.split()
        
        if len(words) <= chunk_size:
            return [sentence]
        
        chunks = []
        start_idx = 0
        
        while start_idx < len(words):
            end_idx = min(start_idx + chunk_size, len(words))
            chunk_words = words[start_idx:end_idx]
            chunk_text = ' '.join(chunk_words)
            chunks.append(chunk_text)
            
            if end_idx >= len(words):
                break
            
            start_idx = end_idx - overlap
        
        return chunks
    
    def chunk_with_structure(
        self,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[EnhancedChunk]:
        """
        Chunk text while preserving structure (tables, lists, code blocks).
        
        Args:
            text: Input text to chunk
            metadata: Optional metadata
            
        Returns:
            List of EnhancedChunk objects
        """
        if not text or not text.strip():
            return []
        
        metadata = metadata or {}
        doc_id = metadata.get('doc_id', 'unknown')
        
        # Detect and extract special structures
        structures = self._extract_structures(text)
        
        chunks = []
        chunk_position = 0
        
        for structure in structures:
            if structure['type'] == 'table':
                # Keep tables intact (don't split)
                chunk = EnhancedChunk(
                    id=f"{doc_id}_chunk_{chunk_position}",
                    doc_id=doc_id,
                    text=structure['content'],
                    tokens=self.count_tokens(structure['content']),
                    position=chunk_position,
                    page_number=metadata.get('page'),
                    heading=metadata.get('heading'),
                    metadata={**metadata, 'structure_type': 'table'},
                    has_table=True
                )
                chunks.append(chunk)
                chunk_position += 1
            
            elif structure['type'] == 'code':
                # Keep code blocks intact
                chunk = EnhancedChunk(
                    id=f"{doc_id}_chunk_{chunk_position}",
                    doc_id=doc_id,
                    text=structure['content'],
                    tokens=self.count_tokens(structure['content']),
                    position=chunk_position,
                    page_number=metadata.get('page'),
                    heading=metadata.get('heading'),
                    metadata={**metadata, 'structure_type': 'code'},
                    has_code=True
                )
                chunks.append(chunk)
                chunk_position += 1
            
            elif structure['type'] == 'list':
                # Keep lists together if possible
                list_tokens = self.count_tokens(structure['content'])
                
                if list_tokens <= self.chunk_size * 1.5:
                    # Keep list intact
                    chunk = EnhancedChunk(
                        id=f"{doc_id}_chunk_{chunk_position}",
                        doc_id=doc_id,
                        text=structure['content'],
                        tokens=list_tokens,
                        position=chunk_position,
                        page_number=metadata.get('page'),
                        heading=metadata.get('heading'),
                        metadata={**metadata, 'structure_type': 'list'},
                        has_list=True
                    )
                    chunks.append(chunk)
                    chunk_position += 1
                else:
                    # Split long list
                    list_chunks = self.sentence_aware_chunk(structure['content'])
                    for list_chunk_text in list_chunks:
                        chunk = EnhancedChunk(
                            id=f"{doc_id}_chunk_{chunk_position}",
                            doc_id=doc_id,
                            text=list_chunk_text,
                            tokens=self.count_tokens(list_chunk_text),
                            position=chunk_position,
                            page_number=metadata.get('page'),
                            heading=metadata.get('heading'),
                            metadata={**metadata, 'structure_type': 'list'},
                            has_list=True
                        )
                        chunks.append(chunk)
                        chunk_position += 1
            
            else:  # Regular text
                # Use sentence-aware chunking
                text_chunks = self.sentence_aware_chunk(structure['content'])
                
                for text_chunk in text_chunks:
                    # Count sentences in chunk
                    try:
                        sentence_count = len(sent_tokenize(text_chunk))
                    except:
                        sentence_count = text_chunk.count('.') + 1
                    
                    chunk = EnhancedChunk(
                        id=f"{doc_id}_chunk_{chunk_position}",
                        doc_id=doc_id,
                        text=text_chunk,
                        tokens=self.count_tokens(text_chunk),
                        position=chunk_position,
                        page_number=metadata.get('page'),
                        heading=metadata.get('heading'),
                        metadata={**metadata, 'structure_type': 'text'},
                        sentence_count=sentence_count
                    )
                    chunks.append(chunk)
                    chunk_position += 1
        
        logger.info(f"Created {len(chunks)} structure-aware chunks for document {doc_id}")
        return chunks
    
    def _extract_structures(self, text: str) -> List[Dict[str, str]]:
        """
        Extract special structures (tables, code blocks, lists) from text.
        
        Args:
            text: Input text
            
        Returns:
            List of structure dictionaries with type and content
        """
        structures = []
        current_pos = 0
        lines = text.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Check for table (markdown table with |)
            if '|' in line and line.strip().startswith('|'):
                table_lines = [line]
                i += 1
                
                # Collect table lines
                while i < len(lines) and '|' in lines[i]:
                    table_lines.append(lines[i])
                    i += 1
                
                structures.append({
                    'type': 'table',
                    'content': '\n'.join(table_lines)
                })
                continue
            
            # Check for code block (```...```)
            if line.strip().startswith('```'):
                code_lines = [line]
                i += 1
                
                # Collect code lines until closing ```
                while i < len(lines):
                    code_lines.append(lines[i])
                    if lines[i].strip().startswith('```'):
                        i += 1
                        break
                    i += 1
                
                structures.append({
                    'type': 'code',
                    'content': '\n'.join(code_lines)
                })
                continue
            
            # Check for list (lines starting with -, *, or numbers)
            if re.match(r'^\s*[-*•]\s+', line) or re.match(r'^\s*\d+\.\s+', line):
                list_lines = [line]
                i += 1
                
                # Collect list items
                while i < len(lines):
                    next_line = lines[i]
                    if re.match(r'^\s*[-*•]\s+', next_line) or re.match(r'^\s*\d+\.\s+', next_line):
                        list_lines.append(next_line)
                        i += 1
                    elif next_line.strip() == '':
                        # Empty line might be part of list
                        if i + 1 < len(lines) and (
                            re.match(r'^\s*[-*•]\s+', lines[i + 1]) or 
                            re.match(r'^\s*\d+\.\s+', lines[i + 1])
                        ):
                            list_lines.append(next_line)
                            i += 1
                        else:
                            break
                    else:
                        break
                
                structures.append({
                    'type': 'list',
                    'content': '\n'.join(list_lines)
                })
                continue
            
            # Regular text - collect until next structure
            text_lines = [line]
            i += 1
            
            while i < len(lines):
                next_line = lines[i]
                
                # Check if next line starts a structure
                is_structure = (
                    ('|' in next_line and next_line.strip().startswith('|')) or
                    next_line.strip().startswith('```') or
                    re.match(r'^\s*[-*•]\s+', next_line) or
                    re.match(r'^\s*\d+\.\s+', next_line)
                )
                
                if is_structure:
                    break
                
                text_lines.append(next_line)
                i += 1
            
            text_content = '\n'.join(text_lines).strip()
            if text_content:
                structures.append({
                    'type': 'text',
                    'content': text_content
                })
        
        return structures


def create_enhanced_chunker(
    doc_type: str = 'generic',
    chunk_size: int = 320,
    overlap: int = 50
) -> EnhancedSemanticChunker:
    """
    Factory function to create enhanced chunker.
    
    Args:
        doc_type: Document type (for future specialization)
        chunk_size: Target chunk size in tokens
        overlap: Overlap between chunks in tokens
        
    Returns:
        EnhancedSemanticChunker instance
    """
    logger.info(f"Creating EnhancedSemanticChunker for doc_type={doc_type}")
    return EnhancedSemanticChunker(chunk_size=chunk_size, overlap=overlap)
