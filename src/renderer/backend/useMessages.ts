import { useEffect, useState, useCallback, useRef } from "react";
import type { IpcRendererEvent } from "electron";

const INITIAL_LOAD_LIMIT = 50;
const POLL_INTERVAL = 1000; // Poll every second when loading

const useMessage = ({
  courseId,
  chatId,
}: {
  courseId: string;
  chatId: string;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Reset messages when chat changes to prevent showing old messages
    setMessages([]);
    setTotalCount(0);
    setHasMore(false);
    setIsLoading(false);
    
    let isMounted = true;

    const completeMessageListener = (
      _event: IpcRendererEvent,
      message: Message
    ) => {
      if (isMounted) {
        console.log("[useMessages] Received complete message event for chat:", chatId, message);
        // Immediately update state - use functional update to ensure we have latest state
        setMessages((prevMessages) => {
          console.log("[useMessages] Current messages count:", prevMessages.length);
          
          // Check for duplicates - but be less strict
          // Only check the last few messages to avoid false positives
          const recentMessages = prevMessages.slice(-5);
          const exists = recentMessages.some(m => {
            // Only check for exact content and sender match
            return m.content === message.content && m.sender === message.sender;
          });
          
          if (exists) {
            console.log("[useMessages] Duplicate message detected, skipping");
            return prevMessages;
          }
          
          console.log("[useMessages] Adding new message to UI, new count will be:", prevMessages.length + 1);
          // Return new array to trigger re-render
          return [...prevMessages, message];
        });
        
        setTotalCount((prevCount) => prevCount + 1);
        setIsLoading(false); // Message complete, stop loading
      } else {
        console.warn("[useMessages] Received message but component unmounted, ignoring");
      }
    };

    const loadingListener = (
      _event: IpcRendererEvent,
      loading: boolean
    ) => {
      if (isMounted) {
        console.log(`[useMessages] Loading state changed for chat ${chatId}: ${loading}`);
        setIsLoading(loading);
      }
    };

    // Subscribe to events FIRST before loading messages
    // This ensures we don't miss any messages that arrive during loading
    console.log(`[useMessages] Subscribing to complete messages for chat ${chatId}`);
    window.api.message.subscribeToCompleteMessage(
      courseId,
      chatId,
      completeMessageListener
    );
    
    // Subscribe to loading state changes
    window.api.message.subscribeToIsLoadingMessage(
      courseId,
      chatId,
      loadingListener
    );

    console.log(`[useMessages] Subscriptions ready for chat ${chatId}`);

    // Load initial messages (first 50)
    // Force a fresh load by passing explicit limit to bypass cache
    Promise.all([
      window.api.message.getMessages(courseId, chatId, INITIAL_LOAD_LIMIT, 0),
      window.api.message.getMessageCount(courseId, chatId),
      window.api.message.isLoadingMessage(courseId, chatId)
    ]).then(([initialMessages, count, loading]) => {
      if (isMounted) {
        console.log(`[useMessages] Loaded ${initialMessages.length} messages for chat ${chatId}, count: ${count}, loading: ${loading}`);
        setMessages(initialMessages);
        setTotalCount(count);
        setHasMore(initialMessages.length < count);
        setIsLoading(loading);
        
        // If we're loading but have no messages, something might be wrong
        // Force a refresh after a short delay to catch any missed messages
        if (loading && initialMessages.length === 0) {
          console.log(`[useMessages] Loading state detected with no messages, will check again soon`);
          setTimeout(() => {
            if (isMounted) {
              console.log(`[useMessages] Checking for missed messages...`);
              window.api.message.getMessages(courseId, chatId, INITIAL_LOAD_LIMIT, 0).then(msgs => {
                if (isMounted && msgs.length > 0) {
                  console.log(`[useMessages] Found ${msgs.length} messages that were missed, updating`);
                  setMessages(msgs);
                  setTotalCount(msgs.length);
                }
              });
            }
          }, 500);
        }
      }
    }).catch(error => {
      console.error(`[useMessages] Error loading messages for chat ${chatId}:`, error);
    });

    return () => {
      isMounted = false;
      console.log(`[useMessages] Unsubscribing from complete messages for chat ${chatId}`);
      window.api.message.unsubscribeFromCompleteMessage(courseId, chatId);
      window.api.message.unsubscribeFromIsLoadingMessage(courseId, chatId);
    };
  }, [courseId, chatId]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const offset = messages.length;
      const moreMessages = await window.api.message.getMessages(
        courseId,
        chatId,
        INITIAL_LOAD_LIMIT,
        offset
      );
      
      // Prepend older messages to the beginning of the array
      setMessages((prevMessages) => [...moreMessages, ...prevMessages]);
      setHasMore(messages.length + moreMessages.length < totalCount);
    } finally {
      setIsLoadingMore(false);
    }
  }, [courseId, chatId, messages.length, totalCount, hasMore, isLoadingMore]);

  const refreshMessages = useCallback(async () => {
    console.log(`[useMessages] Manual refresh requested for chat ${chatId}`);
    const [freshMessages, count] = await Promise.all([
      window.api.message.getMessages(courseId, chatId, INITIAL_LOAD_LIMIT, 0),
      window.api.message.getMessageCount(courseId, chatId)
    ]);
    console.log(`[useMessages] Refreshed ${freshMessages.length} messages for chat ${chatId}`);
    setMessages(freshMessages);
    setTotalCount(count);
    setHasMore(freshMessages.length < count);
  }, [courseId, chatId]);

  // Poll for new messages ONLY when a message is actively being loaded
  // This ensures we catch messages even if the notification is missed
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Only start polling if something is actually loading
    if (!isLoading) {
      console.log(`[useMessages] Not loading, skipping poll setup for chat ${chatId}`);
      return;
    }

    console.log(`[useMessages] Starting poll for chat ${chatId} (loading in progress)`);

    const checkForNewMessages = async () => {
      try {
        // Double-check loading state (in case event was missed)
        const stillLoading = await window.api.message.isLoadingMessage(courseId, chatId);
        
        if (!stillLoading) {
          console.log(`[useMessages] Loading completed, stopping poll for chat ${chatId}`);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }

        // While loading, check if there are new messages (like the user's message)
        const currentCount = await window.api.message.getMessageCount(courseId, chatId);
        if (currentCount > totalCount) {
          console.log(`[useMessages] Detected new messages during loading (${currentCount} vs ${totalCount}), refreshing...`);
          await refreshMessages();
        }
      } catch (error) {
        console.error("[useMessages] Error checking for new messages:", error);
      }
    };

    // Start polling only when loading
    pollIntervalRef.current = setInterval(checkForNewMessages, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        console.log(`[useMessages] Cleaning up poll for chat ${chatId}`);
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [courseId, chatId, isLoading, totalCount, refreshMessages]);

  return { messages, hasMore, loadMoreMessages, isLoadingMore, refreshMessages, isLoading };
};

export default useMessage;
