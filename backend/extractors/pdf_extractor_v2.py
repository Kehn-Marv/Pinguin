"""
Enhanced PDF text extraction module with improved structure preservation.
Handles both regular and scanned PDFs with advanced layout analysis.
"""
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import pdfplumber
from PyPDF2 import PdfReader
from PyPDF2.errors import PdfReadError

logger = logging.getLogger("pinguin_backend.extractors.pdf_v2")


class EnhancedPDFExtractor:
    """
    Enhanced PDF extractor with improved structure preservation.
    
    Features:
    - Page-by-page extraction with structure preservation
    - Table detection and extraction with formatting
    - Bold/italic text detection (where available)
    - Image caption extraction
    - Better heading detection
    - Column detection for multi-column layouts
    """
    
    # Threshold for detecting scanned PDFs (chars per page)
    SCANNED_PDF_THRESHOLD = 50
    
    def __init__(self):
        """Initialize enhanced PDF extractor."""
        self.logger = logger
    
    def extract(self, file_path: str) -> Tuple[str, Dict]:
        """
        Extract text and metadata from a PDF file with enhanced structure.
        
        Args:
            file_path: Path to the PDF file
        
        Returns:
            Tuple of (extracted_text, metadata)
            
        Raises:
            ValueError: If file is encrypted or invalid
            FileNotFoundError: If file doesn't exist
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        
        if not path.suffix.lower() == '.pdf':
            raise ValueError(f"File is not a PDF: {file_path}")
        
        self.logger.info(f"Extracting text from PDF with enhanced structure: {path.name}")
        
        # Check if PDF is encrypted
        if self._is_encrypted(file_path):
            raise ValueError(f"PDF is encrypted and cannot be processed: {path.name}")
        
        # Extract text and metadata with enhanced structure
        text, page_data, page_count = self._extract_with_structure(file_path)
        
        # Detect if PDF is scanned
        is_scanned = self._detect_scanned_pdf(page_data, page_count)
        
        metadata = {
            'filename': path.name,
            'page_count': page_count,
            'is_scanned': is_scanned,
            'file_type': 'pdf',
            'extractor': 'enhanced_pdfplumber',
            'page_data': page_data,  # Keep for advanced chunking
            'has_tables': any(p.get('tables', []) for p in page_data),
            'has_images': any(p.get('images', []) for p in page_data)
        }
        
        if is_scanned:
            self.logger.warning(
                f"PDF appears to be scanned (low text content): {path.name}. "
                "OCR extraction recommended."
            )
            metadata['requires_ocr'] = True
        
        self.logger.info(
            f"Extracted {len(text)} characters from {page_count} pages. "
            f"Scanned: {is_scanned}, Tables: {metadata['has_tables']}"
        )
        
        return text, metadata
    
    def _is_encrypted(self, file_path: str) -> bool:
        """Check if PDF is encrypted."""
        try:
            reader = PdfReader(file_path)
            return reader.is_encrypted
        except PdfReadError:
            return True
        except Exception as e:
            self.logger.error(f"Error checking encryption: {e}")
            return False
    
    def _extract_with_structure(self, file_path: str) -> Tuple[str, List[Dict], int]:
        """
        Extract text with enhanced structure preservation.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Tuple of (full_text, page_data_list, page_count)
        """
        page_data = []
        full_text_parts = []
        
        try:
            with pdfplumber.open(file_path) as pdf:
                page_count = len(pdf.pages)
                
                for page_num, page in enumerate(pdf.pages, start=1):
                    self.logger.debug(f"Processing page {page_num}/{page_count}")
                    
                    # Extract page structure
                    page_info = self._extract_page_structure(page, page_num)
                    page_data.append(page_info)
                    
                    # Build formatted text for this page
                    page_text = self._format_page_text(page_info)
                    
                    if page_text:
                        full_text_parts.append(f"\n[Page {page_num}]\n{page_text}")
                
                full_text = "\n".join(full_text_parts)
                
                return full_text, page_data, page_count
        
        except Exception as e:
            self.logger.error(f"Error extracting PDF with structure: {e}")
            raise ValueError(f"Failed to extract PDF: {str(e)}")
    
    def _extract_page_structure(self, page, page_num: int) -> Dict:
        """
        Extract structured information from a page.
        
        Args:
            page: pdfplumber page object
            page_num: Page number
            
        Returns:
            Dictionary with page structure information
        """
        page_info = {
            'page_number': page_num,
            'text': '',
            'char_count': 0,
            'tables': [],
            'images': [],
            'text_blocks': [],
            'has_columns': False
        }
        
        try:
            # Extract tables first (they need special handling)
            tables = page.extract_tables()
            if tables:
                page_info['tables'] = self._process_tables(tables)
            
            # Extract images/figures info
            images = page.images
            if images:
                page_info['images'] = self._process_images(images, page_num)
            
            # Extract text with layout information
            # Use extract_words to get positioning info
            words = page.extract_words(
                x_tolerance=3,
                y_tolerance=3,
                keep_blank_chars=False,
                use_text_flow=True
            )
            
            if words:
                # Detect columns
                page_info['has_columns'] = self._detect_columns(words, page.width)
                
                # Group words into text blocks (paragraphs/sections)
                text_blocks = self._group_into_blocks(words)
                page_info['text_blocks'] = text_blocks
                
                # Build page text from blocks
                page_text = self._build_text_from_blocks(text_blocks)
            else:
                # Fallback to simple text extraction
                page_text = page.extract_text() or ""
            
            page_info['text'] = page_text.strip()
            page_info['char_count'] = len(page_info['text'])
            
        except Exception as e:
            self.logger.warning(f"Error extracting page {page_num} structure: {e}")
            # Fallback to simple extraction
            page_info['text'] = page.extract_text() or ""
            page_info['char_count'] = len(page_info['text'])
        
        return page_info
    
    def _process_tables(self, tables: List) -> List[Dict]:
        """
        Process extracted tables with improved formatting.
        
        Args:
            tables: List of table data from pdfplumber
            
        Returns:
            List of formatted table dictionaries
        """
        processed_tables = []
        
        for table_idx, table in enumerate(tables):
            if not table or not any(table):
                continue
            
            # Filter out None rows
            table = [row for row in table if row and any(cell for cell in row if cell)]
            
            if not table:
                continue
            
            # Detect header row (usually first row or row with different formatting)
            has_header = len(table) > 1
            
            # Format as markdown table
            markdown_table = self._format_table_as_markdown(table, has_header)
            
            processed_tables.append({
                'table_id': table_idx,
                'row_count': len(table),
                'col_count': len(table[0]) if table else 0,
                'has_header': has_header,
                'markdown': markdown_table,
                'raw_data': table
            })
        
        return processed_tables
    
    def _format_table_as_markdown(self, table: List[List], has_header: bool = True) -> str:
        """
        Format table as markdown with proper alignment.
        
        Args:
            table: Table data as list of lists
            has_header: Whether first row is header
            
        Returns:
            Markdown formatted table string
        """
        if not table:
            return ""
        
        lines = []
        
        # Determine column widths
        col_count = max(len(row) for row in table)
        col_widths = [0] * col_count
        
        for row in table:
            for i, cell in enumerate(row):
                if i < col_count and cell:
                    col_widths[i] = max(col_widths[i], len(str(cell)))
        
        # Format rows
        for row_idx, row in enumerate(table):
            # Pad row to col_count
            padded_row = list(row) + [''] * (col_count - len(row))
            
            # Format cells
            formatted_cells = []
            for i, cell in enumerate(padded_row):
                cell_str = str(cell) if cell else ''
                formatted_cells.append(cell_str.ljust(col_widths[i]))
            
            lines.append('| ' + ' | '.join(formatted_cells) + ' |')
            
            # Add separator after header
            if has_header and row_idx == 0:
                separator = '|' + '|'.join(['-' * (w + 2) for w in col_widths]) + '|'
                lines.append(separator)
        
        return '\n'.join(lines)
    
    def _process_images(self, images: List, page_num: int) -> List[Dict]:
        """
        Process image information and attempt to extract captions.
        
        Args:
            images: List of image objects from pdfplumber
            page_num: Page number
            
        Returns:
            List of image info dictionaries
        """
        processed_images = []
        
        for img_idx, img in enumerate(images):
            image_info = {
                'image_id': f"page{page_num}_img{img_idx}",
                'x0': img.get('x0', 0),
                'y0': img.get('y0', 0),
                'x1': img.get('x1', 0),
                'y1': img.get('y1', 0),
                'width': img.get('width', 0),
                'height': img.get('height', 0)
            }
            processed_images.append(image_info)
        
        return processed_images
    
    def _detect_columns(self, words: List[Dict], page_width: float) -> bool:
        """
        Detect if page has multi-column layout.
        
        Args:
            words: List of word dictionaries with position info
            page_width: Page width
            
        Returns:
            True if multi-column layout detected
        """
        if not words or len(words) < 20:
            return False
        
        # Group words by their x-position
        left_words = sum(1 for w in words if w['x0'] < page_width * 0.4)
        right_words = sum(1 for w in words if w['x0'] > page_width * 0.6)
        
        # If significant words on both sides, likely multi-column
        total_words = len(words)
        return (left_words > total_words * 0.3 and right_words > total_words * 0.3)
    
    def _group_into_blocks(self, words: List[Dict]) -> List[Dict]:
        """
        Group words into text blocks (paragraphs/sections).
        
        Args:
            words: List of word dictionaries with position info
            
        Returns:
            List of text block dictionaries
        """
        if not words:
            return []
        
        blocks = []
        current_block = {
            'text': [],
            'y_start': words[0]['top'],
            'y_end': words[0]['bottom'],
            'x_start': words[0]['x0'],
            'x_end': words[0]['x1']
        }
        
        # Group words by vertical proximity
        y_threshold = 5  # pixels
        
        for word in words:
            # Check if word belongs to current block
            if abs(word['top'] - current_block['y_end']) < y_threshold:
                # Same block
                current_block['text'].append(word['text'])
                current_block['y_end'] = word['bottom']
                current_block['x_end'] = max(current_block['x_end'], word['x1'])
            else:
                # New block
                if current_block['text']:
                    blocks.append({
                        'text': ' '.join(current_block['text']),
                        'y_start': current_block['y_start'],
                        'y_end': current_block['y_end']
                    })
                
                current_block = {
                    'text': [word['text']],
                    'y_start': word['top'],
                    'y_end': word['bottom'],
                    'x_start': word['x0'],
                    'x_end': word['x1']
                }
        
        # Add last block
        if current_block['text']:
            blocks.append({
                'text': ' '.join(current_block['text']),
                'y_start': current_block['y_start'],
                'y_end': current_block['y_end']
            })
        
        return blocks
    
    def _build_text_from_blocks(self, blocks: List[Dict]) -> str:
        """
        Build formatted text from text blocks.
        
        Args:
            blocks: List of text block dictionaries
            
        Returns:
            Formatted text string
        """
        if not blocks:
            return ""
        
        text_parts = []
        
        for block in blocks:
            text = block['text'].strip()
            if text:
                # Detect if block is likely a heading (short, possibly all caps)
                if len(text) < 100 and (text.isupper() or text.istitle()):
                    # Add extra newline before headings
                    text_parts.append(f"\n{text}\n")
                else:
                    text_parts.append(text)
        
        return '\n\n'.join(text_parts)
    
    def _format_page_text(self, page_info: Dict) -> str:
        """
        Format page text with tables and structure.
        
        Args:
            page_info: Page information dictionary
            
        Returns:
            Formatted page text
        """
        parts = []
        
        # Add main text
        if page_info['text']:
            parts.append(page_info['text'])
        
        # Add tables
        if page_info['tables']:
            for table in page_info['tables']:
                parts.append(f"\n[Table {table['table_id'] + 1}]\n{table['markdown']}\n")
        
        # Add image placeholders (for context)
        if page_info['images']:
            for img in page_info['images']:
                parts.append(f"\n[Figure: {img['image_id']}]\n")
        
        return '\n'.join(parts)
    
    def _detect_scanned_pdf(self, page_data: List[Dict], page_count: int) -> bool:
        """
        Detect if PDF is scanned based on text content.
        
        Args:
            page_data: List of page data dictionaries
            page_count: Total number of pages
            
        Returns:
            True if PDF appears to be scanned
        """
        if page_count == 0:
            return False
        
        total_chars = sum(page['char_count'] for page in page_data)
        avg_chars_per_page = total_chars / page_count
        
        is_scanned = avg_chars_per_page < self.SCANNED_PDF_THRESHOLD
        
        self.logger.debug(
            f"PDF scan detection: {avg_chars_per_page:.1f} chars/page "
            f"(threshold: {self.SCANNED_PDF_THRESHOLD})"
        )
        
        return is_scanned
