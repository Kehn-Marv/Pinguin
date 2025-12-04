import { useTheme } from "@mui/material";

const useScrollbarStyle = () => {
  const theme = useTheme();

  // Use different colors for dark and light mode
  const isDarkMode = theme.palette.mode === "dark";
  const thumbColor = isDarkMode 
    ? "#9E9E9E"  // Light gray in dark mode - clearly visible
    : "rgba(0, 0, 0, 0.3)";        // Darker in light mode
  
  const thumbHoverColor = isDarkMode
    ? "#BDBDBD"  // Even lighter gray on hover in dark mode
    : "rgba(0, 0, 0, 0.5)";        // More visible on hover in light mode

  const scrollbarStyle = {
    "&::-webkit-scrollbar": {
      width: "6px !important",  // Thinner scrollbar (was 10)
      height: "6px !important", // Also apply to horizontal scrollbar
    },
    "&::-webkit-scrollbar-track": {
      backgroundColor: "transparent !important",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: `${thumbColor} !important`,
      borderRadius: "3px !important",
      "&:hover": {
        backgroundColor: `${thumbHoverColor} !important`,
      },
    },
  };

  return scrollbarStyle;
};

export default useScrollbarStyle;