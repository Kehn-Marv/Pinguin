import { useEffect, useState } from "react";
import type { IpcRendererEvent } from "electron";

const useIsLoadingMessage = ({
  courseId,
  chatId,
}: {
  courseId: string;
  chatId: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Reset loading state when chat changes
    setIsLoading(false);
    
    let isMounted = true;

    window.api.message.isLoadingMessage(courseId, chatId).then((isLoading) => {
      if (isMounted) {
        console.log(`[useIsLoadingMessage] Restored loading state for chat ${chatId}:`, isLoading);
        setIsLoading(isLoading);
      }
    });

    const loadingListener = (_event: IpcRendererEvent, isLoading: boolean) => {
      if (isMounted) {
        setIsLoading(isLoading);
      }
    };

    window.api.message.subscribeToIsLoadingMessage(
      courseId,
      chatId,
      loadingListener
    );

    return () => {
      isMounted = false;
      setIsLoading(false);
      window.api.message.unsubscribeFromIsLoadingMessage(courseId, chatId);
    };
  }, [courseId, chatId]);

  return isLoading;
};

export default useIsLoadingMessage;
