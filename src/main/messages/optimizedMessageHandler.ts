import MessageDB from "./messageDB";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ChatOllama } from "@langchain/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { searchExcerpts } from "../documents";
import Logger from "electron-log";
import PerformanceMonitor from "../utils/performanceMonitor";
import ConversationContextManager from "./conversationContextManager";

/**
 * Helper function to check if a message contains context references
 * that would benefit from contextualization
 */
export const containsContextReferences = (message: string): boolean => {
  const lowerMessage = message.toLowerCase();
  
  // Check for pronouns and references that indicate context dependency
  const contextIndicators = [
    /\bit\b/i,           // "it"
    /\bthis\b/i,         // "this"
    /\bthat\b/i,         // "that"
    /\bthese\b/i,        // "these"
    /\bthose\b/i,        // "those"
    /\bthem\b/i,         // "them"
    /\bthey\b/i,         // "they"
    /\btheir\b/i,        // "their"
    /\bhe\b/i,           // "he"
    /\bshe\b/i,          // "she"
    /\babove\b/i,        // "above"
    /\bprevious\b/i,     // "previous"
    /\bearlier\b/i,      // "earlier"
    /\bmentioned\b/i,    // "mentioned"
    /\bsaid\b/i,         // "said"
    /\bexplain more\b/i, // "explain more"
    /\belaborate\b/i,    // "elaborate"
    /\bcontinue\b/i,     // "continue"
    /\bwhat about\b/i,   // "what about"
    /\bhow about\b/i,    // "how about"
    /\balso\b/i,         // "also"
  ];
  
  return contextIndicators.some(pattern => pattern.test(lowerMessage));
};

/**
 * Optimized message handler that implements parallel processing
 * and conditional contextualization for improved performance
 */
export class OptimizedMessageHandler {
  /**
   * Contextualizes a question based on chat history
   */
  private static async contextualizeQuestion(
    question: string,
    chatHistory: (HumanMessage | AIMessage)[],
    llm: ChatOllama
  ): Promise<string> {
    return PerformanceMonitor.measureAsync(
      "contextualization",
      async () => {
        Logger.info(`Contextualizing question: ${question}`);
        const systemPrompt = `Given a chat history and the latest user question
which might reference context in the chat history, formulate a standalone question
which can be understood without the chat history. Do NOT answer the question,
just reformulate it if needed and otherwise return it as is.`;

        const prompt = ChatPromptTemplate.fromMessages([
          ["system", systemPrompt],
          new MessagesPlaceholder("chatHistory"),
          ["human", question],
        ]);

        const chain = prompt.pipe(llm as any).pipe(new StringOutputParser() as any);
        const contextualizedQuestion = (await chain.invoke({
          chatHistory,
          question,
        })) as string;
        Logger.info(`Contextualized question: ${contextualizedQuestion}`);
        return contextualizedQuestion;
      },
      { questionLength: question.length, historyLength: chatHistory.length }
    );
  }

  /**
   * Loads optimized chat history with token limit
   * Returns last 10 message pairs (20 messages total) with max 2000 tokens
   * Implements Requirements 5.1, 5.2, 5.4, 5.5
   */
  private static async getOptimizedHistory(
    courseId: string,
    chatId: string,
    messageDB: MessageDB
  ): Promise<(HumanMessage | AIMessage)[]> {
    const contextManager = ConversationContextManager.getInstance();
    
    // Try to restore context from persistence first (Requirement 5.4)
    const restoredContext = await contextManager.restoreContext(courseId, chatId);
    
    if (restoredContext && restoredContext.messages.length > 0) {
      Logger.info(
        `Using restored context for chat ${chatId}: ${restoredContext.messages.length} messages (~${restoredContext.tokenCount} tokens)`
      );
      return contextManager.contextToLangChainMessages(restoredContext);
    }
    
    // Fall back to loading from MessageDB if no persisted context
    const messages = messageDB.getMessages();
    
    // Exclude the last message (the current one being processed)
    // We only want PREVIOUS conversation history for contextualization
    const previousMessages = messages.slice(0, -1);
    
    // Get last 20 messages (10 pairs) - Requirement 5.1
    const recentMessages = previousMessages.slice(-20);
    
    // Convert to LangChain message format
    const chatHistory = recentMessages.map((message) =>
      message.sender === "human"
        ? new HumanMessage(this.sanitize(message.content))
        : new AIMessage(this.sanitize(message.content))
    );
    
    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    // Implement smart context truncation (max 2000 tokens) - Requirement 5.2
    let totalTokens = 0;
    const optimizedHistory: (HumanMessage | AIMessage)[] = [];
    
    // Add messages from most recent, stopping if we exceed 2000 tokens
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const messageTokens = Math.ceil(chatHistory[i].content.toString().length / 4);
      if (totalTokens + messageTokens > 2000) {
        break;
      }
      optimizedHistory.unshift(chatHistory[i]);
      totalTokens += messageTokens;
    }
    
