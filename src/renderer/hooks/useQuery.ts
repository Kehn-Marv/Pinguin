import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./useElectron";

interface SourceReference {
  documentTitle: string;
  text: string;
}

interface UseQueryResult {
  response: string;
  isLoading: boolean;
  error: string | null;
  sources: SourceReference[];
  submitQuery: (courseId: string, chatId: string, message: string, mode?: "thinking" | "coding") => Promise<void>;
}

export const useQuery = (courseId: string, chatId: string): UseQueryResult => {
  const api = useElectron();
  const [response, setResponse] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceReference[]>([]);

  useEffect(() => {
    // Subscribe to partial message (streaming tokens)
    api.message.subscribeToPartialMessage(courseId, chatId, (_, partialMessage: string) => {
      setResponse(partialMessage);
    });

    // Subscribe to complete message
    api.message.subscribeToCompleteMessage(courseId, chatId, (_, message: Message) => {
      setIsLoading(false);
      setSources(message.citations.map(c => ({
        documentTitle: c.documentTitle,
        text: c.text,
      })));
    });

    // Subscribe to loading state
    api.message.subscribeToIsLoadingMessage(courseId, chatId, (_, loading: boolean) => {
      setIsLoading(loading);
    });

    return () => {
      api.message.unsubscribeFromPartialMessage(courseId, chatId);
      api.message.unsubscribeFromCompleteMessage(courseId, chatId);
      api.message.unsubscribeFromIsLoadingMessage(courseId, chatId);
    };
  }, [api, courseId, chatId]);

  const submitQuery = useCallback(async (courseId: string, chatId: string, message: string, mode?: "thinking" | "coding") => {
    setResponse("");
    setError(null);
    setSources([]);
    setIsLoading(true);

    try {
      await api.message.sendMessage(courseId, chatId, message, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send query");
      setIsLoading(false);
    }
  }, [api]);

  return {
    response,
    isLoading,
    error,
    sources,
    submitQuery,
  };
};
