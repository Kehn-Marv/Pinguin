import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const SPLIT_NUMBER_CHARACTERS = 500;
const SPLIT_OVERLAP_CHARACTERS = 50;

// Cache splitter instance for reuse (optimization)
let cachedSplitter: RecursiveCharacterTextSplitter | null = null;

/**
 * Gets or creates a cached text splitter instance
 * @returns Text splitter instance
 */
const getSplitter = (): RecursiveCharacterTextSplitter => {
  if (!cachedSplitter) {
    cachedSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: SPLIT_NUMBER_CHARACTERS,
      chunkOverlap: SPLIT_OVERLAP_CHARACTERS,
    });
  }
  return cachedSplitter;
};

/**
 * Splits text into chunks using optimized splitter
 * @param text - Text to split
 * @returns Array of text chunks
 */
export const splitText = async (text: string): Promise<string[]> => {
  const splitter = getSplitter();
  return splitter.splitText(text);
};

/**
 * Splits multiple texts in parallel for better performance
 * @param texts - Array of texts to split
 * @returns Flattened array of text chunks
 */
export const splitTextBatch = async (texts: string[]): Promise<string[]> => {
  const splitter = getSplitter();
  const results = await Promise.all(texts.map((text) => splitter.splitText(text)));
  return results.flat();
};
