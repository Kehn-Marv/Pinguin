// Model descriptions array - types are defined globally in interface.d.ts
export const modelsDescription: ModelDescription[] = [
  // LLM Models
  {
    id: "gpt-oss:20b",
    name: "Gpt-oss: 20b",
    description: "A 20B open-weight GPT model focused on strong reasoning and general-purpose tasks.",
    size: 14336,
    minimumRAM: 64,
    type: "llm",
  },
  {
    id: "gpt-oss:120b",
    name: "Gpt-oss: 120b",
    description: "A large 120B open-weight GPT model offering advanced reasoning, coding, and agentic capabilities.",
    size: 66560,
    minimumRAM: 128,
    type: "llm",
  },
  {
    id: "qwen3:8b",
    name: "Qwen 3:8b",
    description: "A balanced, capable model for general-purpose use with strong reasoning and multilingual support.",
    size: 5324.8,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "qwen3:4b",
    name: "Qwen 3:4b (large context)",
    description: "A lightweight Qwen 3 model with extended context, optimized for fast inference and document-heavy tasks.",
    size: 2560,
    minimumRAM: 8,
    type: "llm",
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1",
    description: "A fast, high-quality model with strong reasoning and instruction-following.",
    size: 5017.6,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2",
    description: "A compact model tuned for efficiency while retaining solid performance for everyday use.",
    size: 2048,
    minimumRAM: 8,
    type: "llm",
  },
  {
    id: "phi4:14b",
    name: "Phi 4",
    description: "A small but high-performing model for strong reasoning, coding, and math.",
    size: 9328.4,
    minimumRAM: 32,
    type: "llm",
  },
  {
    id: "phi4-mini:3.8b",
    name: "Phi4-mini",
    description: "A lightweight Phi-4 variant with improved multilingual abilities, reasoning, math, and full function-calling support.",
    size: 2560,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3",
    description: "A highly efficient model offering top performance on a single GPU or local device.",
    size: 3379.2,
    minimumRAM: 8,
    type: "llm",
  },
  {
    id: "gemma3n:e4b",
    name: "Gemma 3n",
    description: "Optimized for low-power devices like laptops and mobile hardware.",
    size: 7680,
    minimumRAM: 8,
    type: "llm",
  },
  {
    id: "mistral:7b",
    name: "Mistral",
    description: "A strong, fast general-purpose model with excellent instruction quality.",
    size: 4505.6,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "mistral-nemo:12b",
    name: "Mistral-nemo",
    description: "A 12B Mistral-Nemo model with 128k context, built for high performance and long document handling.",
    size: 7260.8,
    minimumRAM: 32,
    type: "llm",
  },
  {
    id: "deepseek-r1:8b",
    name: "Deepseek-r1",
    description: "An advanced reasoning model approaching top-tier performance on math, logic, and agents.",
    size: 5324.8,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "deepseek-v2:16b",
    name: "Deepseek-v2",
    description: "An efficient Mixture-of-Experts model delivering strong performance at lower compute cost.",
    size: 9113.6,
    minimumRAM: 32,
    type: "llm",
  },
  {
    id: "dolphin3:8b",
    name: "Dolphin3",
    description: "An enhanced Llama-based model tuned for coding, math, reasoning, and general utility.",
    size: 5017.6,
    minimumRAM: 16,
    type: "llm",
  },
  {
    id: "codellama:13b",
    name: "Code llama",
    description: "A model specialized for generating, explaining, and working with code.",
    size: 7577.6,
    minimumRAM: 32,
    type: "llm",
  },
  // Embedding Models
  {
    id: "nomic-embed-text:v1.5",
    name: "Nomic Embed Text",
    description: "(Suggested) High-quality text embedding model with long context and strong retrieval performance.",
    size: 274,
    minimumRAM: 4,
    type: "embedding",
  },
  {
    id: "mxbai-embed-large:335m",
    name: "Mxbai-embed-large",
    description: "A state-of-the-art large embedding model optimized for semantic search and RAG.",
    size: 670,
    minimumRAM: 4,
    type: "embedding",
  },
  {
    id: "embeddinggemma:300m",
    name: "Embeddinggemma",
    description: "Google's lightweight embedding model delivering efficient, high-quality vector representations.",
    size: 622,
    minimumRAM: 4,
    type: "embedding",
  },
  {
    id: "bge-m3:567m",
    name: "Bge-m3",
    description: "A versatile embedding model supporting multi-lingual, multi-domain, and multi-granular tasks.",
    size: 1228.8,
    minimumRAM: 8,
    type: "embedding",
  },
  {
    id: "all-minilm:33m",
    name: "All-minilm",
    description: "Ultra-small embedding model trained on massive sentence datasets for fast semantic similarity tasks.",
    size: 67,
    minimumRAM: 4,
    type: "embedding",
  },
  {
    id: "snowflake-arctic-embed:335m",
    name: "Snowflake-arctic-embed",
    description: "Snowflake's optimized embedding model suite focused on strong retrieval and clustering performance.",
    size: 669,
    minimumRAM: 4,
    type: "embedding",
  },
];

export const isLLMModelId = (modelId: string): modelId is ModelID => {
  return modelsDescription.some(
    (description) => description.id === modelId && description.type === "llm"
  );
};

export const isEmbeddingModelId = (modelId: string): modelId is ModelID => {
  return modelsDescription.some(
    (description) =>
      description.id === modelId && description.type === "embedding"
  );
};

export const isModelId = (modelId: string): modelId is ModelID => {
  return modelsDescription.some((description) => description.id === modelId);
};
