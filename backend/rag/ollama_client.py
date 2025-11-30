"""
Ollama client for local LLM interactions.

Provides methods for generating responses, listing models,
and downloading models from Ollama.
"""
import asyncio
import json
import time
from typing import AsyncIterator, Dict, List, Optional, Any
from dataclasses import dataclass
import aiohttp

try:
    from utils.logger import get_logger
except ImportError:
    from ..utils.logger import get_logger


logger = get_logger(__name__)


@dataclass
class OllamaModel:
    """Represents an Ollama model."""
    name: str
    size: int
    modified_at: str
    digest: str
    details: Optional[Dict[str, Any]] = None


@dataclass
class GenerateOptions:
    """Options for text generation."""
    temperature: float = 0.7
    num_ctx: int = 4096
    top_p: float = 0.9
    top_k: int = 40
    repeat_penalty: float = 1.1
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request."""
        return {
            'temperature': self.temperature,
            'num_ctx': self.num_ctx,
            'top_p': self.top_p,
            'top_k': self.top_k,
            'repeat_penalty': self.repeat_penalty
        }


class OllamaError(Exception):
    """Base exception for Ollama client errors."""
    pass


class OllamaConnectionError(OllamaError):
    """Raised when connection to Ollama fails."""
    pass


class OllamaModelNotFoundError(OllamaError):
    """Raised when a model is not found."""
    pass


class OllamaClient:
    """
    Client for interacting with Ollama API.
    """
    
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        timeout: int = 300,
        max_retries: int = 3
    ):
        """
        Initialize the Ollama client.
        
        Args:
            base_url: Base URL for Ollama API
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session
    
    async def close(self) -> None:
        """Close the client session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def _retry_request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> aiohttp.ClientResponse:
        """
        Make HTTP request with exponential backoff retry.
        
        Args:
            method: HTTP method
            url: Request URL
            **kwargs: Additional request parameters
            
        Returns:
            Response object
            
        Raises:
            OllamaConnectionError: If all retries fail
        """
        session = await self._get_session()
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                async with session.request(method, url, **kwargs) as response:
                    response.raise_for_status()
                    return response
            except aiohttp.ClientError as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    # Exponential backoff: 1s, 2s, 4s
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"Request failed (attempt {attempt + 1}/{self.max_retries}): {e}. "
                        f"Retrying in {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"All retry attempts failed: {e}")
        
        raise OllamaConnectionError(
            f"Failed to connect to Ollama after {self.max_retries} attempts: {last_error}"
        )
    
    async def generate(
        self,
        model: str,
        prompt: str,
        options: Optional[GenerateOptions] = None,
        stream: bool = True
    ) -> AsyncIterator[str]:
        """
        Generate text using an Ollama model with streaming support.
        
        Args:
            model: Name of the model to use
            prompt: Input prompt
            options: Generation options
            stream: Whether to stream the response
            
        Yields:
            Generated text tokens
            
        Raises:
            OllamaConnectionError: If connection fails
            OllamaModelNotFoundError: If model is not found
        """
        url = f"{self.base_url}/api/generate"
        
        payload = {
            'model': model,
            'prompt': prompt,
            'stream': stream
        }
        
        if options:
            payload['options'] = options.to_dict()
        
        session = await self._get_session()
        
        try:
            async with session.post(url, json=payload) as response:
                if response.status == 404:
                    raise OllamaModelNotFoundError(f"Model '{model}' not found")
                
                response.raise_for_status()
                
                if stream:
                    # Stream response line by line
                    async for line in response.content:
                        if line:
                            try:
                                data = json.loads(line)
                                if 'response' in data:
                                    yield data['response']
                                
                                # Check if generation is done
                                if data.get('done', False):
                                    break
                            except json.JSONDecodeError as e:
                                logger.warning(f"Failed to parse streaming response: {e}")
                                continue
                else:
                    # Non-streaming response
                    data = await response.json()
                    yield data.get('response', '')
        
        except aiohttp.ClientError as e:
            logger.error(f"Error during generation: {e}")
            raise OllamaConnectionError(f"Failed to generate response: {e}")
    
    async def generate_complete(
        self,
        model: str,
        prompt: str,
        options: Optional[GenerateOptions] = None
    ) -> str:
        """
        Generate complete response (non-streaming).
        
        Args:
            model: Name of the model to use
            prompt: Input prompt
            options: Generation options
            
        Returns:
            Complete generated text
        """
        full_response = ""
        async for token in self.generate(model, prompt, options, stream=False):
            full_response += token
        return full_response
    
    async def list_models(self) -> List[OllamaModel]:
        """
        List all available Ollama models.
        
        Returns:
            List of OllamaModel objects
            
        Raises:
            OllamaConnectionError: If connection fails
        """
        url = f"{self.base_url}/api/tags"
        
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                response.raise_for_status()
                data = await response.json()
                
                models = []
                for model_data in data.get('models', []):
                    models.append(OllamaModel(
                        name=model_data['name'],
                        size=model_data.get('size', 0),
                        modified_at=model_data.get('modified_at', ''),
                        digest=model_data.get('digest', ''),
                        details=model_data.get('details')
                    ))
                
                return models
        
        except aiohttp.ClientError as e:
            logger.error(f"Error listing models: {e}")
            raise OllamaConnectionError(f"Failed to list models: {e}")
    
    async def pull_model(
        self,
        model_name: str,
        stream: bool = True
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Download/pull an Ollama model with progress tracking.
        
        Args:
            model_name: Name of the model to pull
            stream: Whether to stream progress updates
            
        Yields:
            Progress updates as dictionaries with keys:
            - status: Current status message
            - completed: Bytes downloaded (if available)
            - total: Total bytes (if available)
            - percent: Download percentage (if available)
            
        Raises:
            OllamaConnectionError: If connection fails
        """
        url = f"{self.base_url}/api/pull"
        payload = {
            'name': model_name,
            'stream': stream
        }
        
        session = await self._get_session()
        
        try:
            async with session.post(url, json=payload) as response:
                response.raise_for_status()
                
                if stream:
                    async for line in response.content:
                        if line:
                            try:
                                data = json.loads(line)
                                
                                # Calculate percentage if possible
                                progress_info = {
                                    'status': data.get('status', 'downloading')
                                }
                                
                                if 'completed' in data and 'total' in data:
                                    completed = data['completed']
                                    total = data['total']
                                    progress_info['completed'] = completed
                                    progress_info['total'] = total
                                    
                                    if total > 0:
                                        progress_info['percent'] = (completed / total) * 100
                                
                                yield progress_info
                                
                                # Check if pull is complete
                                if data.get('status') == 'success':
                                    break
                            
                            except json.JSONDecodeError as e:
                                logger.warning(f"Failed to parse pull progress: {e}")
                                continue
                else:
                    data = await response.json()
                    yield {'status': data.get('status', 'complete')}
        
        except aiohttp.ClientError as e:
            logger.error(f"Error pulling model: {e}")
            raise OllamaConnectionError(f"Failed to pull model '{model_name}': {e}")
    
    async def show_model(self, model_name: str) -> Dict[str, Any]:
        """
        Get information about a specific model.
        
        Args:
            model_name: Name of the model
            
        Returns:
            Model information dictionary
            
        Raises:
            OllamaConnectionError: If connection fails
            OllamaModelNotFoundError: If model is not found
        """
        url = f"{self.base_url}/api/show"
        payload = {'name': model_name}
        
        try:
            session = await self._get_session()
            async with session.post(url, json=payload) as response:
                if response.status == 404:
                    raise OllamaModelNotFoundError(f"Model '{model_name}' not found")
                
                response.raise_for_status()
                return await response.json()
        
        except aiohttp.ClientError as e:
            logger.error(f"Error showing model info: {e}")
            raise OllamaConnectionError(f"Failed to get model info: {e}")
    
    async def is_model_available(self, model_name: str) -> bool:
        """
        Check if a model is available.
        
        Args:
            model_name: Name of the model to check
            
        Returns:
            True if model is available, False otherwise
        """
        try:
            await self.show_model(model_name)
            return True
        except (OllamaConnectionError, OllamaModelNotFoundError):
            return False
    
    async def health_check(self) -> bool:
        """
        Check if Ollama service is healthy.
        
        Returns:
            True if service is responsive, False otherwise
        """
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/") as response:
                return response.status == 200
        except Exception as e:
            logger.warning(f"Ollama health check failed: {e}")
            return False
