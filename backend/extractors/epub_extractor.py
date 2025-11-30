"""
EPUB (eBook) text extraction module.
Extracts text with chapter structure preservation.
"""
import logging
from pathlib import Path
from typing import Dict, List, Tuple
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

logger = logging.getLogger("pinguin_backend.extractors.epub")


class EPUBExtractor:
    """
    Extracts text from EPUB files with chapter structure preservation.
    """
    
    def __init__(self):
        """Initialize EPUB extractor."""
        self.logger = logger
    
    def extract(self, file_path: str) -> Tuple[str, Dict]:
        """
        Extract text and metadata from an EPUB file.
        
        Args:
            file_path: Path to the EPUB file
        
        Returns:
            Tuple of (extracted_text, metadata)
            
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file is invalid
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"EPUB file not found: {file_path}")
        
        if not path.suffix.lower() == '.epub':
            raise ValueError(f"File is not an EPUB: {file_path}")
        
        self.logger.info(f"Extracting text from EPUB: {path.name}")
        
        try:
            book = epub.read_epub(file_path)
        except Exception as e:
            self.logger.error(f"Error opening EPUB file: {e}")
            raise ValueError(f"Failed to open EPUB file: {str(e)}")
        
        # Extract metadata
        title = book.get_metadata('DC', 'title')
        author = book.get_metadata('DC', 'creator')
        
        book_title = title[0][0] if title else path.stem
        book_author = author[0][0] if author else "Unknown"
        
        # Extract text from chapters
        chapters = []
        chapter_count = 0
        
        for item in book.get_items():
            # Only process document items (chapters)
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                chapter_data = self._process_chapter(item, chapter_count + 1)
                if chapter_data['text']:
                    chapters.append(chapter_data)
                    chapter_count += 1
        
        # Combine all chapter texts
        full_text_parts = []
        for chapter in chapters:
            chapter_text = self._format_chapter_text(chapter)
            if chapter_text:
                full_text_parts.append(chapter_text)
        
        full_text = "\n\n".join(full_text_parts)
        
        metadata = {
            'filename': path.name,
            'file_type': 'epub',
            'extractor': 'ebooklib',
            'book_title': book_title,
            'book_author': book_author,
            'chapter_count': chapter_count,
            'chapters': chapters,
            'char_count': len(full_text)
        }
        
        self.logger.info(
            f"Extracted {len(full_text)} characters from {chapter_count} chapters. "
            f"Title: {book_title}"
        )
        
        return full_text, metadata
    
    def _process_chapter(self, item, chapter_number: int) -> Dict:
        """
        Process a single chapter and extract text.
        
        Args:
            item: EPUB item object
            chapter_number: Chapter number (1-indexed)
            
        Returns:
            Dictionary with chapter data
        """
        chapter_data = {
            'chapter_number': chapter_number,
            'title': '',
            'text': '',
            'char_count': 0
        }
        
        try:
            # Get HTML content
            content = item.get_content()
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')
            
            # Try to extract chapter title
            title_tag = soup.find(['h1', 'h2', 'h3', 'title'])
            if title_tag:
                chapter_data['title'] = title_tag.get_text().strip()
            
            # Extract all text
            text = soup.get_text(separator='\n', strip=True)
            
            # Clean up text
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            text = '\n'.join(lines)
            
            chapter_data['text'] = text
            chapter_data['char_count'] = len(text)
        
        except Exception as e:
            self.logger.warning(f"Error processing chapter {chapter_number}: {e}")
        
        return chapter_data
    
    def _format_chapter_text(self, chapter_data: Dict) -> str:
        """
        Format chapter data into readable text.
        
        Args:
            chapter_data: Dictionary with chapter information
            
        Returns:
            Formatted chapter text
        """
        parts = []
        
        # Add chapter header
        parts.append(f"[Chapter {chapter_data['chapter_number']}]")
        
        # Add title if available
        if chapter_data['title']:
            parts.append(f"Title: {chapter_data['title']}")
        
        # Add text
        if chapter_data['text']:
            parts.append(chapter_data['text'])
        
        return "\n".join(parts)
    
    def get_chapter_titles(self, file_path: str) -> List[str]:
        """
        Extract all chapter titles from EPUB.
        
        Args:
            file_path: Path to EPUB file
            
        Returns:
            List of chapter titles
        """
        try:
            book = epub.read_epub(file_path)
            titles = []
            
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    content = item.get_content()
                    soup = BeautifulSoup(content, 'html.parser')
                    
                    title_tag = soup.find(['h1', 'h2', 'h3', 'title'])
                    if title_tag:
                        title = title_tag.get_text().strip()
                        titles.append(title if title else "[Untitled Chapter]")
                    else:
                        titles.append("[Untitled Chapter]")
            
            return titles
        
        except Exception as e:
            self.logger.error(f"Error extracting chapter titles: {e}")
            return []
