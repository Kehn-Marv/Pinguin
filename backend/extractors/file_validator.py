"""
File validation module.
Validates file types, sizes, and performs basic security checks.
"""
import logging
import mimetypes
from pathlib import Path
from typing import Dict, List, Optional
import hashlib

logger = logging.getLogger("pinguin_backend.extractors.file_validator")


class ValidationResult:
    """Result of file validation."""
    
    def __init__(self, is_valid: bool, errors: Optional[List[str]] = None, 
                 warnings: Optional[List[str]] = None, metadata: Optional[Dict] = None):
        """
        Initialize validation result.
        
        Args:
            is_valid: Whether the file passed validation
            errors: List of error messages
            warnings: List of warning messages
            metadata: Additional metadata about the file
        """
        self.is_valid = is_valid
        self.errors = errors or []
        self.warnings = warnings or []
        self.metadata = metadata or {}
    
    def __bool__(self):
        """Allow using ValidationResult in boolean context."""
        return self.is_valid
    
    def __repr__(self):
        return f"ValidationResult(is_valid={self.is_valid}, errors={len(self.errors)}, warnings={len(self.warnings)})"


class FileValidator:
    """
    Validates files before processing.
    Checks file extensions, sizes, and performs basic security checks.
    """
    
    # Whitelist of allowed file extensions
    ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.pptx', '.epub', '.txt', '.text', '.md'}
    
    # Maximum file size (100 MB)
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB in bytes
    
    # Suspicious file patterns (basic malicious content detection)
    SUSPICIOUS_PATTERNS = [
        b'<script',
        b'javascript:',
        b'eval(',
        b'exec(',
        b'__import__',
    ]
    
    def __init__(self, max_file_size: Optional[int] = None):
        """
        Initialize file validator.
        
        Args:
            max_file_size: Maximum allowed file size in bytes (optional)
        """
        self.logger = logger
        self.max_file_size = max_file_size or self.MAX_FILE_SIZE
    
    def validate(self, file_path: str) -> ValidationResult:
        """
        Validate a file for processing.
        
        Args:
            file_path: Path to the file to validate
            
        Returns:
            ValidationResult with validation status and details
        """
        errors = []
        warnings = []
        metadata = {}
        
        path = Path(file_path)
        
        # Check if file exists
        if not path.exists():
            errors.append(f"File not found: {file_path}")
            return ValidationResult(is_valid=False, errors=errors)
        
        # Check if it's a file (not a directory)
        if not path.is_file():
            errors.append(f"Path is not a file: {file_path}")
            return ValidationResult(is_valid=False, errors=errors)
        
        # Get file metadata
        file_size = path.stat().st_size
        file_extension = path.suffix.lower()
        
        metadata['filename'] = path.name
        metadata['file_size'] = file_size
        metadata['file_extension'] = file_extension
        
        # Validate file extension
        if not self._validate_extension(file_extension):
            errors.append(
                f"Unsupported file type: {file_extension}. "
                f"Allowed types: {', '.join(sorted(self.ALLOWED_EXTENSIONS))}"
            )
        
        # Validate file size
        if not self._validate_size(file_size):
            errors.append(
                f"File size ({self._format_size(file_size)}) exceeds maximum "
                f"allowed size ({self._format_size(self.max_file_size)})"
            )
        
        # Validate MIME type
        mime_type = self._get_mime_type(file_path)
        metadata['mime_type'] = mime_type
        
        if not self._validate_mime_type(mime_type, file_extension):
            warnings.append(
                f"MIME type ({mime_type}) does not match file extension ({file_extension})"
            )
        
        # Perform basic malicious content detection
        if self._detect_suspicious_content(file_path):
            errors.append(
                "File contains suspicious content patterns. "
                "This file may be malicious and cannot be processed."
            )
        
        # Calculate content hash
        try:
            content_hash = self._calculate_hash(file_path)
            metadata['content_hash'] = content_hash
        except Exception as e:
            warnings.append(f"Could not calculate file hash: {e}")
        
        # Determine if validation passed
        is_valid = len(errors) == 0
        
        if is_valid:
            self.logger.info(f"File validation passed: {path.name}")
        else:
            self.logger.warning(
                f"File validation failed: {path.name}. Errors: {errors}"
            )
        
        return ValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            metadata=metadata
        )
    
    def _validate_extension(self, extension: str) -> bool:
        """
        Validate file extension against whitelist.
        
        Args:
            extension: File extension (e.g., '.pdf')
            
        Returns:
            True if extension is allowed, False otherwise
        """
        return extension in self.ALLOWED_EXTENSIONS
    
    def _validate_size(self, file_size: int) -> bool:
        """
        Validate file size.
        
        Args:
            file_size: File size in bytes
            
        Returns:
            True if size is within limits, False otherwise
        """
        return file_size <= self.max_file_size
    
    def _get_mime_type(self, file_path: str) -> str:
        """
        Get MIME type of file.
        
        Args:
            file_path: Path to file
            
        Returns:
            MIME type string
        """
        mime_type, _ = mimetypes.guess_type(file_path)
        return mime_type or 'application/octet-stream'
    
    def _validate_mime_type(self, mime_type: str, extension: str) -> bool:
        """
        Validate that MIME type matches file extension.
        
        Args:
            mime_type: MIME type string
            extension: File extension
            
        Returns:
            True if MIME type is consistent with extension
        """
        # Expected MIME types for each extension
        expected_mime_types = {
            '.pdf': ['application/pdf'],
            '.docx': [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword'
            ],
            '.pptx': [
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-powerpoint'
            ],
            '.epub': ['application/epub+zip'],
            '.txt': ['text/plain'],
            '.text': ['text/plain'],
            '.md': ['text/plain', 'text/markdown']
        }
        
        expected = expected_mime_types.get(extension, [])
        
        # If we don't have expected types, skip validation
        if not expected:
            return True
        
        return mime_type in expected
    
    def _detect_suspicious_content(self, file_path: str) -> bool:
        """
        Perform basic malicious content detection.
        
        Args:
            file_path: Path to file
            
        Returns:
            True if suspicious content detected, False otherwise
        """
        try:
            # Read first 10KB of file for pattern matching
            with open(file_path, 'rb') as f:
                sample = f.read(10240)
            
            # Check for suspicious patterns
            for pattern in self.SUSPICIOUS_PATTERNS:
                if pattern in sample:
                    self.logger.warning(
                        f"Suspicious pattern detected in file: {pattern}"
                    )
                    return True
            
            return False
        
        except Exception as e:
            self.logger.error(f"Error during malicious content detection: {e}")
            # If we can't check, assume it's safe but log the error
            return False
    
    def _calculate_hash(self, file_path: str) -> str:
        """
        Calculate SHA-256 hash of file content.
        
        Args:
            file_path: Path to file
            
        Returns:
            Hexadecimal hash string
        """
        sha256_hash = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            # Read file in chunks to handle large files
            for chunk in iter(lambda: f.read(4096), b''):
                sha256_hash.update(chunk)
        
        return sha256_hash.hexdigest()
    
    def _format_size(self, size_bytes: int) -> str:
        """
        Format file size in human-readable format.
        
        Args:
            size_bytes: Size in bytes
            
        Returns:
            Formatted size string (e.g., "10.5 MB")
        """
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"
