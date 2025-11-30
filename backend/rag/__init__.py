"""
RAG (Retrieval Augmented Generation) pipeline components
"""

from .chunker import (
    Chunk,
    DocumentSection,
    SemanticChunker,
    TextbookChunker,
    SlideChunker,
    ScannedPDFChunker,
    create_chunker
)

from .embedder import Embedder

from .ingest import IngestPipeline, IngestResult

from .retriever import Retriever, RetrievalConfig

from .mode_config import ModeConfig, MODE_CONFIGS, get_mode_config

from .prompt_builder import PromptBuilder, ChatMessage as PromptChatMessage, construct_prompt

from .ollama_client import (
    OllamaClient,
    OllamaModel,
    GenerateOptions,
    OllamaError,
    OllamaConnectionError,
    OllamaModelNotFoundError
)

from .chat_history import ChatHistoryManager, ChatMessage

__all__ = [
    'Chunk',
    'DocumentSection',
    'SemanticChunker',
    'TextbookChunker',
    'SlideChunker',
    'ScannedPDFChunker',
    'create_chunker',
    'Embedder',
    'IngestPipeline',
    'IngestResult',
    'Retriever',
    'RetrievalConfig',
    'ModeConfig',
    'MODE_CONFIGS',
    'get_mode_config',
    'PromptBuilder',
    'PromptChatMessage',
    'construct_prompt',
    'OllamaClient',
    'OllamaModel',
    'GenerateOptions',
    'OllamaError',
    'OllamaConnectionError',
    'OllamaModelNotFoundError',
    'ChatHistoryManager',
    'ChatMessage'
]
