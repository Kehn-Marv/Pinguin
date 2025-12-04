"""
Prompt construction for RAG-enhanced LLM queries.

Formats retrieved chunks, conversation history, and system prompts
into a complete prompt for the LLM.
"""
from typing import List, Optional
from dataclasses import dataclass

try:
    from models.schemas import StudyMode, RetrievedChunk
except ImportError:
    from ..models.schemas import StudyMode, RetrievedChunk

from .mode_config import get_mode_config


@dataclass
class ChatMessage:
    """Represents a chat message in conversation history."""
    role: str  # 'user' or 'assistant'
    content: str
    
    def __str__(self) -> str:
        role_label = "User" if self.role == "user" else "Assistant"
        return f"{role_label}: {self.content}"


class PromptBuilder:
    """
    Constructs prompts for LLM queries with RAG context.
    """
    
    def __init__(self, mode: StudyMode = StudyMode.FILES):
        """
        Initialize the prompt builder.
        
        Args:
            mode: The study mode to use for prompt construction
        """
        self.mode = mode
        self.config = get_mode_config(mode)
    
    def build_prompt(
        self,
        query: str,
        retrieved_chunks: List[RetrievedChunk],
        conversation_history: Optional[List[ChatMessage]] = None,
        max_history_messages: int = 8
    ) -> str:
        """
        Build a complete prompt for the LLM.
        
        Args:
            query: The user's question
            retrieved_chunks: Chunks retrieved from vector search
            conversation_history: Previous messages in the conversation
            max_history_messages: Maximum number of history messages to include
            
        Returns:
            Complete formatted prompt string
        """
        sections = []
        
        # 1. System prompt
        sections.append(self._format_system_prompt())
        
        # 2. Retrieved context with citations
        if retrieved_chunks:
            sections.append(self._format_context(retrieved_chunks))
        
        # 3. Conversation history (last N messages)
        if conversation_history:
            sections.append(self._format_history(conversation_history, max_history_messages))
        
        # 4. Current question
        sections.append(self._format_current_query(query))
        
        return "\n\n".join(sections)
    
    def _format_system_prompt(self) -> str:
        """Format the system prompt section."""
        return f"# System Instructions\n{self.config.system_prompt}"
    
    def _format_context(self, chunks: List[RetrievedChunk]) -> str:
        """
        Format retrieved chunks with citations.
        
        Args:
            chunks: Retrieved chunks to format
            
        Returns:
            Formatted context section
        """
        context_parts = ["# Retrieved Context"]
        
        for i, chunk in enumerate(chunks, 1):
            # Build citation
            filename = chunk.metadata.filename
            page = chunk.metadata.page
            page_str = f"Page {page}" if page is not None else "N/A"
            citation = f"[{filename} - {page_str}]"
            
            # Add heading if available
            heading_info = ""
            if chunk.metadata.heading:
                heading_info = f" ({chunk.metadata.heading})"
            
            # Format chunk with citation
            chunk_text = f"Source {i} {citation}{heading_info}:\n{chunk.text}"
            context_parts.append(chunk_text)
        
        return "\n\n".join(context_parts)
    
    def _format_history(
        self,
        history: List[ChatMessage],
        max_messages: int
    ) -> str:
        """
        Format conversation history.
        
        Args:
            history: List of chat messages
            max_messages: Maximum number of messages to include
            
        Returns:
            Formatted history section
        """
        # Take only the last N messages
        recent_history = history[-max_messages:] if len(history) > max_messages else history
        
        if not recent_history:
            return ""
        
        history_parts = ["# Conversation History"]
        history_parts.extend(str(msg) for msg in recent_history)
        
        return "\n".join(history_parts)
    
    def _format_current_query(self, query: str) -> str:
        """
        Format the current user query.
        
        Args:
            query: The user's question
            
        Returns:
            Formatted query section
        """
        return f"# Current Question\nUser: {query}\n\nAssistant:"
    
    def set_mode(self, mode: StudyMode) -> None:
        """
        Change the study mode.
        
        Args:
            mode: New study mode
        """
        self.mode = mode
        self.config = get_mode_config(mode)


def construct_prompt(
    query: str,
    retrieved_chunks: List[RetrievedChunk],
    conversation_history: Optional[List[ChatMessage]] = None,
    mode: StudyMode = StudyMode.FILES,
    max_history_messages: int = 8
) -> str:
    """
    Convenience function to construct a prompt.
    
    Args:
        query: The user's question
        retrieved_chunks: Chunks retrieved from vector search
        conversation_history: Previous messages in the conversation
        mode: Study mode to use
        max_history_messages: Maximum number of history messages to include
        
    Returns:
        Complete formatted prompt string
    """
    builder = PromptBuilder(mode)
    return builder.build_prompt(query, retrieved_chunks, conversation_history, max_history_messages)
