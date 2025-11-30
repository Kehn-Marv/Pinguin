"""
Chat history and conversation context management.

Stores and retrieves chat messages with token counting
and context window management.
"""
import json
import os
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from pathlib import Path
from transformers import AutoTokenizer

try:
    from utils.logger import get_logger
except ImportError:
    from ..utils.logger import get_logger


logger = get_logger(__name__)


@dataclass
class ChatMessage:
    """Represents a chat message."""
    id: str
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: str
    sources: Optional[List[Dict[str, Any]]] = None
    mode: str = 'files'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ChatMessage':
        """Create from dictionary."""
        return cls(**data)


class ChatHistoryManager:
    """
    Manages chat history with persistence and context window management.
    """
    
    def __init__(
        self,
        storage_path: Optional[str] = None,
        max_context_messages: int = 8,
        context_window_tokens: int = 4096,
        tokenizer_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    ):
        """
        Initialize the chat history manager.
        
        Args:
            storage_path: Path to store chat history JSON file
            max_context_messages: Maximum number of messages to include in context
            context_window_tokens: Maximum tokens for context window
            tokenizer_name: Name of tokenizer for token counting
        """
        self.max_context_messages = max_context_messages
        self.context_window_tokens = context_window_tokens
        
        # Set up storage path
        if storage_path is None:
            storage_path = os.path.join(os.getcwd(), 'data', 'chat_history.json')
        
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize tokenizer for token counting
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
        except Exception as e:
            logger.warning(f"Failed to load tokenizer: {e}. Token counting will be approximate.")
            self.tokenizer = None
        
        # Load existing history
        self.messages: List[ChatMessage] = []
        self._load_history()
    
    def _load_history(self) -> None:
        """Load chat history from storage."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.messages = [ChatMessage.from_dict(msg) for msg in data]
                logger.info(f"Loaded {len(self.messages)} messages from history")
            except Exception as e:
                logger.error(f"Failed to load chat history: {e}")
                self.messages = []
        else:
            logger.info("No existing chat history found")
    
    def _save_history(self) -> None:
        """Save chat history to storage."""
        try:
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                data = [msg.to_dict() for msg in self.messages]
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.debug(f"Saved {len(self.messages)} messages to history")
        except Exception as e:
            logger.error(f"Failed to save chat history: {e}")
    
    def add_message(
        self,
        role: str,
        content: str,
        sources: Optional[List[Dict[str, Any]]] = None,
        mode: str = 'files'
    ) -> ChatMessage:
        """
        Add a message to the chat history.
        
        Args:
            role: Message role ('user' or 'assistant')
            content: Message content
            sources: Optional source references for assistant messages
            mode: Study mode used for this message
            
        Returns:
            The created ChatMessage
        """
        message = ChatMessage(
            id=self._generate_message_id(),
            role=role,
            content=content,
            timestamp=datetime.utcnow().isoformat(),
            sources=sources,
            mode=mode
        )
        
        self.messages.append(message)
        self._save_history()
        
        logger.debug(f"Added {role} message to history")
        return message
    
    def get_recent_messages(self, count: Optional[int] = None) -> List[ChatMessage]:
        """
        Get the most recent messages.
        
        Args:
            count: Number of messages to retrieve (default: max_context_messages)
            
        Returns:
            List of recent messages
        """
        if count is None:
            count = self.max_context_messages
        
        return self.messages[-count:] if len(self.messages) > count else self.messages
    
    def get_context_messages(self) -> List[ChatMessage]:
        """
        Get messages for LLM context, respecting token limits.
        
        Returns:
            List of messages that fit within context window
        """
        recent = self.get_recent_messages()
        
        # If no tokenizer, just return recent messages
        if self.tokenizer is None:
            return recent
        
        # Calculate tokens and trim if necessary
        context_messages = []
        total_tokens = 0
        
        # Iterate in reverse to prioritize recent messages
        for message in reversed(recent):
            message_tokens = self.count_tokens(message.content)
            
            if total_tokens + message_tokens <= self.context_window_tokens:
                context_messages.insert(0, message)
                total_tokens += message_tokens
            else:
                logger.debug(
                    f"Context window limit reached. Including {len(context_messages)} messages "
                    f"({total_tokens} tokens)"
                )
                break
        
        return context_messages
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text.
        
        Args:
            text: Text to count tokens for
            
        Returns:
            Number of tokens
        """
        if self.tokenizer is None:
            # Approximate: ~4 characters per token
            return len(text) // 4
        
        try:
            tokens = self.tokenizer.encode(text, add_special_tokens=False)
            return len(tokens)
        except Exception as e:
            logger.warning(f"Token counting failed: {e}. Using approximation.")
            return len(text) // 4
    
    def get_context_usage(self) -> Dict[str, Any]:
        """
        Get information about context window usage.
        
        Returns:
            Dictionary with context usage information
        """
        context_messages = self.get_context_messages()
        total_tokens = sum(self.count_tokens(msg.content) for msg in context_messages)
        
        return {
            'message_count': len(context_messages),
            'total_messages': len(self.messages),
            'tokens_used': total_tokens,
            'tokens_available': self.context_window_tokens,
            'tokens_remaining': self.context_window_tokens - total_tokens,
            'usage_percent': (total_tokens / self.context_window_tokens) * 100,
            'is_near_limit': total_tokens > (self.context_window_tokens * 0.8)
        }
    
    def clear_history(self) -> int:
        """
        Clear all chat history.
        
        Returns:
            Number of messages cleared
        """
        count = len(self.messages)
        self.messages = []
        self._save_history()
        logger.info(f"Cleared {count} messages from history")
        return count
    
    def get_all_messages(self) -> List[ChatMessage]:
        """
        Get all messages in history.
        
        Returns:
            List of all messages
        """
        return self.messages.copy()
    
    def get_messages_paginated(
        self,
        page: int = 1,
        page_size: int = 50
    ) -> Dict[str, Any]:
        """
        Get messages with pagination.
        
        Args:
            page: Page number (1-indexed)
            page_size: Number of messages per page
            
        Returns:
            Dictionary with messages and pagination info
        """
        total = len(self.messages)
        total_pages = (total + page_size - 1) // page_size
        
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        messages = self.messages[start_idx:end_idx]
        
        return {
            'messages': messages,
            'page': page,
            'page_size': page_size,
            'total_messages': total,
            'total_pages': total_pages,
            'has_next': page < total_pages,
            'has_prev': page > 1
        }
    
    def search_messages(self, query: str) -> List[ChatMessage]:
        """
        Search messages by content.
        
        Args:
            query: Search query
            
        Returns:
            List of matching messages
        """
        query_lower = query.lower()
        return [
            msg for msg in self.messages
            if query_lower in msg.content.lower()
        ]
    
    def export_history(self, export_path: str) -> None:
        """
        Export chat history to a file.
        
        Args:
            export_path: Path to export file
        """
        export_path = Path(export_path)
        export_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(export_path, 'w', encoding='utf-8') as f:
                data = [msg.to_dict() for msg in self.messages]
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Exported {len(self.messages)} messages to {export_path}")
        except Exception as e:
            logger.error(f"Failed to export chat history: {e}")
            raise
    
    def _generate_message_id(self) -> str:
        """Generate a unique message ID."""
        import uuid
        return str(uuid.uuid4())