    Logger.info(`Loaded ${optimizedHistory.length} messages (~${totalTokens} tokens) for context`);
    return optimizedHistory;
  }

  /**
   * Processes a message with optimized parallel pipeline
   * Implements Requirements 5.1, 5.2, 5.4, 5.5
   */
  static async processMessage(
    courseId: string,
    chatId: string,
    message: string,
    llm: ChatOllama,
    documentIds?: string[]
  ): Promise<{
    contextualizedQuestion: string;
    excerpts: Excerpt[];
    chatHistory: (HumanMessage | AIMessage)[];
  }> {
    return PerformanceMonitor.measureAsync(
      "messageProcessing",
      async () => {
        const messageDB = MessageDB.getInstance(courseId, chatId);
        
        // Load optimized chat history (last 10 pairs, max 2000 tokens)
        // with context restoration support (Requirements 5.1, 5.2, 5.4, 5.5)
        const chatHistory = await this.getOptimizedHistory(courseId, chatId, messageDB);
        
        // Determine if contextualization is needed
        // Only contextualize if there's actual conversation history (at least 2 messages: 1 human + 1 bot)
        // AND the message contains context references
        const shouldContextualize = 
          chatHistory.length >= 2 && 
          containsContextReferences(message);
        
        Logger.info(`Should contextualize: ${shouldContextualize} (history length: ${chatHistory.length})`);
        
        // Stage 1: Parallel execution of contextualization and document search
        const endDocSearchTimer = PerformanceMonitor.startTimer("documentSearch", {
          courseId,
          chatId,
          messageLength: message.length,
        });
        
        // Determine excerpt retrieval strategy based on documentIds
        const excerptPromise = documentIds && documentIds.length > 0
          ? this.getRelevantExcerptsForDocuments(message, courseId, documentIds)
          : this.safeSearchExcerpts(message, courseId, chatId);
        
        const [contextualizedQuestion, excerpts] = await Promise.all([
          // Conditional contextualization
          shouldContextualize
            ? this.contextualizeQuestion(this.sanitize(message), chatHistory, llm)
            : Promise.resolve(message),
          // Document search (filtered by documentIds if provided, otherwise chat-scoped)
          excerptPromise,
        ]);
        
        endDocSearchTimer();
        Logger.info(`Found ${excerpts.length} document excerpts`);
        
        return {
          contextualizedQuestion,
          excerpts,
          chatHistory,
        };
      },
      { courseId, chatId, messageLength: message.length }
    );
  }

  /**
   * Get relevant excerpts filtered by specific document IDs
   */
  private static async getRelevantExcerptsForDocuments(
    query: string,
    courseId: string,
    documentIds: string[]
  ): Promise<Excerpt[]> {
    Logger.info(`Searching excerpts for ${documentIds.length} specific documents`);
    
    try {
      // Add timeout to document search
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Document-specific search timed out"));
        }, 10000); // 10 second timeout
      });
      
      const searchPromise = this.performDocumentSearch(query, courseId, documentIds);
      const excerpts = await Promise.race([searchPromise, timeoutPromise]);
      
      Logger.info(`Filtered to ${excerpts.length} excerpts from specified documents`);
      return excerpts;
    } catch (error) {
      Logger.warn(`Document-specific search failed, continuing without excerpts:`, error);
      return [];
    }
  }

  /**
   * Performs the actual document search
   */
  private static async performDocumentSearch(
    query: string,
    courseId: string,
    documentIds: string[]
  ): Promise<Excerpt[]> {
    const axios = (await import("axios")).default;
    const startTimestamp = Date.now();
    
    // Query Python backend (ChromaDB)
    // Lower similarity threshold to 0.15 to capture more relevant results
    // Pass document IDs as filter to only search within specified documents
    const response = await axios.post("http://localhost:8000/query", {
      query,
      top_k: 10,
      mode: "files",
      similarity_threshold: 0.15,
      document_ids: documentIds, // Filter by specific documents
    });
    
    const endTimestamp = Date.now();
    Logger.info(`Retrieved ${response.data.chunks.length} chunks in ${endTimestamp - startTimestamp}ms`);
    Logger.info(`Looking for document IDs: ${documentIds.join(", ")}`);
    
    // Log the first few chunks' metadata to debug
    if (response.data.chunks.length > 0) {
      Logger.info(`First chunk metadata: ${JSON.stringify(response.data.chunks[0].metadata)}`);
      Logger.info(`All chunk doc_ids: ${response.data.chunks.map((c: any) => c.metadata?.doc_id).slice(0, 10).join(", ")}`);
    }
    
    // Convert backend response to Excerpt format
    // Note: Backend already filtered by document_ids, so no need to filter again
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const allChunks = response.data.chunks || [];
    Logger.info(`Total chunks from backend (already filtered): ${allChunks.length}`);
    
    // Log first chunk for debugging
    if (allChunks.length > 0) {
      Logger.info(`First chunk doc_id: ${allChunks[0].metadata?.doc_id}`);
      Logger.info(`First chunk has text: ${allChunks[0].text ? 'YES' : 'NO'}`);
      Logger.info(`First chunk text length: ${allChunks[0].text?.length || 0}`);
    }
    
    const excerpts: Excerpt[] = allChunks.map((chunk: any) => ({
      text: chunk.text,
      documentTitle: chunk.metadata?.documentTitle || chunk.metadata?.filename || "Unknown Document",
      documentId: chunk.metadata?.doc_id || "unknown",
      courseId: chunk.metadata?.courseId || courseId,
      chatId: chunk.metadata?.chatId || "",
      embeddings: [],
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
    
    Logger.info(`Converted ${excerpts.length} chunks to excerpts`);
    
    if (excerpts.length === 0) {
      Logger.warn(`No excerpts returned from backend for document IDs: [${documentIds.join(", ")}]`);
    }
    
    return excerpts;
  }

  /**
   * Safe wrapper for searchExcerpts with timeout and error handling
   */
  private static async safeSearchExcerpts(
    query: string,
    courseId: string,
    chatId: string
  ): Promise<Excerpt[]> {
    try {
      Logger.info(`Searching excerpts for query: ${query.substring(0, 50)}...`);
      
      // Add timeout to excerpt search
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Document search timed out"));
        }, 10000); // 10 second timeout for document search
      });
      
      const searchPromise = searchExcerpts(query, courseId, chatId);
      const excerpts = await Promise.race([searchPromise, timeoutPromise]);
      
      Logger.info(`Found ${excerpts.length} excerpts`);
      return excerpts;
    } catch (error) {
      Logger.warn(`Document search failed, continuing without excerpts:`, error);
      return []; // Return empty array if search fails
    }
  }

  /**
   * Sanitizes text for use in prompts
   */
  private static sanitize(text: string): string {
    return text.replace(/{/g, "{{").replace(/}/g, "}}");
  }
}
