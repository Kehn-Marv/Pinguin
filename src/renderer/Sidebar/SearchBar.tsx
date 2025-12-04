import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  TextField,
  InputAdornment,
  Paper,
  List,
  ListItemButton,
  Typography,
  CircularProgress,
  Chip,
  useTheme,
} from "@mui/material";
import { Search as SearchIcon, Close as CloseIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { SearchResult } from "../preload/search";

interface SearchBarProps {
  courseId: string;
  onResultSelect?: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ courseId, onResultSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const theme = useTheme();

  // Debounced search
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await window.api.search.searchChats(query, courseId);
        setSearchResults(results);
        setShowResults(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [courseId]
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 150);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!showResults || searchResults.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          handleResultClick(searchResults[selectedIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        setShowResults(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(`/chat/${courseId}/${result.chatId}`);
    setShowResults(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIndex(-1);
    if (onResultSelect) {
      onResultSelect();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
  };

  const getMatchTypeLabel = (matchType: SearchResult["matchType"]) => {
    switch (matchType) {
      case "exact-title":
        return "Exact match";
      case "partial-title":
        return "Title match";
      case "content":
        return "Content match";
      default:
        return "";
    }
  };

  const getMatchTypeColor = (matchType: SearchResult["matchType"]): "primary" | "secondary" | "default" => {
    switch (matchType) {
      case "exact-title":
        return "primary";
      case "partial-title":
        return "secondary";
      case "content":
        return "default";
      default:
        return "default";
    }
  };

  // Simple highlighting function
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    // Use yellow for light mode, orange for dark mode
    const isDarkMode = theme.palette.mode === "dark";

    return (
      <>
        {before}
        <Box
          component="span"
          sx={{
            backgroundColor: isDarkMode ? "warning.main" : "#ffeb3b",
            color: isDarkMode ? "warning.contrastText" : "#000000",
            fontWeight: "bold",
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
          }}
        >
          {match}
        </Box>
        {after}
      </>
    );
  };

  return (
    <Box ref={searchBoxRef} sx={{ position: "relative", mb: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search chats"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (searchQuery.trim() && searchResults.length > 0) {
            setShowResults(true);
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              {isSearching ? <CircularProgress size={20} /> : <SearchIcon fontSize="small" />}
            </InputAdornment>
          ),
          endAdornment: searchQuery && (
            <InputAdornment position="end">
              <Box
                component="button"
                onClick={handleClearSearch}
                sx={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 0,
                  color: "text.secondary",
                  "&:hover": { color: "text.primary" },
                }}
              >
                <CloseIcon fontSize="small" />
              </Box>
            </InputAdornment>
          ),
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 2,
            transition: "all 0.2s ease",
            "&:hover": { backgroundColor: "action.hover" },
            "&.Mui-focused": { backgroundColor: "background.paper" },
          },
        }}
      />

      {/* Search Results */}
      {showResults && searchResults.length > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 1300,
            maxHeight: "400px",
            overflowY: "auto",
            borderRadius: 2,
          }}
        >
          <List disablePadding>
            {searchResults.map((result, index) => (
              <ListItemButton
                key={result.chatId}
                selected={index === selectedIndex}
                onClick={() => handleResultClick(result)}
                sx={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  py: 1.5,
                  px: 2,
                  borderBottom: index < searchResults.length - 1 ? 1 : 0,
                  borderColor: "divider",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                    {result.matchType === "exact-title" || result.matchType === "partial-title"
                      ? highlightText(result.chatTitle, searchQuery)
                      : result.chatTitle}
                  </Typography>
                  <Chip
                    label={getMatchTypeLabel(result.matchType)}
                    size="small"
                    color={getMatchTypeColor(result.matchType)}
                    sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }}
                  />
                </Box>

                {result.matchedContent && (
                  <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.75 }}>
                    {highlightText(result.matchedContent, searchQuery)}
                  </Typography>
                )}
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {/* No Results */}
      {showResults && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
        <Paper elevation={8} sx={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 1300, borderRadius: 2, p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            No chats found for "{searchQuery}"
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default SearchBar;
