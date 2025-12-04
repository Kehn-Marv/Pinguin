import React, { useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import NewSidebar from "./Sidebar/NewSidebar";
import { Box } from "@mui/material";
import useScrollbarStyle from "./UI/useScrollbarStyle";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
import useCourses from "./backend/useCourses";

const HomeLayout = () => {
  const scrollBarStyle = useScrollbarStyle();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const courses = useCourses();

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  // Keyboard shortcuts
  const handleNewChat = useCallback(async () => {
    let currentCourse = courses.length > 0 ? courses[0] : null;
    
    if (!currentCourse) {
      currentCourse = await window.api.course.add("Default");
    }
    
    const chat = await window.api.chat.addChat(currentCourse.id, undefined, "document-based");
    navigate(`/chat/${currentCourse.id}/${chat.id}`);
  }, [courses, navigate]);

  const handleQuickDocumentUpload = useCallback(async () => {
    let currentCourse = courses.length > 0 ? courses[0] : null;
    
    if (!currentCourse) {
      currentCourse = await window.api.course.add("Default");
    }
    
    // Use empty string for chatId to indicate course-level import
    window.api.document.import(currentCourse.id, "");
  }, [courses]);

  useKeyboardShortcuts([
    {
      key: "n",
      ctrlOrCmd: true,
      callback: handleNewChat,
    },
    {
      key: "k",
      ctrlOrCmd: true,
      callback: handleQuickDocumentUpload,
    },
  ]);

  return (
    <Box width={"100%"} display={"flex"} flexDirection={"row"} height={"100vh"}>
      <Box
        sx={{
          width: isSidebarOpen ? "280px" : "60px",
          minWidth: isSidebarOpen ? "280px" : "60px",
          borderRight: 1,
          borderColor: "divider",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "width, min-width",
          ...scrollBarStyle,
        }}
      >
        <NewSidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          height: "100vh",
          overflowY: "auto",
          ...scrollBarStyle,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default HomeLayout;
