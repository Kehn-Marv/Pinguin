import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress, Button, useTheme } from "@mui/material";
import { Warning as WarningIcon, Cancel as CancelIcon } from "@mui/icons-material";

interface SlowResponseWarningProps {
  isVisible: boolean;
  onCancel?: () => void;
}

/**
 * Component that displays a warning when LLM response is taking longer than usual
 * Shows after 5 seconds of waiting for first token
 */
const SlowResponseWarning: React.FC<SlowResponseWarningProps> = ({ isVisible, onCancel }) => {
  const theme = useTheme();
  const [secondsWaiting, setSecondsWaiting] = useState(0);

  useEffect(() => {
    if (isVisible) {
      setSecondsWaiting(5); // Start at 5 seconds (when warning appears)
      const interval = setInterval(() => {
        setSecondsWaiting((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setSecondsWaiting(0);
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 2,
        backgroundColor: theme.palette.warning.light,
        border: `1px solid ${theme.palette.warning.main}`,
        mb: 2,
        animation: "fadeIn 0.3s ease-in",
        "@keyframes fadeIn": {
          from: { opacity: 0, transform: "translateY(-10px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      <WarningIcon sx={{ color: theme.palette.warning.dark, fontSize: 28 }} />
      
      <Box sx={{ flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: theme.palette.warning.dark,
            mb: 0.5,
          }}
        >
          Taking longer than usual...
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            display: "block",
          }}
        >
          The AI is still processing your request ({secondsWaiting}s). This might happen with complex queries or if the model is busy.
        </Typography>
      </Box>

      <CircularProgress
        size={24}
        sx={{
          color: theme.palette.warning.dark,
        }}
      />

      {onCancel && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<CancelIcon />}
          onClick={onCancel}
          sx={{
            borderColor: theme.palette.warning.dark,
            color: theme.palette.warning.dark,
            "&:hover": {
              borderColor: theme.palette.warning.dark,
              backgroundColor: theme.palette.warning.main,
            },
          }}
        >
          Cancel
        </Button>
      )}
    </Box>
  );
};

export default SlowResponseWarning;
