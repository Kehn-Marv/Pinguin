import { useEffect, useState } from "react";

const useChats = (courseId: string) => {
  const [chats, setChats] = useState<ChatType[]>([]);

  useEffect(() => {
    window.api.chat.getChats(courseId).then((chats) => {
      setChats(chats);
      
      // Preload conversation contexts for all chats (Requirement 5.5)
      if (chats.length > 0) {
        const chatIds = chats.map((chat: ChatType) => chat.id);
        window.api.context.preload(courseId, chatIds).catch((error) => {
          console.error("Failed to preload contexts:", error);
        });
      }
    });

    window.api.chat.subscribeToChats(courseId, (_event, chats) => {
      setChats(chats);
      
      // Preload contexts when chats update
      if (chats.length > 0) {
        const chatIds = chats.map((chat: ChatType) => chat.id);
        window.api.context.preload(courseId, chatIds).catch((error) => {
          console.error("Failed to preload contexts:", error);
        });
      }
    });

    return () => {
      window.api.chat.unsubscribeFromChats(courseId);
    };
  }, [courseId]);

  return chats;
};

export default useChats;
