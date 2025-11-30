import React from "react";
import { useLLMs } from "../../backend/model";
import { Box, Typography, IconButton } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import ModelCard from "./ModelCard";
import requiresOllama from "../../Requirers/RequiresOllama";

const LLMSelection = () => {
  const llms = useLLMs();
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          width: "80%",
          display: "flex",
          flexDirection: "column",
          marginTop: 5,
        }}
      >
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
          <Typography variant="h4">
            LLM Selection
          </Typography>
        </Box>
        <Box>
          {llms.map((llm) => (
            <ModelCard key={llm.id} model={llm} type="llm" />
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default requiresOllama(LLMSelection);
