import { Ollama } from "ollama";
import { getOllamaHost } from "../ollama";
import { getEmbeddingsModel } from "../model";

export const embed = async (text: string): Promise<number[]> => {
  const ollama = new Ollama({ host: getOllamaHost() });
  const model = await getEmbeddingsModel();
  if (!model) {
    throw new Error("No embeddings model configured");
  }
  const response = await ollama.embeddings({ model, prompt: text });
  return response.embedding;
};
