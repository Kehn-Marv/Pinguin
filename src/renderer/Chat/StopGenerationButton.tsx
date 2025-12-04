import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Stop as StopIcon } from "@mui/icons-material";

interface StopGenerationButtonProps {
  onStop: () => void;
  message?: string;
  mode?: "thinking" | "coding" | null;
}

const StopGenerationButton: React.FC<StopGenerationButtonProps> = ({ 
  onStop, 
  message,
  mode
}) => {
  // Get mode-specific message if not provided
  const displayMessage = message || (() => {
    switch (mode) {
      case "thinking":
        return "Thinking...";
      case "coding":
        return "Coding...";
      default:
        return "Preparing response...";
    }
  })();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 3,
        mb: 2,
      }}
    >
      {/* Animated dots */}
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "text.secondary",
              opacity: 0.6,
              animation: "pulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
              "@keyframes pulse": {
                "0%, 80%, 100%": {
                  opacity: 0.3,
                  transform: "scale(0.8)",
                },
                "40%": {
                  opacity: 0.8,
                  transform: "scale(1)",
                },
              },
            }}
          />
        ))}
      </Box>

      {/* Message text */}
      <Box 
        sx={{ 
          fontSize: "0.875rem", 
          color: "text.secondary",
          fontWeight: 400,
        }}
      >
        {displayMessage}
      </Box>

      {/* Stop button - ChatGPT style */}
      <Tooltip title="Stop" placement="top">
        <IconButton
          onClick={onStop}
          size="small"
          sx={{
            ml: 1,
            width: 32,
            height: 32,
            border: 1,
            borderColor: "divider",
            borderRadius: "8px",
            backgroundColor: "background.paper",
            transition: "all 0.2s ease",
            "&:hover": {
              borderColor: "error.main",
              backgroundColor: "error.main",
              transform: "scale(1.05)",
              "& .MuiSvgIcon-root": {
                color: "white",
              },
            },
          }}
        >
          <StopIcon 
            sx={{ 
              fontSize: 14,
              color: "text.secondary",
              transition: "color 0.2s ease",
            }} 
          />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default StopGenerationButton;
