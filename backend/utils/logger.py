"""
Structured logging utility for Pinguin backend.
Provides JSON-formatted logging with rotation and size limits.
"""
import logging
import json
import sys
from datetime import datetime
from pathlib import Path
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, Optional


class JSONFormatter(logging.Formatter):
    """Custom formatter that outputs logs in JSON format."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields if present
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
        
        return json.dumps(log_data)


class StructuredLogger:
    """
    Structured logger with JSON formatting, file rotation, and size limits.
    
    Features:
    - JSON-formatted logs for easy parsing
    - File rotation (max 10 files)
    - Size limits (10 MB per file)
    - Console and file output
    - Multiple log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
    """
    
    def __init__(
        self,
        name: str = "pinguin_backend",
        log_dir: Optional[Path] = None,
        log_level: int = logging.INFO,
        max_bytes: int = 10 * 1024 * 1024,  # 10 MB
        backup_count: int = 10,
        console_output: bool = True
    ):
        """
        Initialize structured logger.
        
        Args:
            name: Logger name
            log_dir: Directory for log files (default: ./logs)
            log_level: Minimum log level (default: INFO)
            max_bytes: Maximum size per log file (default: 10 MB)
            backup_count: Number of backup files to keep (default: 10)
            console_output: Whether to output to console (default: True)
        """
        self.logger = logging.getLogger(name)
        self.logger.setLevel(log_level)
        self.logger.propagate = False
        
        # Clear existing handlers
        self.logger.handlers.clear()
        
        # Set up log directory
        if log_dir is None:
            log_dir = Path(__file__).parent.parent / "logs"
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Create formatters
        json_formatter = JSONFormatter()
        console_formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        
        # File handler with rotation
        log_file = self.log_dir / f"{name}.log"
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8"
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(json_formatter)
        self.logger.addHandler(file_handler)
        
        # Console handler
        if console_output:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(log_level)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)
    
    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message."""
        self._log(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message."""
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message."""
        self._log(logging.WARNING, message, **kwargs)
    
    def warn(self, message: str, **kwargs: Any) -> None:
        """Alias for warning."""
        self.warning(message, **kwargs)
    
    def error(self, message: str, **kwargs: Any) -> None:
        """Log error message."""
        self._log(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs: Any) -> None:
        """Log critical message."""
        self._log(logging.CRITICAL, message, **kwargs)
    
    def exception(self, message: str, **kwargs: Any) -> None:
        """Log exception with traceback."""
        self._log(logging.ERROR, message, exc_info=True, **kwargs)
    
    def _log(self, level: int, message: str, exc_info: bool = False, **kwargs: Any) -> None:
        """
        Internal logging method.
        
        Args:
            level: Log level
            message: Log message
            exc_info: Whether to include exception info
            **kwargs: Additional fields to include in log
        """
        extra = {"extra_fields": kwargs} if kwargs else {}
        self.logger.log(level, message, exc_info=exc_info, extra=extra)


# Global logger instance
_global_logger: Optional[StructuredLogger] = None


def get_logger(
    name: str = "pinguin_backend",
    log_dir: Optional[Path] = None,
    log_level: int = logging.INFO
) -> StructuredLogger:
    """
    Get or create global logger instance.
    
    Args:
        name: Logger name
        log_dir: Directory for log files
        log_level: Minimum log level
    
    Returns:
        StructuredLogger instance
    """
    global _global_logger
    
    if _global_logger is None:
        _global_logger = StructuredLogger(
            name=name,
            log_dir=log_dir,
            log_level=log_level
        )
    
    return _global_logger


def set_log_level(level: int) -> None:
    """
    Set log level for global logger.
    
    Args:
        level: Log level (logging.DEBUG, logging.INFO, etc.)
    """
    if _global_logger is not None:
        _global_logger.logger.setLevel(level)
        for handler in _global_logger.logger.handlers:
            handler.setLevel(level)
