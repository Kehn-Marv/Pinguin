"""
TXT (plain text) file extraction module.
Handles different text encodings.
"""
import logging
from pathlib import Path
from typing import Dict, Tuple
import chardet

logger = logging.getLogger("pinguin_backend.extractors.txt")


class TXTExtractor:
    """
    Extracts text from plain text files.
    Handles different text encodings automatically.
    """
    
    def __init__(self):
        """Initialize TXT extractor."""
        self.logger = logger
    
    def extract(self, file_path: str) -> Tuple[str, Dict]:
        """
        Extract text and metadata from a TXT file.
        
        Args:
            file_path: Path to the TXT file
        
        Returns:
            Tuple of (extracted_text, metadata)
            
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file is invalid
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"TXT file not found: {file_path}")
        
        if not path.suffix.lower() in ['.txt', '.text', '.md']:
            raise ValueError(f"File is not a text file: {file_path}")
        
        self.logger.info(f"Extracting text from TXT: {path.name}")
        
        # Detect encoding
        encoding = self._detect_encoding(file_path)
        
        try:
            # Read file with detected encoding
            with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                text = f.read()
        except Exception as e:
            self.logger.error(f"Error reading TXT file: {e}")
            raise ValueError(f"Failed to read TXT file: {str(e)}")
        
        # Count lines and words
        lines = text.split('\n')
        line_count = len(lines)
        word_count = len(text.split())
        
        metadata = {
            'filename': path.name,
            'file_type': 'txt',
            'extractor': 'plain_text',
            'encoding': encoding,
            'line_count': line_count,
            'word_count': word_count,
            'char_count': len(text)
        }
        
        self.logger.info(
            f"Extracted {len(text)} characters. "
            f"Lines: {line_count}, Words: {word_count}, Encoding: {encoding}"
        )
        
        return text, metadata
    
    def _detect_encoding(self, file_path: str) -> str:
        """
        Detect the encoding of a text file.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Detected encoding name (e.g., 'utf-8', 'ascii', 'latin-1')
        """
        try:
            # Read a sample of the file
            with open(file_path, 'rb') as f:
                raw_data = f.read(10000)  # Read first 10KB
            
            # Detect encoding
            result = chardet.detect(raw_data)
            encoding = result['encoding']
            confidence = result['confidence']
            
            self.logger.debug(
                f"Detected encoding: {encoding} (confidence: {confidence:.2f})"
            )
            
            # Default to utf-8 if detection fails or confidence is low
            if not encoding or confidence < 0.7:
                self.logger.warning(
                    f"Low confidence encoding detection ({confidence:.2f}). "
                    "Defaulting to utf-8"
                )
                encoding = 'utf-8'
            
            return encoding
        
        except Exception as e:
            self.logger.warning(f"Error detecting encoding: {e}. Defaulting to utf-8")
            return 'utf-8'
