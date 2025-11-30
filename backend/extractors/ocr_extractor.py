"""
OCR text extraction module for scanned PDFs.
Uses Tesseract OCR to extract text with confidence scores.
"""
import logging
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from PIL import Image
import pytesseract
import pdf2image
from dataclasses import dataclass

logger = logging.getLogger("pinguin_backend.extractors.ocr")


@dataclass
class OCRPageResult:
    """Result from OCR processing of a single page."""
    page_number: int
    text: str
    confidence: float
    word_count: int
    low_confidence: bool


class OCRExtractor:
    """
    Extracts text from scanned PDFs using Tesseract OCR.
    Provides confidence scores and handles reading order reconstruction.
    Uses adaptive DPI selection based on file characteristics.
    """
    
    # Confidence threshold for marking low-confidence text
    LOW_CONFIDENCE_THRESHOLD = 70.0
    
    # Adaptive DPI settings
    DPI_FAST = 200      # Fast processing, good for clean scans (increased from 150)
    DPI_BALANCED = 250  # Default, best speed/quality balance (increased from 200)
    DPI_QUALITY = 300   # High quality, for poor scans or small text (increased from 250)
    DPI_MAXIMUM = 350   # Maximum quality, for very poor scans (increased from 300)
    
    # Maximum pages to process (safety limit)
    MAX_PAGES = 500
    
    # Maximum file size for OCR (in bytes) - 50MB
    MAX_FILE_SIZE = 50 * 1024 * 1024
    
    # File size thresholds for adaptive DPI (in MB)
    SMALL_FILE_MB = 5
    MEDIUM_FILE_MB = 20
    LARGE_FILE_MB = 40
    
    # Page count thresholds
    FEW_PAGES = 20
    MANY_PAGES = 100
    
    def __init__(self, tesseract_cmd: Optional[str] = None):
        """
        Initialize OCR extractor.
        
        Args:
            tesseract_cmd: Path to tesseract executable (optional)
                          If not provided, will check TESSERACT_CMD env var
        """
        self.logger = logger
        
        # Priority order:
        # 1. Explicit parameter
        # 2. TESSERACT_CMD environment variable
        # 3. System default (pytesseract will find it)
        
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
            self.logger.info(f"Using explicit Tesseract path: {tesseract_cmd}")
        elif os.environ.get('TESSERACT_CMD'):
            tesseract_path = os.environ.get('TESSERACT_CMD')
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
            self.logger.info(f"Using bundled Tesseract from environment: {tesseract_path}")
        else:
            self.logger.info("Using system Tesseract installation")
        
        # Set tessdata path if provided
        if os.environ.get('TESSDATA_PREFIX'):
            tessdata_path = os.environ.get('TESSDATA_PREFIX')
            os.environ['TESSDATA_PREFIX'] = tessdata_path
            self.logger.info(f"Using tessdata from: {tessdata_path}")
        
        # Verify tesseract is available
        try:
            version = pytesseract.get_tesseract_version()
            self.logger.info(f"Tesseract OCR initialized successfully (version: {version})")
        except pytesseract.TesseractNotFoundError as e:
            self.logger.error(f"Tesseract binary not found: {e}")
            raise RuntimeError(
                "Tesseract OCR executable not found. "
                "The application should include Tesseract, but it may be missing or corrupted. "
                "Please reinstall the application or install Tesseract manually from: "
                "https://github.com/tesseract-ocr/tesseract"
            )
        except Exception as e:
            error_msg = str(e).lower()
            
            # Check for tessdata-specific errors
            if 'tessdata' in error_msg or 'traineddata' in error_msg:
                self.logger.error(f"Tesseract language data (tessdata) not found: {e}")
                raise RuntimeError(
                    "Tesseract language data files (tessdata) are missing. "
                    "The application requires English language data (eng.traineddata). "
                    "Please reinstall the application or download tessdata from: "
                    "https://github.com/tesseract-ocr/tessdata"
                )
            
            # Generic error
            self.logger.error(f"Tesseract OCR initialization failed: {e}")
            raise RuntimeError(
                f"Failed to initialize Tesseract OCR: {str(e)}. "
                "Please ensure Tesseract is properly installed and configured."
            )
    
    def _select_optimal_dpi(self, file_path: str, file_size_mb: float, page_count: int) -> int:
        """
        Intelligently select optimal DPI based on file characteristics.
        
        Strategy:
        - Small files (<5MB): Use higher DPI for best quality
        - Medium files (5-20MB): Balance quality and speed
        - Large files (20-40MB): Prioritize speed
        - Very large files (>40MB): Use minimum DPI
        - Many pages (>100): Reduce DPI to avoid timeouts
        - Few pages (<20): Can afford higher DPI
        
        Args:
            file_path: Path to PDF file
            file_size_mb: File size in megabytes
            page_count: Number of pages in PDF
            
        Returns:
            Optimal DPI value
        """
        # Start with balanced DPI
        selected_dpi = self.DPI_BALANCED
        
        # Factor 1: File size
        if file_size_mb < self.SMALL_FILE_MB:
            # Small file - can use high quality
            selected_dpi = self.DPI_QUALITY
            self.logger.info(f"Small file ({file_size_mb:.1f}MB) - using quality DPI: {selected_dpi}")
        
        elif file_size_mb < self.MEDIUM_FILE_MB:
            # Medium file - balanced approach
            if page_count < self.FEW_PAGES:
                # Few pages, can afford quality
                selected_dpi = self.DPI_QUALITY
                self.logger.info(f"Medium file ({file_size_mb:.1f}MB) with few pages - using quality DPI: {selected_dpi}")
            else:
                # Many pages, use balanced
                selected_dpi = self.DPI_BALANCED
                self.logger.info(f"Medium file ({file_size_mb:.1f}MB) - using balanced DPI: {selected_dpi}")
        
        elif file_size_mb < self.LARGE_FILE_MB:
            # Large file - prioritize speed
            if page_count > self.MANY_PAGES:
                # Many pages, use fast
                selected_dpi = self.DPI_FAST
                self.logger.info(f"Large file ({file_size_mb:.1f}MB) with many pages - using fast DPI: {selected_dpi}")
            else:
                # Moderate pages, use balanced
                selected_dpi = self.DPI_BALANCED
                self.logger.info(f"Large file ({file_size_mb:.1f}MB) - using balanced DPI: {selected_dpi}")
        
        else:
            # Very large file - must use fast DPI
            selected_dpi = self.DPI_FAST
            self.logger.info(f"Very large file ({file_size_mb:.1f}MB) - using fast DPI: {selected_dpi}")
        
        # Factor 2: Page count override
        if page_count > self.MANY_PAGES:
            # Too many pages - force fast DPI regardless of file size
            if selected_dpi > self.DPI_FAST:
                self.logger.info(f"Many pages ({page_count}) - overriding to fast DPI: {self.DPI_FAST}")
                selected_dpi = self.DPI_FAST
        
        # Factor 3: Estimated processing time check
        estimated_time_per_page = self._estimate_processing_time(selected_dpi)
        total_estimated_time = estimated_time_per_page * page_count
        
        # If estimated time > 8 minutes, reduce DPI
        if total_estimated_time > 480:  # 8 minutes
            if selected_dpi > self.DPI_FAST:
                self.logger.warning(
                    f"Estimated processing time too long ({total_estimated_time:.0f}s) - "
                    f"reducing DPI from {selected_dpi} to {self.DPI_FAST}"
                )
                selected_dpi = self.DPI_FAST
        
        self.logger.info(
            f"Selected DPI: {selected_dpi} for {page_count} pages, {file_size_mb:.1f}MB "
            f"(estimated time: {total_estimated_time:.0f}s)"
        )
        
        return selected_dpi
    
    def _estimate_processing_time(self, dpi: int) -> float:
        """
        Estimate processing time per page based on DPI.
        
        Args:
            dpi: DPI value
            
        Returns:
            Estimated seconds per page
        """
        # Empirical estimates based on testing
        if dpi <= 150:
            return 1.5  # ~1.5 seconds per page
        elif dpi <= 200:
            return 2.0  # ~2 seconds per page
        elif dpi <= 250:
            return 3.0  # ~3 seconds per page
        else:
            return 4.5  # ~4.5 seconds per page at 300 DPI
    
    def extract(self, file_path: str) -> Tuple[str, Dict]:
        """
        Extract text from a scanned PDF using OCR.
        
        Args:
            file_path: Path to the PDF file
        
        Returns:
            Tuple of (extracted_text, metadata)
            
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file format is unsupported
            RuntimeError: If OCR processing fails
        """
        path = Path(file_path)
        
        if not path.exists():
            self.logger.error(f"File not found: {file_path}")
            raise FileNotFoundError(f"The file could not be found: {file_path}")
        
        if not path.suffix.lower() == '.pdf':
            self.logger.error(f"Unsupported file format: {path.suffix}")
            raise ValueError(
                f"Unsupported file format: {path.suffix}. "
                f"OCR extraction only supports PDF files. "
                f"Please provide a PDF file for OCR processing."
            )
        
        # Check file size
        file_size = path.stat().st_size
        file_size_mb = file_size / (1024 * 1024)
        
        if file_size > self.MAX_FILE_SIZE:
            max_mb = self.MAX_FILE_SIZE / (1024 * 1024)
            self.logger.error(f"File too large for OCR: {file_size_mb:.1f}MB (max: {max_mb}MB)")
            raise ValueError(
                f"File is too large for OCR processing ({file_size_mb:.1f}MB). "
                f"Maximum supported size is {max_mb}MB. "
                f"Please use a smaller file or split the PDF into smaller parts."
            )
        
        self.logger.info(f"Starting OCR extraction for: {path.name} ({file_size_mb:.1f}MB)")
        
        # First, get page count to determine optimal DPI
        # Use low DPI for initial conversion just to count pages
        try:
            preview_images = pdf2image.convert_from_path(
                file_path,
                dpi=72,  # Very low DPI just for counting
                fmt='png',
                first_page=1,
                last_page=1
            )
            # Get total page count without converting all pages
            from pdf2image import pdfinfo_from_path
            info = pdfinfo_from_path(file_path)
            page_count = info.get('Pages', 0)
        except Exception as e:
            self.logger.warning(f"Could not get page count, will convert all pages: {e}")
            # Fallback: convert all pages at default DPI
            page_count = 0
        
        # Check page count limit
        if page_count > self.MAX_PAGES:
            self.logger.error(f"Too many pages for OCR: {page_count} (max: {self.MAX_PAGES})")
            raise ValueError(
                f"PDF has too many pages for OCR processing ({page_count} pages). "
                f"Maximum supported is {self.MAX_PAGES} pages. "
                f"Please split the PDF into smaller parts."
            )
        
        # Select optimal DPI based on file characteristics
        optimal_dpi = self._select_optimal_dpi(file_path, file_size_mb, page_count)
        
        # Convert PDF to images at optimal DPI
        images = self._pdf_to_images(file_path, dpi=optimal_dpi)
        actual_page_count = len(images)
        
        self.logger.info(
            f"Converted PDF to {actual_page_count} images at {optimal_dpi} DPI "
            f"(file: {file_size_mb:.1f}MB, pages: {actual_page_count})"
        )
        
        # Process each page with OCR
        page_results = []
        for page_num, image in enumerate(images, start=1):
            # Log progress every 10 pages or for small documents
            if page_num % 10 == 0 or actual_page_count <= 20:
                self.logger.info(
                    f"OCR progress: {page_num}/{actual_page_count} pages processed "
                    f"(DPI: {optimal_dpi})"
                )
            else:
                self.logger.debug(f"Processing page {page_num}/{actual_page_count}")
            
            result = self._process_page(image, page_num)
            page_results.append(result)
        
        # Combine all page texts
        full_text_parts = []
        for result in page_results:
            if result.text:
                full_text_parts.append(f"\n[Page {result.page_number}]\n{result.text}")
        
        full_text = "\n".join(full_text_parts)
        
        # Calculate overall statistics
        avg_confidence = sum(r.confidence for r in page_results) / len(page_results)
        total_words = sum(r.word_count for r in page_results)
        low_confidence_pages = sum(1 for r in page_results if r.low_confidence)
        
        metadata = {
            'filename': path.name,
            'page_count': actual_page_count,
            'file_type': 'pdf',
            'extractor': 'tesseract_ocr',
            'ocr_dpi': optimal_dpi,
            'ocr_confidence': avg_confidence,
            'total_words': total_words,
            'low_confidence_pages': low_confidence_pages,
            'file_size_mb': file_size_mb,
            'page_results': [
                {
                    'page_number': r.page_number,
                    'text': r.text,
                    'confidence': r.confidence,
                    'word_count': r.word_count,
                    'low_confidence': r.low_confidence
                }
                for r in page_results
            ]
        }
        
        # Log success with confidence score and word count (Requirement 5.1)
        self.logger.info(
            f"OCR extraction completed successfully for '{path.name}'. "
            f"DPI: {optimal_dpi}, "
            f"Confidence: {avg_confidence:.1f}%, "
            f"Words extracted: {total_words}, "
            f"Pages processed: {actual_page_count}"
        )
        
        # Warn about low confidence results (Requirement 5.4)
        if low_confidence_pages > 0:
            self.logger.warning(
                f"Low confidence detected: {low_confidence_pages}/{page_count} pages "
                f"have confidence below {self.LOW_CONFIDENCE_THRESHOLD}%. "
                f"The extracted text may contain errors or be incomplete. "
                f"Consider using a higher quality scan for better results."
            )
        
        # Warn if overall confidence is low
        if avg_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            self.logger.warning(
                f"Overall OCR confidence is low ({avg_confidence:.1f}%). "
                f"The extracted text quality may be poor. "
                f"This can happen with low-quality scans, handwritten text, or complex layouts."
            )
            
            # Try to correct the text using LLM if confidence is very low
            if avg_confidence < 50.0:
                self.logger.info(
                    f"Attempting LLM-based text correction due to very low confidence ({avg_confidence:.1f}%)"
                )
                try:
                    from .ocr_text_corrector import OCRTextCorrector
                    
                    corrector = OCRTextCorrector()
                    
                    # Correct each page's text
                    corrected_results = corrector.correct_page_results(metadata['page_results'])
                    metadata['page_results'] = corrected_results
                    
                    # Rebuild full text from corrected pages
                    full_text_parts = []
                    for result in corrected_results:
                        if result['text']:
                            full_text_parts.append(f"\n[Page {result['page_number']}]\n{result['text']}")
                    
                    full_text = "\n".join(full_text_parts)
                    
                    # Recalculate confidence
                    avg_confidence = sum(r['confidence'] for r in corrected_results) / len(corrected_results)
                    metadata['ocr_confidence'] = avg_confidence
                    metadata['text_corrected'] = True
                    
                    self.logger.info(
                        f"Text correction completed. New confidence: {avg_confidence:.1f}%"
                    )
                except Exception as e:
                    self.logger.error(f"Text correction failed: {e}")
                    metadata['text_corrected'] = False
            else:
                metadata['text_corrected'] = False
        else:
            metadata['text_corrected'] = False
        
        return full_text, metadata
    
    def _pdf_to_images(self, file_path: str, dpi: Optional[int] = None) -> List[Image.Image]:
        """
        Convert PDF pages to images.
        
        Args:
            file_path: Path to PDF file
            dpi: DPI for conversion (uses adaptive selection if None)
            
        Returns:
            List of PIL Image objects
            
        Raises:
            ValueError: If PDF conversion fails
        """
        if dpi is None:
            dpi = self.DPI_BALANCED
        
        try:
            images = pdf2image.convert_from_path(
                file_path,
                dpi=dpi,
                fmt='png'
            )
            
            if not images:
                self.logger.error(f"PDF conversion resulted in no images: {file_path}")
                raise ValueError(
                    "The PDF file appears to be empty or could not be converted to images. "
                    "Please ensure the PDF is valid and not corrupted."
                )
            
            return images
        except Exception as e:
            error_msg = str(e).lower()
            
            # Provide specific error messages for common issues
            if 'poppler' in error_msg:
                self.logger.error(f"Poppler not found for PDF conversion: {e}")
                raise ValueError(
                    "PDF conversion failed: Poppler utilities are required but not found. "
                    "Please ensure the application includes Poppler or install it manually."
                )
            elif 'encrypted' in error_msg or 'password' in error_msg:
                self.logger.error(f"PDF is encrypted: {e}")
                raise ValueError(
                    "The PDF file is password-protected or encrypted. "
                    "Please remove the password protection before attempting OCR extraction."
                )
            elif 'corrupt' in error_msg or 'invalid' in error_msg:
                self.logger.error(f"PDF file is corrupted or invalid: {e}")
                raise ValueError(
                    "The PDF file appears to be corrupted or invalid. "
                    "Please try opening the file in a PDF viewer to verify it's readable."
                )
            else:
                self.logger.error(f"Failed to convert PDF to images: {e}")
                raise ValueError(
                    f"Failed to convert PDF to images for OCR processing: {str(e)}. "
                    f"Please ensure the PDF file is valid and not corrupted."
                )
    
    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image to improve OCR quality.
        Applies grayscale conversion, contrast enhancement, and noise reduction.
        
        Args:
            image: PIL Image object
            
        Returns:
            Preprocessed PIL Image object
        """
        try:
            from PIL import ImageEnhance, ImageFilter
            
            # Convert to grayscale
            if image.mode != 'L':
                image = image.convert('L')
            
            # Enhance contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(2.0)  # Increase contrast
            
            # Enhance sharpness
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.5)  # Increase sharpness
            
            # Apply slight blur to reduce noise
            image = image.filter(ImageFilter.MedianFilter(size=3))
            
            # Enhance brightness slightly
            enhancer = ImageEnhance.Brightness(image)
            image = enhancer.enhance(1.1)
            
            return image
        except Exception as e:
            self.logger.warning(f"Image preprocessing failed, using original: {e}")
            return image
    
    def _process_page(self, image: Image.Image, page_number: int) -> OCRPageResult:
        """
        Process a single page image with OCR.
        
        Args:
            image: PIL Image object
            page_number: Page number (1-indexed)
            
        Returns:
            OCRPageResult with extracted text and confidence
        """
        try:
            # Preprocess image for better OCR quality
            processed_image = self._preprocess_image(image)
            
            # Get OCR data with bounding boxes and confidence scores
            # Use PSM 3 (Fully automatic page segmentation, but no OSD) for better results
            # Use OEM 1 (Neural nets LSTM engine only) for better accuracy
            custom_config = r'--oem 1 --psm 3'
            
            ocr_data = pytesseract.image_to_data(
                processed_image,
                output_type=pytesseract.Output.DICT,
                lang='eng',
                config=custom_config
            )
            
            # Reconstruct text with reading order
            text, avg_confidence, word_count = self._reconstruct_text(ocr_data)
            
            # Determine if confidence is low
            low_confidence = avg_confidence < self.LOW_CONFIDENCE_THRESHOLD
            
            # Log page-level results
            if low_confidence:
                self.logger.debug(
                    f"Page {page_number}: Low confidence ({avg_confidence:.1f}%), "
                    f"{word_count} words extracted"
                )
            else:
                self.logger.debug(
                    f"Page {page_number}: Confidence {avg_confidence:.1f}%, "
                    f"{word_count} words extracted"
                )
            
            return OCRPageResult(
                page_number=page_number,
                text=text,
                confidence=avg_confidence,
                word_count=word_count,
                low_confidence=low_confidence
            )
        
        except pytesseract.TesseractError as e:
            error_msg = str(e).lower()
            
            # Check for tessdata-specific errors during processing
            if 'tessdata' in error_msg or 'traineddata' in error_msg:
                self.logger.error(
                    f"Tesseract language data error on page {page_number}: {e}"
                )
                raise RuntimeError(
                    f"Tesseract language data (tessdata) error while processing page {page_number}. "
                    f"The English language data file may be missing or corrupted. "
                    f"Please reinstall the application."
                )
            else:
                self.logger.error(f"Tesseract error processing page {page_number}: {e}")
                raise RuntimeError(
                    f"OCR processing failed on page {page_number}: {str(e)}"
                )
        
        except Exception as e:
            self.logger.error(f"Unexpected error processing page {page_number}: {e}")
            self.logger.warning(
                f"Page {page_number} could not be processed and will be skipped. "
                f"Continuing with remaining pages."
            )
            # Return empty result on error to allow processing to continue
            return OCRPageResult(
                page_number=page_number,
                text="",
                confidence=0.0,
                word_count=0,
                low_confidence=True
            )
    
    def _reconstruct_text(self, ocr_data: Dict) -> Tuple[str, float, int]:
        """
        Reconstruct text from OCR data with proper reading order.
        
        Args:
            ocr_data: Dictionary from pytesseract with text, conf, and position data
            
        Returns:
            Tuple of (reconstructed_text, average_confidence, word_count)
        """
        # Extract words with confidence scores
        words = []
        confidences = []
        
        n_boxes = len(ocr_data['text'])
        current_line = []
        current_block = []
        prev_block_num = -1
        prev_line_num = -1
        
        for i in range(n_boxes):
            text = ocr_data['text'][i].strip()
            conf = float(ocr_data['conf'][i])
            block_num = ocr_data['block_num'][i]
            line_num = ocr_data['line_num'][i]
            
            # Skip empty text
            if not text or conf < 0:
                continue
            
            # New block detected
            if block_num != prev_block_num and current_block:
                words.extend(current_block)
                words.append('\n\n')  # Paragraph break
                current_block = []
            
            # New line detected
            if line_num != prev_line_num and current_line:
                current_block.extend(current_line)
                current_block.append('\n')
                current_line = []
            
            # Add word
            current_line.append(text)
            confidences.append(conf)
            
            prev_block_num = block_num
            prev_line_num = line_num
        
        # Add remaining words
        if current_line:
            current_block.extend(current_line)
        if current_block:
            words.extend(current_block)
        
        # Reconstruct text
        reconstructed_text = ' '.join(words)
        
        # Clean up extra spaces
        reconstructed_text = ' '.join(reconstructed_text.split())
        
        # Calculate average confidence
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        word_count = len([w for w in words if w not in ['\n', '\n\n']])
        
        return reconstructed_text, avg_confidence, word_count
    
    def extract_page(self, file_path: str, page_number: int) -> Tuple[str, float]:
        """
        Extract text from a specific page with OCR.
        
        Args:
            file_path: Path to PDF file
            page_number: Page number (1-indexed)
            
        Returns:
            Tuple of (extracted_text, confidence_score)
            
        Raises:
            ValueError: If page number is out of range
        """
        images = self._pdf_to_images(file_path)
        
        if page_number < 1 or page_number > len(images):
            self.logger.error(
                f"Invalid page number {page_number} for file with {len(images)} pages"
            )
            raise ValueError(
                f"Page number {page_number} is out of range. "
                f"The PDF has {len(images)} pages (valid range: 1-{len(images)})."
            )
        
        image = images[page_number - 1]
        result = self._process_page(image, page_number)
        
        # Log single page extraction result
        self.logger.info(
            f"Extracted page {page_number}: "
            f"Confidence {result.confidence:.1f}%, "
            f"{result.word_count} words"
        )
        
        if result.low_confidence:
            self.logger.warning(
                f"Low confidence on page {page_number} ({result.confidence:.1f}%). "
                f"The extracted text may contain errors."
            )
        
        return result.text, result.confidence
