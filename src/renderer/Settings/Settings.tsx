import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
} from "@mui/material";
import React from "react";
import ChangeTheme from "./ChangeTheme";
import { ArrowForward, AutoAwesome, Calculate, ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Box sx={{ width: "80%", marginTop: 5 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
          <IconButton
            onClick={() => navigate(-1)}
            sx={{
              mr: 2,
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "action.hover",
                transform: "translateX(-2px)",
              },
            }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h4">Settings</Typography>
        </Box>
        <List>
          <ChangeTheme />
          <ListItemButton onClick={() => navigate("/settings/llm")}>
            <ListItemIcon>
              <AutoAwesome />
            </ListItemIcon>
            <ListItemText primary="LLM Selection" />
            <ArrowForward />
          </ListItemButton>
          <ListItemButton onClick={() => navigate("/settings/embeddings")}>
            <ListItemIcon>
              <Calculate />
            </ListItemIcon>
            <ListItemText primary="Embeddings Model Selection" />
            <ArrowForward />
          </ListItemButton>
        </List>
      </Box>
    </Box>
  );
};

export default Settings;
