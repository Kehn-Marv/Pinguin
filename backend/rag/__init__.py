"""
RAG (Retrieval Augmented Generation) pipeline components
"""

# Import only what actually exists and is used
from .embedder import Embedder
from .retriever import Retriever
from .mode_config import ModeConfig, MODE_CONFIGS, get_mode_config
from .prompt_builder import PromptBuilder, construct_prompt
from .ollama_client import (
    OllamaClient,
    OllamaModel,
    GenerateOptions,
    OllamaError,
    OllamaConnectionError,
    OllamaModelNotFoundError
)
from .chat_history import ChatHistoryManager, ChatMessage

# V2 modules - import directly when needed
# from .chunker_v2 import EnhancedChunk, EnhancedSemanticChunker
# from .ingest_v2 import EnhancedIngestPipeline

__all__ = [
    'Embedder',
    'Retriever',
    'ModeConfig',
    'MODE_CONFIGS',
    'get_mode_config',
    'PromptBuilder',
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
