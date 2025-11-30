import MessageDB from "./messageDB";
import loadingMessage from "./loadingMessages";
import { notifyPartialMessage, notifyLoadingMessage } from "./messageNotifier";
import { getLLM } from "../model";
import { getOllamaHost } from "../ollama";
import MessageCancellationManager from "./messageCancellation";
import Logger from "electron-log";
import { ChatOllama } from "@langchain/ollama";
import { OptimizedMessageHandler } from "./optimizedMessageHandler";
import { getChatDocuments, addDocumentsToChat } from "../chats";
import { getSystemPrompt, type PromptMode } from "./systemPrompts";

const sendMessage = async (
  courseId: string,
  chatId: string,
  message: string,
  mode?: "thinking" | "coding",
  documentIds?: string[]
) => {
  Logger.info(`=== Starting message send for chat ${chatId} ===`);
  Logger.info(`Message: ${message.substring(0, 100)}...`);
  Logger.info(`Mode: ${mode || "default"}`);
  Logger.info(`Document IDs provided: ${documentIds ? documentIds.join(", ") : "none"}`);
  
  const cancellationManager = MessageCancellationManager.getInstance();
  cancellationManager.registerMessage(courseId, chatId);
  
  let answer = ""; // Declare in outer scope so it's accessible in catch block

  try {
    // Clear any previous partial message at the start of a new message
    notifyPartialMessage(courseId, chatId, "");
    
    // If document IDs are provided, add them to the chat for future reference
    if (documentIds && documentIds.length > 0) {
      addDocumentsToChat(courseId, chatId, documentIds);
      Logger.info(`Added ${documentIds.length} documents to chat ${chatId}`);
    }
    
    // Get all documents associated with this chat (includes newly added and previously added)
    const chatDocumentIds = getChatDocuments(courseId, chatId);
    Logger.info(`Chat ${chatId} has ${chatDocumentIds.length} associated documents: ${chatDocumentIds.join(", ")}`);
    
    // Use chat's document IDs for context (this ensures follow-up questions work)
    const effectiveDocumentIds = chatDocumentIds.length > 0 ? chatDocumentIds : undefined;
    
    const messageDB = MessageDB.getInstance(courseId, chatId);
    const allMessages = messageDB.getMessages();
    const isFirstMessage = allMessages.length === 0;
    
    messageDB.addMessage(message, "human", [], effectiveDocumentIds);
    loadingMessage.addLoadingMessageChat(courseId, chatId);
    notifyLoadingMessage(courseId, chatId, true);
    
    // Auto-generate chat title from first message (async, non-blocking)
    if (isFirstMessage) {
      Logger.info(`First message in chat ${chatId}, auto-generating title from: "${message.substring(0, 50)}..."`);
      const ChatsManager = (await import("../chats/chatsManager")).default;
      const chatsManager = ChatsManager.getInistance(courseId);
      // Don't await - let it run in background so it doesn't block message processing
      chatsManager.autoGenerateTitle(chatId, message).catch(err => {
        Logger.error("Failed to auto-generate title:", err);
      });
    }
    
    Logger.info(`Added human message, checking Ollama availability...`);

    // Check if Ollama is available
    const model = await getLLM();
    if (!model) {
      throw new Error("No LLM model configured. Please ensure Ollama is running and a model is selected.");
    }
    
    const ollamaHost = getOllamaHost();
    Logger.info(`Using Ollama host: ${ollamaHost}, model: ${model}`);
    
    // Create ChatOllama instance for RAG
    const llm = new ChatOllama({
      model: model,
      baseUrl: ollamaHost,
      temperature: 0.7,
    });

    // Test Ollama connection
    try {
      Logger.info(`Testing Ollama connection to ${ollamaHost}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const testResponse = await fetch(`${ollamaHost}/api/tags`, { 
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!testResponse.ok) {
        throw new Error(`Ollama connection test failed: ${testResponse.status}`);
      }
      
      const tagsData = await testResponse.json();
      Logger.info("Ollama connection test successful");
      
      // Check if the model exists
      const modelExists = tagsData.models?.some((m: any) => m.name === model);
      if (!modelExists) {
        const availableModels = tagsData.models?.map((m: any) => m.name).join(', ') || 'none';
        throw new Error(`Model "${model}" not found. Available models: ${availableModels}`);
      }
      Logger.info(`Model "${model}" is available`);
      
    } catch (connectionError) {
      Logger.error("Ollama connection test failed:", connectionError);
      if (connectionError instanceof Error && connectionError.name === 'AbortError') {
        throw new Error("Connection to Ollama timed out. Please check if Ollama is running.");
      }
      throw new Error("Cannot connect to Ollama. Please ensure Ollama is running and accessible.");
    }

    // Use RAG if documents are associated with this chat
    let finalPrompt = message;
    
    // Convert mode to PromptMode type
    const promptMode: PromptMode | undefined = mode as PromptMode | undefined;
    
    if (effectiveDocumentIds && effectiveDocumentIds.length > 0) {
      Logger.info(`Using RAG with ${effectiveDocumentIds.length} documents: ${effectiveDocumentIds.join(", ")}`);
      Logger.info(`Mode: ${mode || "default"}`);
      
      try {
        // Use OptimizedMessageHandler to get document context
        const { contextualizedQuestion, excerpts } = await OptimizedMessageHandler.processMessage(
          courseId,
          chatId,
          message,
          llm,
          effectiveDocumentIds
        );
        
        Logger.info(`Retrieved ${excerpts.length} relevant excerpts from documents`);
        if (excerpts.length > 0) {
          Logger.info(`First excerpt preview: ${excerpts[0].text.substring(0, 100)}...`);
        }
        
        // Build context from excerpts
        if (excerpts.length > 0) {
          const context = excerpts
            .map((excerpt, index) => `[Document ${index + 1}: ${excerpt.documentTitle}]\n${excerpt.text}`)
            .join("\n\n");
          
          // Use mode-specific system prompt with context
          finalPrompt = getSystemPrompt(promptMode, true, context, contextualizedQuestion);
          Logger.info(`Using ${mode || "default"} mode prompt with document context`);
        } else {
          Logger.warn("No excerpts found for documents, falling back to direct response");
          // Use mode-specific prompt without context
          finalPrompt = getSystemPrompt(promptMode, false, undefined, undefined, message);
        }
      } catch (ragError) {
        Logger.error("RAG processing failed, falling back to direct response:", ragError);
        // Use mode-specific prompt without context
        finalPrompt = getSystemPrompt(promptMode, false, undefined, undefined, message);
      }
    } else {
      Logger.info(`No documents provided, using direct mode: ${mode || "default"}`);
      // Use mode-specific prompt without context
      finalPrompt = getSystemPrompt(promptMode, false, undefined, undefined, message);
    }
    
    Logger.info(`Starting Ollama API call for chat ${chatId}`);
    
    // Smart context window: limit by tokens/characters instead of message count
    // This prevents slowdowns in long conversations
    const ConfigStore = (await import("../ConfigStore")).default;
    const configStore = ConfigStore.getInstance();
    const MAX_CONTEXT_CHARS = configStore.get("maxContextChars"); // ~1000 tokens (rough estimate: 4 chars = 1 token)
    const MAX_MESSAGES = configStore.get("maxContextMessages"); // Hard limit on message count
    
    const allMessagesForContext = messageDB.getMessages();
    const conversationHistory: typeof allMessagesForContext = [];
    let totalChars = 0;
    
    // Work backwards from most recent messages, stop when we hit limits
    for (let i = allMessagesForContext.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      const msgLength = msg.content.length;
      
      // Stop if we'd exceed character limit or message limit
      if (totalChars + msgLength > MAX_CONTEXT_CHARS || conversationHistory.length >= MAX_MESSAGES) {
        break;
      }
      
      conversationHistory.unshift(msg); // Add to beginning to maintain order
      totalChars += msgLength;
    }
    
    Logger.info(`Including ${conversationHistory.length} previous messages (~${totalChars} chars) for context`);
    
    // Build messages array for Ollama chat API
    const messages = [
      // System message with the prompt
      {
        role: "system",
        content: finalPrompt
      }
    ];
    
    // Add conversation history (excluding the current message which was just added)
    for (let i = 0; i < conversationHistory.length - 1; i++) {
      const msg = conversationHistory[i];
      messages.push({
        role: msg.sender === "human" ? "user" : "assistant",
        content: msg.content
      });
    }
    
    // Add the current user message
    messages.push({
      role: "user",
      content: message
    });
    
    Logger.info(`Sending ${messages.length} messages to Ollama (including system prompt and history)`);
    
    const streamController = new AbortController();
    const streamTimeoutId = setTimeout(() => {
      Logger.warn(`Stream timeout reached for chat ${chatId}, aborting...`);
      streamController.abort();
    }, 600000); // 10 minute timeout (much more reasonable)
    
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true
      }),
      signal: streamController.signal
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API failed: ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    
    Logger.info(`Starting streaming for chat ${chatId}`);
    
    try {
      let streamActive = true;
      while (streamActive) {
        const { done, value } = await reader.read();
        if (done) {
          streamActive = false;
          break;
        }
        
        // Check for cancellation
        if (cancellationManager.isCancellationRequested(courseId, chatId)) {
          Logger.info(`Message generation cancelled during streaming: ${chatId}`);
          reader.releaseLock();
          streamActive = false;
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            // Handle both /api/chat (message.content) and /api/generate (response) formats
            const content = json.message?.content || json.response;
            if (content) {
              answer += content;
              chunkCount++;
              notifyPartialMessage(courseId, chatId, answer);
              
              // Log progress every 100 chunks and show user progress
              if (chunkCount % 100 === 0) {
                Logger.debug(`Streaming progress: ${chunkCount} chunks, ${answer.length} characters`);
              }
              
              // Show progress to user every 500 chunks (roughly every few seconds)
              if (chunkCount % 500 === 0) {
                Logger.info(`Still generating response... ${chunkCount} chunks received (${answer.length} characters)`);
              }
              
              // Safety check for extremely long responses (>50k characters)
              if (answer.length > 50000) {
                Logger.warn(`Response is getting very long (${answer.length} characters), considering stopping...`);
                if (answer.length > 100000) {
                  Logger.warn(`Response exceeded 100k characters, stopping to prevent memory issues`);
                  answer += "\n\n[Response was truncated due to length limit]";
                  break;
                }
              }
            }
            if (json.done) {
              Logger.info(`Streaming completed: ${chunkCount} chunks, ${answer.length} characters`);
              break;
            }
          } catch (parseError) {
            // Skip invalid JSON lines
            Logger.debug(`Skipping invalid JSON line: ${line}`);
          }
        }
      }
    } finally {
      clearTimeout(streamTimeoutId);
      reader.releaseLock();
    }
    
    // Always save the response, even if it was partial due to timeout/cancellation
    if (answer.trim()) {
      Logger.info(`Saving response (${answer.length} characters) for chat ${chatId}`);
      
      // Add final response to database (UI will detect match and hide partial)
      messageDB.addMessage(answer, "bot", []);
      
      // Don't clear partial message immediately - let UI handle the transition
      // The ChatList component will hide partial message when it matches the complete message
      
      // Remove loading state and notify frontend
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      notifyLoadingMessage(courseId, chatId, false);
    } else {
      Logger.warn(`No response content to save for chat ${chatId}`);
      notifyPartialMessage(courseId, chatId, "");
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      notifyLoadingMessage(courseId, chatId, false);
    }
    
    Logger.info(`=== Completed message send for chat ${chatId} ===`);
    Logger.info(`=== Completed message send for chat ${chatId} ===`);
    
  } catch (error) {
    Logger.error(`Error in message send:`, error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isAbortError = error instanceof Error && (error.name === 'AbortError' || errorMessage.includes('aborted'));
    
    // If we have a partial response and it was aborted (timeout), save it
    if (isAbortError && typeof answer !== 'undefined' && answer.trim()) {
      Logger.info(`Operation was aborted but saving partial response (${answer.length} characters)`);
      try {
        const messageDB = MessageDB.getInstance(courseId, chatId);
        messageDB.addMessage(answer + "\n\n[Response was cut off due to timeout]", "bot", []);
        
        // Clear UI states and notify frontend
        notifyPartialMessage(courseId, chatId, "");
        loadingMessage.removeLoadingMessageChat(courseId, chatId);
        notifyLoadingMessage(courseId, chatId, false);
        
        // Don't throw error since we saved the partial response
        Logger.info(`=== Completed message send with partial response for chat ${chatId} ===`);
        return;
      } catch (saveError) {
        Logger.error(`Failed to save partial response:`, saveError);
      }
    }
    
    // Clear UI states and notify frontend
    notifyPartialMessage(courseId, chatId, "");
    loadingMessage.removeLoadingMessageChat(courseId, chatId);
    notifyLoadingMessage(courseId, chatId, false);
    
    // Check if this was a cancellation - if so, don't throw an error
    if (errorMessage.includes("cancelled")) {
      Logger.info(`Message was cancelled by user for chat ${chatId}, returning gracefully`);
      return;
    }
    
    // Provide user-friendly error messages
    let userFriendlyError = errorMessage;
    
    if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect")) {
      userFriendlyError = "Cannot connect to Ollama. Please ensure Ollama is running.";
    } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      userFriendlyError = "Request timed out. The model may be overloaded. Please try again.";
    } else if (isAbortError) {
      userFriendlyError = "The response was taking too long and was stopped. Please try again with a shorter question.";
    }
    
    throw new Error(userFriendlyError);
  } finally {
    cancellationManager.unregisterMessage(courseId, chatId);
  }
};

export default sendMessage;
