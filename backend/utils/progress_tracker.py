"""
Progress tracking utility for long-running operations.
Provides progress reporting with estimated time remaining.
"""
import time
import logging
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger("pinguin_backend.utils.progress_tracker")


@dataclass
class ProgressInfo:
    """Progress information for an operation."""
    operation: str
    current: int
    total: int
    percentage: float
    elapsed_seconds: float
    estimated_remaining_seconds: Optional[float] = None
    status: str = "in_progress"
    message: Optional[str] = None


class ProgressTracker:
    """
    Track progress of long-running operations with ETA calculation.
    
    Features:
    - Progress percentage calculation
    - Elapsed time tracking
    - Estimated time remaining (ETA)
    - Progress callbacks for real-time updates
    """
    
    def __init__(
        self,
        operation: str,
        total: int,
        callback: Optional[Callable[[ProgressInfo], None]] = None,
        update_interval: float = 0.5
    ):
        """
        Initialize progress tracker.
        
        Args:
            operation: Name of the operation being tracked
            total: Total number of items to process
            callback: Optional callback function for progress updates
            update_interval: Minimum seconds between callback invocations (default: 0.5)
        """
        self.operation = operation
        self.total = total
        self.callback = callback
        self.update_interval = update_interval
        
        self.current = 0
        self.start_time = time.time()
        self.last_update_time = 0.0
        
        logger.info(
            f"Progress tracker initialized: operation={operation}, total={total}"
        )
    
    def update(self, current: Optional[int] = None, message: Optional[str] = None) -> None:
        """
        Update progress.
        
        Args:
            current: Current progress count (if None, increments by 1)
            message: Optional status message
        """
        if current is not None:
            self.current = current
        else:
            self.current += 1
        
        # Calculate progress
        percentage = (self.current / self.total * 100) if self.total > 0 else 0
        elapsed = time.time() - self.start_time
        
        # Estimate remaining time
        eta = None
        if self.current > 0 and self.current < self.total and elapsed > 0:
            rate = self.current / elapsed  # items per second
            remaining_items = self.total - self.current
            eta = remaining_items / rate if rate > 0 else None
        
        # Create progress info
        progress_info = ProgressInfo(
            operation=self.operation,
            current=self.current,
            total=self.total,
            percentage=percentage,
            elapsed_seconds=elapsed,
            estimated_remaining_seconds=eta,
            status="in_progress" if self.current < self.total else "complete",
            message=message
        )
        
        # Call callback if enough time has passed
        current_time = time.time()
        if self.callback and (current_time - self.last_update_time >= self.update_interval):
            self.callback(progress_info)
            self.last_update_time = current_time
    
    def complete(self, message: Optional[str] = None) -> None:
        """
        Mark operation as complete.
        
        Args:
            message: Optional completion message
        """
        self.current = self.total
        elapsed = time.time() - self.start_time
        
        progress_info = ProgressInfo(
            operation=self.operation,
            current=self.total,
            total=self.total,
            percentage=100.0,
            elapsed_seconds=elapsed,
            estimated_remaining_seconds=0.0,
            status="complete",
            message=message or "Operation completed"
        )
        
        if self.callback:
            self.callback(progress_info)
        
        logger.info(
            f"Progress tracker complete: operation={self.operation}, "
            f"elapsed={elapsed:.2f}s"
        )
    
    def error(self, error_message: str) -> None:
        """
        Mark operation as failed.
        
        Args:
            error_message: Error description
        """
        elapsed = time.time() - self.start_time
        
        progress_info = ProgressInfo(
            operation=self.operation,
            current=self.current,
            total=self.total,
            percentage=(self.current / self.total * 100) if self.total > 0 else 0,
            elapsed_seconds=elapsed,
            estimated_remaining_seconds=None,
            status="error",
            message=error_message
        )
        
        if self.callback:
            self.callback(progress_info)
        
        logger.error(
            f"Progress tracker error: operation={self.operation}, "
            f"error={error_message}"
        )
    
    def get_progress_dict(self) -> Dict[str, Any]:
        """
        Get current progress as dictionary.
        
        Returns:
            Dictionary with progress information
        """
        elapsed = time.time() - self.start_time
        percentage = (self.current / self.total * 100) if self.total > 0 else 0
        
        # Estimate remaining time
        eta = None
        if self.current > 0 and self.current < self.total and elapsed > 0:
            rate = self.current / elapsed
            remaining_items = self.total - self.current
            eta = remaining_items / rate if rate > 0 else None
        
        return {
            "operation": self.operation,
            "current": self.current,
            "total": self.total,
            "percentage": round(percentage, 1),
            "elapsed_seconds": round(elapsed, 2),
            "estimated_remaining_seconds": round(eta, 2) if eta else None,
            "status": "in_progress" if self.current < self.total else "complete"
        }
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if exc_type is None:
            self.complete()
        else:
            self.error(str(exc_val))
        return False
    
    def __repr__(self) -> str:
        percentage = (self.current / self.total * 100) if self.total > 0 else 0
        return (
            f"ProgressTracker(operation={self.operation}, "
            f"progress={self.current}/{self.total} ({percentage:.1f}%))"
        )


def format_time_remaining(seconds: Optional[float]) -> str:
    """
    Format estimated time remaining in human-readable format.
    
    Args:
        seconds: Seconds remaining (or None)
        
    Returns:
        Formatted string like "2m 30s" or "Unknown"
    """
    if seconds is None:
        return "Unknown"
    
    if seconds < 1:
        return "< 1s"
    
    if seconds < 60:
        return f"{int(seconds)}s"
    
    minutes = int(seconds / 60)
    remaining_seconds = int(seconds % 60)
    
    if minutes < 60:
        return f"{minutes}m {remaining_seconds}s"
    
    hours = int(minutes / 60)
    remaining_minutes = int(minutes % 60)
    
    return f"{hours}h {remaining_minutes}m"
