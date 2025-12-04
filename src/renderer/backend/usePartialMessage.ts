import { useEffect, useState, useRef } from "react";
import type { IpcRendererEvent } from "electron";

type PropsType = {
  courseId: string;
  chatId: string;
};

const usePartialMessage = ({ courseId, chatId }: PropsType) => {
  const [partialMessage, setPartialMessage] = useState<string>("");
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMessageRef = useRef<string>("");

  useEffect(() => {
    // Don't reset immediately - first check if there's an existing partial message
    let isMounted = true;

    // Get current partial message from backend when switching to this chat
    window.api.message.getPartialMessage(courseId, chatId).then((existingPartialMessage) => {
      if (isMounted) {
        console.log(`[usePartialMessage] Restored partial message for chat ${chatId}:`, existingPartialMessage ? `${existingPartialMessage.length} characters` : 'none');
        setPartialMessage(existingPartialMessage || "");
        pendingMessageRef.current = existingPartialMessage || "";
      }
    });

    const listener = (_event: IpcRendererEvent, message: string) => {
      if (!isMounted) return;
      
      // Store the latest message
      pendingMessageRef.current = message;
      
      // Clear existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // If message is empty, clear immediately (streaming finished)
      if (message === "") {
        setPartialMessage("");
        pendingMessageRef.current = "";
        return;
      }
      
      // Batch updates: only update state every 50ms to reduce re-renders
      // This significantly improves performance during streaming
      updateTimeoutRef.current = setTimeout(() => {
        if (isMounted && pendingMessageRef.current) {
          setPartialMessage(pendingMessageRef.current);
        }
      }, 50);
    };

    window.api.message.subscribeToPartialMessage(courseId, chatId, listener);

    return () => {
      isMounted = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      // Don't reset partial message here - let the backend manage it
      // This allows the message to persist when switching between chats
      window.api.message.unsubscribeFromPartialMessage(courseId, chatId);
    };
  }, [courseId, chatId]);

  return partialMessage;
};

export default usePartialMessage;
