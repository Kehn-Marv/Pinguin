import { useEffect, useState } from "react";

/**
 * Hook to track slow response status for a chat
 * @param courseId - Course ID
 * @param chatId - Chat ID
 * @returns True if response is taking longer than usual
 */
const useSlowResponse = ({
  courseId,
  chatId,
}: {
  courseId: string;
  chatId: string;
}): boolean => {
  const [isSlowResponse, setIsSlowResponse] = useState(false);

  useEffect(() => {
    const listener = (_event: Electron.IpcRendererEvent, isSlowResponse: boolean) => {
      setIsSlowResponse(isSlowResponse);
    };

    window.api.message.subscribeToSlowResponse(courseId, chatId, listener);

    return () => {
      window.api.message.unsubscribeFromSlowResponse(courseId, chatId);
    };
  }, [courseId, chatId]);

  return isSlowResponse;
};

export default useSlowResponse;
