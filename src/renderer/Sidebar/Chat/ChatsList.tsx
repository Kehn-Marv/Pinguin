import React, { useState } from "react";
import useChats from "../../backend/useChats";
import ChatItem from "./ChatItem";
import { Add } from "@mui/icons-material";
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Typography,
  Box,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

type PropsType = {
  course: {
    id: string;
    title: string;
  };
};

const ChatList = ({ course }: PropsType) => {
  const chats = useChats(course.id);
  const navigate = useNavigate();
  
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [selectedChatType, setSelectedChatType] = useState<"direct" | "document-based">("document-based");

  const handleNewChatClick = () => {
    setNewChatDialogOpen(true);
  };

  const handleNewChatConfirm = () => {
    window.api.chat.addChat(course.id, undefined, selectedChatType).then((chat) => {
      navigate(`/chat/${course.id}/${chat.id}`);
    });
    setNewChatDialogOpen(false);
    setSelectedChatType("document-based"); // Reset to default
  };

  const handleNewChatCancel = () => {
    setNewChatDialogOpen(false);
    setSelectedChatType("document-based"); // Reset to default
  };

  return (
    <>
      <List>
        <ListItemButton onClick={handleNewChatClick}>
          <ListItemIcon>
            <Add />
          </ListItemIcon>
          <ListItemText primary={"New Chat"} />
        </ListItemButton>
        {chats.map((chat) => (
          <ChatItem key={chat.id} course={course} chat={chat} />
        ))}
      </List>

      {/* New chat type selection dialog */}
      <Dialog
        open={newChatDialogOpen}
        onClose={handleNewChatCancel}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle>Create New Chat</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose the type of chat you want to create:
          </Typography>
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              value={selectedChatType}
              onChange={(e) => setSelectedChatType(e.target.value as "direct" | "document-based")}
            >
              <FormControlLabel
                value="document-based"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" fontWeight={500}>
                      📚 Document-Based Chat
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ask questions about your uploaded documents with AI-powered retrieval
                    </Typography>
                  </Box>
                }
                sx={{ mb: 2, alignItems: "flex-start" }}
              />
              <FormControlLabel
                value="direct"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" fontWeight={500}>
                      💬 Direct Chat
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Have a general conversation with the AI without document context
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: "flex-start" }}
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleNewChatCancel}>Cancel</Button>
          <Button onClick={handleNewChatConfirm} variant="contained">
            Create Chat
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChatList;
