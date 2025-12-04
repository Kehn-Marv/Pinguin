"""
Study mode configurations for Pinguin RAG system.

Defines system prompts, retrieval parameters, and context strategies
for each study mode (Files, Coding, Thinking).
"""
from dataclasses import dataclass
from typing import Literal

try:
    from models.schemas import StudyMode
except ImportError:
    from ..models.schemas import StudyMode


ContextStrategy = Literal['detailed', 'concise', 'exploratory']


@dataclass
class ModeConfig:
    """Configuration for a study mode."""
    name: StudyMode
    system_prompt: str
    retrieval_top_k: int
    temperature: float
    context_strategy: ContextStrategy


# Study mode configurations
MODE_CONFIGS = {
    StudyMode.FILES: ModeConfig(
        name=StudyMode.FILES,
        system_prompt="""You are a study assistant helping a university student.
Answer questions based ONLY on the provided document excerpts.
Always cite sources with [Document Name - Page X].
If information is not in the documents, say so clearly.
Be precise, thorough, and academic in your responses.""",
        retrieval_top_k=10,
        temperature=0.3,
        context_strategy='detailed'
    ),
    
    StudyMode.CODING: ModeConfig(
        name=StudyMode.CODING,
        system_prompt="""You are a coding tutor helping a student learn programming.
Provide clear code examples, explain syntax, and highlight best practices.
Reference the student's materials when available.
Break down complex concepts into understandable steps.
Focus on practical implementation and common pitfalls.""",
        retrieval_top_k=8,
        temperature=0.5,
        context_strategy='concise'
    ),
    
    StudyMode.THINKING: ModeConfig(
        name=StudyMode.THINKING,
        system_prompt="""You are a Socratic tutor helping a student think deeply.
Ask probing questions, explore concepts from multiple angles,
and guide the student to discover insights.
Use their materials as a foundation for deeper exploration.
Encourage critical thinking and connections between ideas.
Help them understand not just what, but why and how.""",
        retrieval_top_k=6,
        temperature=0.7,
        context_strategy='exploratory'
    )
}


def get_mode_config(mode: StudyMode) -> ModeConfig:
    """
    Get configuration for a specific study mode.
    
    Args:
        mode: The study mode
        
    Returns:
        ModeConfig for the specified mode
        
    Raises:
        ValueError: If mode is not recognized
    """
    if mode not in MODE_CONFIGS:
        raise ValueError(f"Unknown study mode: {mode}")
    return MODE_CONFIGS[mode]
