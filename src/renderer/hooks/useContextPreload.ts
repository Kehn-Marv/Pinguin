import { useEffect } from "react";

/**
 * Hook to preload conversation contexts for a course
 * Implements Requirement 5.5 - Optimize context loading for long conversations
 */
const useContextPreload = (courseId: string | undefined, chatIds: string[]) => {
  useEffect(() => {
    if (!courseId || chatIds.length === 0) {
      return;
    }

    // Preload contexts in the background
    window.api.context.preload(courseId, chatIds).catch((error) => {
      console.error("Failed to preload contexts:", error);
    });
  }, [courseId, chatIds]);
};

export default useContextPreload;
