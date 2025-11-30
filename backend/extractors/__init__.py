"""
Document extraction module.
Provides extractors for various file formats and a unified extraction interface.
"""

from .pdf_extractor import PDFExtractor
from .ocr_extractor import OCRExtractor
from .docx_extractor import DOCXExtractor
from .pptx_extractor import PPTXExtractor
from .epub_extractor import EPUBExtractor
from .txt_extractor import TXTExtractor
from .file_validator import FileValidator, ValidationResult
from .extractor_factory import ExtractorFactory, ExtractionError

__all__ = [
    'PDFExtractor',
    'OCRExtractor',
    'DOCXExtractor',
    'PPTXExtractor',
    'EPUBExtractor',
    'TXTExtractor',
    'FileValidator',
    'ValidationResult',
    'ExtractorFactory',
    'ExtractionError',
]
