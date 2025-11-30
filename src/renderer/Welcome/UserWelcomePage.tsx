import React from "react";
import { Box, Typography } from "@mui/material";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../../assets/logo.svg";

const UserWelcomePage = () => {
  return (
    <Box display={"flex"} flexDirection={"column"} alignItems={"center"}>
      <Box marginTop={10} textAlign={"center"}>
        <img src={Logo} alt="App Logo" width={150} />
        <Typography variant="h4" marginTop={3}>
          Welcome to Pinguin
        </Typography>
        <Typography variant="subtitle1"> built by Kehn Marv</Typography>
      </Box>
      <Box marginTop={12} textAlign={"center"}>
        <Typography variant="body1">
          Pinguin is a powerful, state-of-the-art offline AI built to help
          university students study faster, think deeper, and learn privately.
        </Typography>
      </Box>
    </Box>
  );
};

export default UserWelcomePage;
