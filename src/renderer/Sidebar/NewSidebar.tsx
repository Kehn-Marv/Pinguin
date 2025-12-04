import React, { useState, memo } from "react";
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Collapse,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  KeyboardArrowDown,
  KeyboardArrowUp,
  MoreHoriz,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import useChats from "../backend/useChats";
import useCourses from "../backend/useCourses";
import SearchBar from "./SearchBar";

// Memoized chat list item to prevent unnecessary re-renders
const ChatListItem = memo(({ 
  chat, 
  isSelected, 
  isHovered, 
  onChatClick, 
  onMouseEnter, 
  onMouseLeave, 
  onMenuOpen 
}: {
  chat: { id: string; title: string };
  isSelected: boolean;
  isHovered: boolean;
  onChatClick: (chatId: string) => void;
  onMouseEnter: (chatId: string) => void;
  onMouseLeave: () => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, chatId: string) => void;
}) => {
  return (
    <ListItemButton
      selected={isSelected}
      onClick={() => onChatClick(chat.id)}
      onMouseEnter={() => onMouseEnter(chat.id)}
      onMouseLeave={onMouseLeave}
      sx={{
        borderRadius: 1,
        my: 0.5,
        pl: 2,
        "&:hover": {
          backgroundColor: "action.hover",
        },
        "&.Mui-selected": {
          backgroundColor: "action.selected",
          "&:hover": {
            backgroundColor: "action.selected",
          },
        },
      }}
    >
      <ListItemText
        primary={chat.title}
        primaryTypographyProps={{
          fontSize: "0.875rem",
          noWrap: true,
        }}
      />
      {isHovered && (
        <IconButton
          size="small"
          onClick={(e) => onMenuOpen(e, chat.id)}
          sx={{
            ml: 1,
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <MoreHoriz fontSize="small" />
        </IconButton>
      )}
    </ListItemButton>
  );
}, (prevProps, nextProps) => {
  // Only re-render if relevant props change
  return (
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered
  );
});

ChatListItem.displayName = 'ChatListItem';

type SidebarProps = {
  isOpen: boolean;
  toggleSidebar: () => void;
};

const NewSidebar = ({ isOpen, toggleSidebar }: SidebarProps) => {
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameErrorMsg, setRenameErrorMsg] = useState("");
  
  const navigate = useNavigate();
  const location = useLocation();
  const courses = useCourses();
  
  // For now, we'll use the first course if available
  const currentCourse = courses.length > 0 ? courses[0] : null;
  const chats = useChats(currentCourse?.id || "");

  // Extract current chat ID from URL
  const currentChatId = location.pathname.split("/").pop();

  const handleNewChat = () => {
    // Directly create a new chat without showing dialog
    if (currentCourse) {
      window.api.chat.addChat(currentCourse.id, undefined, "document-based").then((chat) => {
        navigate(`/chat/${currentCourse.id}/${chat.id}`);
      });
    }
  };

  const handleChatClick = (chatId: string) => {
    if (currentCourse) {
      navigate(`/chat/${currentCourse.id}/${chatId}`);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, chatId: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.left,
    });
    setMenuOpen(true);
    setSelectedChatId(chatId);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
    // Don't clear selectedChatId here - we need it for rename/delete
  };

  const openRenameDialog = () => {
    if (!selectedChatId) return;
    
    const chat = chats.find((c) => c.id === selectedChatId);
    if (chat) {
      setRenameValue(chat.title);
      setRenameErrorMsg("");
      setIsRenaming(true);
    }
    handleMenuClose();
  };

  const closeRenameDialog = () => {
    setIsRenaming(false);
    setRenameValue("");
    setRenameErrorMsg("");
    setSelectedChatId(null); // Clear it when dialog closes
  };

  const submitRename = async () => {
    if (!selectedChatId || !currentCourse) {
      return;
    }
    
    const trimmed = renameValue.trim();
    
    // Validation
    if (!trimmed) {
      setRenameErrorMsg("Chat name cannot be empty");
      return;
    }
    
    if (trimmed.length > 50) {
      setRenameErrorMsg("Chat name cannot exceed 50 characters");
      return;
    }
    
    const validPattern = /^[a-zA-Z0-9\s\-_.,!?()]+$/;
    if (!validPattern.test(trimmed)) {
      setRenameErrorMsg("Invalid characters. Use letters, numbers, spaces, and basic punctuation only.");
      return;
    }
    
    try {
      await window.api.chat.renameChat(currentCourse.id, selectedChatId, trimmed);
      closeRenameDialog();
    } catch (error) {
      setRenameErrorMsg(error instanceof Error ? error.message : "Failed to rename");
    }
  };

  const handleDelete = async () => {
    const chatIdToDelete = selectedChatId;
    handleMenuClose();
    
    if (chatIdToDelete && currentCourse) {
      try {
        const isDeletingCurrentChat = chatIdToDelete === currentChatId;
        
        // Delete the chat first
        await window.api.chat.removeChat(currentCourse.id, chatIdToDelete);
        setSelectedChatId(null);
        
        // If we just deleted the currently active chat, navigate away
        if (isDeletingCurrentChat) {
          // Check if there are other chats available
          const remainingChats = chats.filter(chat => chat.id !== chatIdToDelete);
          
          if (remainingChats.length > 0) {
            // Navigate to the first remaining chat
            navigate(`/chat/${currentCourse.id}/${remainingChats[0].id}`, { replace: true });
          } else {
            // No chats left, navigate to main window (will show empty state)
            navigate(`/main_window`, { replace: true });
          }
        }
      } catch (error) {
        console.error("Error deleting chat:", error);
      }
    }
  };

  const handleSettingsClick = () => {
    navigate("/settings");
  };

  // Collapsed sidebar view
  if (!isOpen) {
    return (
      <Box
        sx={{
          width: "60px",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          py: 2,
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <IconButton
            onClick={toggleSidebar}
            sx={{
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <MenuIcon />
          </IconButton>
          <IconButton
            onClick={handleNewChat}
            sx={{
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <EditIcon />
          </IconButton>
          <IconButton
            sx={{
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <SearchIcon />
          </IconButton>
        </Box>
        <IconButton
          onClick={handleSettingsClick}
          sx={{
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <SettingsIcon />
        </IconButton>
      </Box>
    );
  }

  // Expanded sidebar view
  return (
    <>
      <Box
        sx={{
          width: "280px",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          p: 2,
          overflow: "hidden",
        }}
      >
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {/* Toggle button */}
        <Box sx={{ mb: 2, flexShrink: 0 }}>
          <IconButton
            onClick={toggleSidebar}
            sx={{
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <MenuIcon />
          </IconButton>
        </Box>

        {/* New chat button */}
        <Box sx={{ mb: 2, flexShrink: 0 }}>
          <ListItemButton
            onClick={handleNewChat}
            sx={{
              borderRadius: 2,
              border: 1,
              borderColor: "divider",
              py: 1,
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "action.hover",
                borderColor: "text.secondary",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="New chat"
              primaryTypographyProps={{
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            />
          </ListItemButton>
        </Box>

        {/* Search chats */}
        <Box sx={{ flexShrink: 0 }}>
          <SearchBar courseId={currentCourse?.id || ""} />
        </Box>

        {/* Chats section - scrollable */}
        <Box 
          sx={{ 
            flex: 1, 
            overflowY: "auto", 
            minHeight: 0,
            pr: 1,
            "&::-webkit-scrollbar": {
              width: "8px",
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.3)",
              },
            },
          }}
        >
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 1,
              mb: 1,
            }}
          >
            <ListItemButton
              onClick={() => setChatsExpanded(!chatsExpanded)}
              sx={{
                borderRadius: 1,
                py: 0.5,
                minHeight: 0,
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: "action.hover",
                },
              }}
            >
              <ListItemText
                primary="Chats"
                primaryTypographyProps={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "text.primary",
                }}
              />
              {chatsExpanded ? (
                <KeyboardArrowUp fontSize="small" />
              ) : (
                <KeyboardArrowDown fontSize="small" />
              )}
            </ListItemButton>
          </Box>

          <Collapse in={chatsExpanded} timeout="auto" unmountOnExit>
            <List disablePadding>
              {chats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isSelected={currentChatId === chat.id}
                    isHovered={hoveredChatId === chat.id}
                    onChatClick={handleChatClick}
                    onMouseEnter={setHoveredChatId}
                    onMouseLeave={() => setHoveredChatId(null)}
                    onMenuOpen={handleMenuOpen}
                  />
                ))}
            </List>
          </Collapse>
        </Box>
      </Box>

      {/* Settings at bottom - fixed position */}
      <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
        <ListItemButton
          onClick={handleSettingsClick}
          sx={{
            borderRadius: 1,
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Settings" />
        </ListItemButton>
      </Box>
      </Box>

      {/* Context menu for chat actions - using absolute positioning */}
      {menuOpen && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <Box
            onClick={handleMenuClose}
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1200,
            }}
          />
          {/* Menu */}
          <Box
            sx={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              zIndex: 1300,
              backgroundColor: "background.paper",
              borderRadius: 2,
              boxShadow: 3,
              minWidth: 180,
              py: 1,
            }}
          >
            <MenuItem onClick={openRenameDialog} sx={{ px: 2, py: 1 }}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleDelete} sx={{ px: 2, py: 1 }}>
              <ListItemIcon>
                <Box
                  component="span"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: "error.main",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </Box>
              </ListItemIcon>
              <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
            </MenuItem>
          </Box>
        </>
      )}

      {/* Rename dialog */}
      <Dialog
        open={isRenaming}
        onClose={closeRenameDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Rename Chat</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value);
              setRenameErrorMsg("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitRename();
              }
            }}
            error={!!renameErrorMsg}
            helperText={renameErrorMsg || `${renameValue.length}/50 characters`}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRenameDialog}>Cancel</Button>
          <Button 
            onClick={submitRename}
            variant="contained"
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NewSidebar;
