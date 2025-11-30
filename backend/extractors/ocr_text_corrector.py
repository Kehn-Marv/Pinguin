"""
OCR Text Correction Module
Uses LLM to correct and clean up poor quality OCR text.
"""
import logging
import requests
from typing import List, Tuple

logger = logging.getLogger("pinguin_backend.extractors.ocr_corrector")


class OCRTextCorrector:
    """
    Corrects OCR errors using LLM-based text reconstruction.
    Useful for low-confidence OCR results.
    """
    
    def __init__(self, ollama_host: str = "http://localhost:11434", model: str = "llama3.2:3b"):
        """
        Initialize OCR text corrector.
        
        Args:
            ollama_host: Ollama API host
            model: LLM model to use for correction
        """
        self.ollama_host = ollama_host
        self.model = model
        self.logger = logger
        
    def should_correct(self, confidence: float, threshold: float = 50.0) -> bool:
        """
        Determine if text should be corrected based on confidence.
        
        Args:
            confidence: OCR confidence score (0-100)
            threshold: Minimum confidence to skip correction
            
        Returns:
            True if correction is needed
        """
        return confidence < threshold
    
    def correct_text(self, text: str, max_length: int = 2000) -> str:
        """
        Correct OCR errors in text using LLM.
        
        Args:
            text: Raw OCR text with errors
            max_length: Maximum text length to process at once
            
        Returns:
            Corrected text
        """
        if not text or len(text.strip()) < 10:
            return text
        
        # Split into manageable chunks if too long
        if len(text) > max_length:
            chunks = self._split_text(text, max_length)
            corrected_chunks = []
            
            for i, chunk in enumerate(chunks):
                self.logger.info(f"Correcting chunk {i+1}/{len(chunks)}")
                corrected = self._correct_chunk(chunk)
                corrected_chunks.append(corrected)
            
            return "\n\n".join(corrected_chunks)
        else:
            return self._correct_chunk(text)
    
    def _split_text(self, text: str, max_length: int) -> List[str]:
        """Split text into chunks at sentence boundaries."""
        chunks = []
        current_chunk = ""
        
        sentences = text.split('. ')
        for sentence in sentences:
            if len(current_chunk) + len(sentence) < max_length:
                current_chunk += sentence + '. '
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + '. '
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _correct_chunk(self, text: str) -> str:
        """
        Correct a single chunk of text using LLM.
        
        Args:
            text: Raw OCR text
            
        Returns:
            Corrected text
        """
        prompt = f"""You are an OCR error correction assistant. The following text was extracted from a scanned document using OCR, but it contains many errors due to poor scan quality.

Your task is to:
1. Fix obvious OCR errors (wrong letters, missing spaces, garbled characters)
2. Reconstruct readable sentences from the garbled text
3. Preserve the original meaning and structure as much as possible
4. If text is completely unreadable, indicate that clearly

OCR Text:
{text}

Corrected Text (provide ONLY the corrected text, no explanations):"""

        try:
            response = requests.post(
                f"{self.ollama_host}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Low temperature for more accurate correction
                        "top_p": 0.9,
                    }
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                corrected_text = result.get("response", "").strip()
                
                # Validate correction
                if len(corrected_text) > 10 and corrected_text != text:
                    self.logger.info(f"Successfully corrected text: {len(text)} -> {len(corrected_text)} chars")
                    return corrected_text
                else:
                    self.logger.warning("Correction failed or produced no improvement")
                    return text
            else:
                self.logger.error(f"LLM correction failed: {response.status_code}")
                return text
                
        except Exception as e:
            self.logger.error(f"Error during text correction: {e}")
            return text
    
    def correct_page_results(self, page_results: List[dict]) -> List[dict]:
        """
        Correct OCR results for multiple pages.
        
        Args:
            page_results: List of page OCR results with text and confidence
            
        Returns:
            List of corrected page results
        """
        corrected_results = []
        
        for page_result in page_results:
            confidence = page_result.get('confidence', 0)
            text = page_result.get('text', '')
            
            if self.should_correct(confidence) and text:
                self.logger.info(
                    f"Correcting page {page_result.get('page_number')} "
                    f"(confidence: {confidence:.1f}%)"
                )
                corrected_text = self.correct_text(text)
                page_result['text'] = corrected_text
                page_result['corrected'] = True
                page_result['original_confidence'] = confidence
                page_result['confidence'] = min(confidence + 20, 90)  # Boost confidence after correction
            else:
                page_result['corrected'] = False
            
            corrected_results.append(page_result)
        
        return corrected_results
