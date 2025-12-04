import React from "react";
import { Box, Typography } from "@mui/material";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../../assets/logo.svg";

const EmptyState = () => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        px: 3,
      }}
    >
      <Box textAlign={"center"}>
        <img src={Logo} alt="App Logo" width={150} />
        <Typography variant="h4" marginTop={3}>
          Pinguin
        </Typography>
        <Typography variant="subtitle1">built by Kehn Marv</Typography>
      </Box>
      <Box marginTop={6} textAlign={"center"}>
        <Typography variant="h5" fontWeight={400}>
          What's on your mind today?
        </Typography>
      </Box>
    </Box>
  );
};

export default EmptyState;
