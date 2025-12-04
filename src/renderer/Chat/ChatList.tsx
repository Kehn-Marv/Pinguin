import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { Box, Button, CircularProgress } from "@mui/material";
import { useParams } from "react-router-dom";
import Message from "./Message";
import LoadingBotMessage from "./LoadingBotMessage";
import StopGenerationButton from "./StopGenerationButton";
import useMessages from "../backend/useMessages";
import useIsLoadingMessage from "../backend/useIsLoadingMessage";
import usePartialMessage from "../backend/usePartialMessage";
import PartialMessage from "./PartialMessage";

const ChatList = () => {
  const { courseId, chatId } = useParams<{ courseId: string; chatId: string }>();
  const { messages, hasMore, loadMoreMessages, isLoadingMore } = useMessages({ 
    courseId: courseId || "", 
    chatId: chatId || "" 
  });
  const loading = useIsLoadingMessage({ courseId: courseId || "", chatId: chatId || "" });
  const partialMessage = usePartialMessage({ courseId: courseId || "", chatId: chatId || "" });

  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  
  // Get mode from sessionStorage for this specific chat
  const [activeMode, setActiveMode] = React.useState<"thinking" | "coding" | null>(null);
  
  // Read mode from sessionStorage when chat changes or loading starts
  useEffect(() => {
    if (chatId && (loading || partialMessage)) {
      const storedMode = sessionStorage.getItem(`chatMode_${chatId}`);
      if (storedMode === 'thinking' || storedMode === 'coding') {
        setActiveMode(storedMode);
        console.log("[ChatList] Loaded mode for chat:", chatId, "mode:", storedMode);
      }
    }
  }, [chatId, loading, partialMessage]);
  
  // Clear mode when generation is completely done
  useEffect(() => {
    if (chatId && !loading && !partialMessage && activeMode) {
      console.log("[ChatList] Clearing mode for chat:", chatId);
      sessionStorage.removeItem(`chatMode_${chatId}`);
      setActiveMode(null);
    }
  }, [chatId, loading, partialMessage, activeMode]);

  // Check if user is near the bottom of the scroll
  const isNearBottom = useCallback(() => {
    const container = listRef.current?.parentElement;
    if (!container) return true;
    
    const threshold = 150; // pixels from bottom
    const position = container.scrollTop + container.clientHeight;
    const height = container.scrollHeight;
    
    return position >= height - threshold;
  }, []);

  // Track user scroll behavior
  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) return;

    const handleUserScroll = () => {
      isUserScrolledUpRef.current = !isNearBottom();
    };

    container.addEventListener('scroll', handleUserScroll);
    return () => container.removeEventListener('scroll', handleUserScroll);
  }, [isNearBottom]);

  // Auto-scroll to bottom ONLY if user hasn't scrolled up
  useEffect(() => {
    // Only auto-scroll if user is near the bottom (hasn't scrolled up)
    if (!isUserScrolledUpRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [messages.length, loading, partialMessage]);

  // Handle scroll to detect when user scrolls to top for lazy loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    // Check if user scrolled near the top (within 100px)
    if (container.scrollTop < 100) {
      loadMoreMessages();
    }
  }, [hasMore, loadMoreMessages, isLoadingMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleStopGeneration = useCallback(async () => {
    if (courseId && chatId) {
      console.log("Stopping message generation for chat:", chatId);
      await window.api.message.cancelMessage(courseId, chatId);
    }
  }, [courseId, chatId]);

  // Check if the last message matches the partial message (streaming just completed)
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isStreamingComplete = lastMessage && 
                               lastMessage.sender === "bot" && 
                               partialMessage && 
                               lastMessage.content === partialMessage;

  // Track which documents have been shown to avoid repeating file attachments
  const shownDocumentIds = useMemo(() => {
    const shown = new Set<string>();
    return messages.map((message) => {
      const newDocsInThisMessage: string[] = [];
      if (message.documentIds) {
        message.documentIds.forEach((docId) => {
          if (!shown.has(docId)) {
            shown.add(docId);
            newDocsInThisMessage.push(docId);
          }
        });
      }
      return newDocsInThisMessage.length > 0;
    });
  }, [messages]);

  // Memoize the message list to prevent unnecessary re-renders
  // Messages are already optimized with React.memo
  const messageList = useMemo(() => {
    return messages.map((message, index) => (
      <Message 
        key={`${chatId}-${index}`} 
        message={message}
        isFirstMentionOfDocuments={shownDocumentIds[index]}
      />
    ));
  }, [messages, chatId, shownDocumentIds]);

  return (
    <Box 
      width={"100%"} 
      maxWidth={"800px"} 
      ref={listRef}
      sx={{ px: 3, py: 2 }}
    >
      {/* Load more button at the top */}
      {hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none' }}
          >
            {isLoadingMore ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Loading...
              </>
            ) : (
              'Load older messages'
            )}
          </Button>
        </Box>
      )}
      
      {/* Memoized message list - each Message component is also memoized */}
      {messageList}
      
      {/* Show partial message ONLY if streaming is not complete */}
      {partialMessage && !isStreamingComplete && (
        <>
          <PartialMessage message={partialMessage} />
          <StopGenerationButton onStop={handleStopGeneration} mode={activeMode} />
        </>
      )}
      
      {/* Show loading indicator only when no partial message yet */}
      {loading && !partialMessage && (
        <>
          <LoadingBotMessage />
          <StopGenerationButton 
            onStop={handleStopGeneration}
            mode={activeMode}
          />
        </>
      )}
    </Box>
  );
};

export default ChatList;
