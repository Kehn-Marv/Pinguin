import MessageDB from "./messageDB";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ChatOllama } from "@langchain/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import loadingMessage from "./loadingMessages";
import { notifyPartialMessage } from "./messageNotifier";
import { getLLM } from "../model";
import { getOllamaHost } from "../ollama";
import Logger from "electron-log";

const sendDirectMessage = async (
  courseId: string,
  chatId: string,
  message: string,
  mode?: "thinking" | "coding"
) => {
  try {
    Logger.info(`Sending direct message in chat ${chatId}, mode: ${mode || "normal"}`);
    
    const messageDB = MessageDB.getInstance(courseId, chatId);
    messageDB.addMessage(message, "human");
    loadingMessage.addLoadingMessageChat(courseId, chatId);

    // Get conversation history (last 8 message pairs)
    const chatHistory = messageDB
      .getMessages()
      .map((message) =>
        message.sender === "human"
          ? new HumanMessage(sanitize(message.content))
          : new AIMessage(sanitize(message.content))
      )
      .slice(-8);

    // Get LLM model
    const model = await getLLM();
    if (!model) {
      const errorMsg = "No LLM model configured. Please select a model in settings.";
      Logger.error(`Direct message failed: ${errorMsg}`);
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      throw new Error(errorMsg);
    }

    let llm: ChatOllama;
    try {
      llm = new ChatOllama({
        model,
        baseUrl: getOllamaHost(),
        temperature: 0.2,
      });
    } catch (error) {
      const errorMsg = "Failed to initialize LLM. Please check your Ollama configuration.";
      Logger.error(`Direct message failed: ${errorMsg}`, error);
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      throw new Error(errorMsg);
    }

    // Generate response without RAG
    let stream;
    try {
      stream = await respondToDirectMessage(
        sanitize(message),
        chatHistory,
        llm,
        mode
      );
    } catch (error) {
      const errorMsg = "Failed to generate response. Please try again.";
      Logger.error(`Direct message response generation failed:`, error);
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      throw new Error(errorMsg);
    }

    let answer = "";
    try {
      for await (const chunk of stream) {
        answer += chunk;
        notifyPartialMessage(courseId, chatId, answer);
      }
      
      notifyPartialMessage(courseId, chatId, "");
      
      // Store message with empty citations array
      messageDB.addMessage(answer, "bot", []);
      
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      Logger.info(`Direct message sent successfully in chat ${chatId}`);
    } catch (error) {
      const errorMsg = "Failed to stream response. The connection may have been interrupted.";
      Logger.error(`Direct message streaming failed:`, error);
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      // Clear any partial message
      notifyPartialMessage(courseId, chatId, "");
      throw new Error(errorMsg);
    }
  } catch (error) {
    // Ensure loading indicator is removed in all error cases
    loadingMessage.removeLoadingMessageChat(courseId, chatId);
    
    // Log the full error for debugging
    Logger.error(`Error sending direct message in chat ${chatId}:`, error);
    
    // Re-throw with user-friendly message if not already formatted
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Failed to send message. Please try again.");
    }
  }
};

const respondToDirectMessage = async (
  question: string,
  chatHistory: (HumanMessage | AIMessage)[],
  llm: ChatOllama,
  mode?: "thinking" | "coding"
) => {
  // Select system prompt based on mode
  let selectedPrompt = directChatSystemPrompt;
  if (mode === "thinking") {
    selectedPrompt = directChatThinkingPrompt;
  } else if (mode === "coding") {
    selectedPrompt = directChatCodingPrompt;
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", selectedPrompt],
    new MessagesPlaceholder("chatHistory"),
    ["human", question],
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = prompt.pipe(llm as any).pipe(new StringOutputParser() as any);

  return chain.stream({
    question: sanitize(question),
    chatHistory,
  });
};

const directChatSystemPrompt = `You're Pinguin, a powerful, state-of-the-art offline AI built to help university students study faster, think deeper, and learn privately. You are having a general conversation with a student. Provide helpful, accurate, and concise responses based on your knowledge. If you don't know something, say so honestly.`;

const directChatThinkingPrompt = `You're Pinguin, a powerful, state-of-the-art offline AI built to help university students study faster, think deeper, and learn privately. You are having a general conversation with a student.

THINKING MODE: Before providing your answer, show your reasoning process step-by-step. Break down complex problems, consider different angles, and explain your thought process. Then provide your final answer. Structure your response as:

**Reasoning:**
[Your step-by-step thinking process]

**Answer:**
[Your concise final answer]

If you don't know something, say so honestly.`;

const directChatCodingPrompt = `You're Pinguin, a powerful, state-of-the-art offline AI built to help university students study faster, think deeper, and learn privately. You are having a general conversation with a student.

CODING MODE: You are specialized in helping with programming and coding questions. Provide code examples, explain programming concepts clearly, and format code properly using markdown code blocks. When answering coding questions:
- Use proper syntax highlighting in code blocks
- Explain what the code does
- Point out best practices and potential issues
- Provide working, tested examples when possible

If you don't know something, say so honestly.`;

const sanitize = (text: string) => {
  return text.replace(/{/g, "{{").replace(/}/g, "}}");
};

export default sendDirectMessage;
