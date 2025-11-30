"""
Enhanced extractor factory with improved extractors and backward compatibility.
"""
import logging
from pathlib import Path
from typing import Dict, Tuple, Optional

from extractors.file_validator import FileValidator, ValidationResult
from extractors.pdf_extractor_v2 import EnhancedPDFExtractor
from extractors.docx_extractor_v2 import EnhancedDOCXExtractor
from extractors.pptx_extractor import PPTXExtractor
from extractors.epub_extractor import EPUBExtractor
from extractors.txt_extractor import TXTExtractor
from extractors.ocr_extractor import OCRExtractor

logger = logging.getLogger("pinguin_backend.extractors.factory_v2")


class ExtractionError(Exception):
    """Custom exception for extraction errors."""
    pass


class EnhancedExtractorFactory:
    """
    Enhanced extractor factory with improved extractors.
    
    Features:
    - Uses enhanced PDF and DOCX extractors by default
    - Backward compatible with existing code
    - Better error handling and logging
    - Optional OCR support for scanned PDFs
    """
    
    def __init__(
        self,
        validate_files: bool = True,
        use_ocr: bool = False,
        max_file_size: int = 100 * 1024 * 1024,  # 100 MB
        use_enhanced_extractors: bool = True
    ):
        """
        Initialize enhanced extractor factory.
        
        Args:
            validate_files: Whether to validate files before extraction
            use_ocr: Whether to use OCR for scanned PDFs
            max_file_size: Maximum file size in bytes
            use_enhanced_extractors: Whether to use enhanced extractors (v2)
        """
        self.validate_files = validate_files
        self.use_ocr = use_ocr
        self.use_enhanced_extractors = use_enhanced_extractors
        
        # Initialize validator
        if validate_files:
            self.validator = FileValidator(max_file_size=max_file_size)
        else:
            self.validator = None
        
        # Initialize extractors
        self.pdf_extractor = EnhancedPDFExtractor() if use_enhanced_extractors else None
        self.docx_extractor = EnhancedDOCXExtractor() if use_enhanced_extractors else None
        self.pptx_extractor = PPTXExtractor()
        self.epub_extractor = EPUBExtractor()
        self.txt_extractor = TXTExtractor()
        
        # Initialize OCR extractor if needed
        if use_ocr:
            try:
                self.ocr_extractor = OCRExtractor()
                logger.info("OCR extractor initialized")
            except Exception as e:
                logger.warning(f"OCR extractor initialization failed: {e}")
                self.ocr_extractor = None
        else:
            self.ocr_extractor = None
        
        logger.info(
            f"EnhancedExtractorFactory initialized: "
            f"validate={validate_files}, ocr={use_ocr}, enhanced={use_enhanced_extractors}"
        )
    
    def extract(self, file_path: str) -> Tuple[str, Dict]:
        """
        Extract text and metadata from a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            Tuple of (text, metadata)
            
        Raises:
            ExtractionError: If extraction fails
            FileNotFoundError: If file doesn't exist
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Validate file if enabled
        if self.validate_files:
            validation_result = self.validator.validate(file_path)
            if not validation_result.is_valid:
                error_msg = "; ".join(validation_result.errors)
                raise ExtractionError(f"File validation failed: {error_msg}")
        
        # Determine file type
        extension = path.suffix.lower()
        
        try:
            # Route to appropriate extractor
            if extension == '.pdf':
                return self._extract_pdf(file_path)
            elif extension in ['.doc', '.docx']:
                return self._extract_docx(file_path)
            elif extension in ['.ppt', '.pptx']:
                return self._extract_pptx(file_path)
            elif extension == '.epub':
                return self._extract_epub(file_path)
            elif extension in ['.txt', '.text', '.md']:
                return self._extract_txt(file_path)
            else:
                raise ExtractionError(f"Unsupported file type: {extension}")
        
        except ExtractionError:
            raise
        except Exception as e:
            logger.error(f"Extraction failed for {file_path}: {e}", exc_info=True)
            raise ExtractionError(f"Extraction failed: {str(e)}") from e
    
    def _extract_pdf(self, file_path: str) -> Tuple[str, Dict]:
        """Extract from PDF with enhanced extractor or OCR fallback."""
        try:
            # Use enhanced extractor if available
            if self.pdf_extractor:
                text, metadata = self.pdf_extractor.extract(file_path)
            else:
                # Fallback to basic extraction
                from extractors.pdf_extractor import PDFExtractor
                basic_extractor = PDFExtractor()
                text, metadata = basic_extractor.extract(file_path)
            
            logger.info(
                f"[PDF EXTRACTION] Initial extraction complete: {len(text)} chars, "
                f"is_scanned={metadata.get('is_scanned', False)}, "
                f"ocr_available={self.ocr_extractor is not None}"
            )
            
            # Check if OCR is needed and available
            if metadata.get('is_scanned') and self.ocr_extractor:
                logger.info(f"[OCR] PDF is scanned, attempting OCR extraction: {Path(file_path).name}")
                try:
                    ocr_text, ocr_metadata = self.ocr_extractor.extract(file_path)
                    
                    logger.info(
                        f"[OCR] OCR extraction complete: {len(ocr_text)} chars "
                        f"(original: {len(text)} chars)"
                    )
                    
                    # Use OCR text if it's better (more than 1.5x or if original was very low)
                    # For scanned PDFs, we should almost always prefer OCR
                    if len(ocr_text) > len(text) * 1.5 or len(text) < 100 * metadata.get('page_count', 1):
                        logger.info(f"[OCR] Using OCR text ({len(ocr_text)} chars vs {len(text)} chars)")
                        text = ocr_text
                        metadata.update(ocr_metadata)
                        metadata['extraction_method'] = 'ocr'
                    else:
                        logger.info(f"[OCR] Using standard extraction (OCR: {len(ocr_text)} vs standard: {len(text)})")
                        metadata['extraction_method'] = 'standard'
                
                except Exception as e:
                    logger.error(f"[OCR] OCR extraction failed: {e}", exc_info=True)
                    metadata['extraction_method'] = 'standard'
                    metadata['ocr_error'] = str(e)
            elif metadata.get('is_scanned') and not self.ocr_extractor:
                logger.warning(
                    f"[OCR] PDF is scanned but OCR is not available! "
                    f"Only {len(text)} chars extracted. Enable OCR for better results."
                )
                metadata['extraction_method'] = 'standard'
                metadata['ocr_available'] = False
            else:
                metadata['extraction_method'] = 'standard'
            
            return text, metadata
        
        except Exception as e:
            logger.error(f"[PDF EXTRACTION] PDF extraction failed: {e}", exc_info=True)
            raise ExtractionError(f"PDF extraction failed: {str(e)}") from e
    
    def _extract_docx(self, file_path: str) -> Tuple[str, Dict]:
        """Extract from DOCX with enhanced extractor."""
        try:
            if self.docx_extractor:
                return self.docx_extractor.extract(file_path)
            else:
                # Fallback to basic extraction
                from extractors.docx_extractor import DOCXExtractor
                basic_extractor = DOCXExtractor()
                return basic_extractor.extract(file_path)
        
        except Exception as e:
            raise ExtractionError(f"DOCX extraction failed: {str(e)}") from e
    
    def _extract_pptx(self, file_path: str) -> Tuple[str, Dict]:
        """Extract from PPTX."""
        try:
            return self.pptx_extractor.extract(file_path)
        except Exception as e:
            raise ExtractionError(f"PPTX extraction failed: {str(e)}") from e
    
    def _extract_epub(self, file_path: str) -> Tuple[str, Dict]:
        """Extract from EPUB."""
        try:
            return self.epub_extractor.extract(file_path)
        except Exception as e:
            raise ExtractionError(f"EPUB extraction failed: {str(e)}") from e
    
    def _extract_txt(self, file_path: str) -> Tuple[str, Dict]:
        """Extract from text file."""
        try:
            return self.txt_extractor.extract(file_path)
        except Exception as e:
            raise ExtractionError(f"Text extraction failed: {str(e)}") from e
    
    def validate_file(self, file_path: str) -> ValidationResult:
        """
        Validate a file before extraction.
        
        Args:
            file_path: Path to file
            
        Returns:
            ValidationResult object
        """
        if self.validator:
            return self.validator.validate(file_path)
        else:
            # Return a basic validation result
            path = Path(file_path)
            if path.exists() and path.is_file():
                return ValidationResult(
                    is_valid=True,
                    file_path=file_path,
                    file_size=path.stat().st_size,
                    mime_type='unknown',
                    errors=[],
                    warnings=[]
                )
            else:
                return ValidationResult(
                    is_valid=False,
                    file_path=file_path,
                    file_size=0,
                    mime_type='unknown',
                    errors=['File does not exist or is not a file'],
                    warnings=[]
                )
    
    def get_supported_extensions(self) -> list:
        """Get list of supported file extensions."""
        return ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.epub', '.txt', '.text', '.md']
    
    def __repr__(self) -> str:
        return (
            f"EnhancedExtractorFactory("
            f"validate={self.validate_files}, "
            f"ocr={self.use_ocr}, "
            f"enhanced={self.use_enhanced_extractors})"
        )
