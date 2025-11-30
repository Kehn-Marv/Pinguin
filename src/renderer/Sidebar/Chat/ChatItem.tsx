import React, { useEffect, useState } from "react";
import { ListItemButton, ListItemText } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";

type PropsType = {
  course: {
    id: string;
    title: string;
  };
  chat: {
    id: string;
    title: string;
    chatType?: "direct" | "document-based";
  };
};

const ChatItem = ({ course, chat }: PropsType) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    setSelected(location.pathname.includes(`/chat/${course.id}/${chat.id}`));
  }, [location.pathname, chat.id, course.id]);

  // Determine the icon based on chat type (default to document-based for backward compatibility)
  const chatIcon = chat.chatType === "direct" ? "💬" : "📚";

  return (
    <ListItemButton
      key={chat.id}
      onClick={() => navigate(`/chat/${course.id}/${chat.id}`)}
      selected={selected}
    >
      <ListItemText>
        <span style={{ marginRight: '8px' }}>{chatIcon}</span>
        {chat.title}
      </ListItemText>
    </ListItemButton>
  );
};

export default ChatItem;
