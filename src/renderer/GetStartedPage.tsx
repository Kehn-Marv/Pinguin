import { Typography, Box } from "@mui/material";
import React from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../assets/logo.svg";
import NewSubmitButton from "./Chat/NewSubmitButton";

const GetStartedPage = () => {

  return (
    <Box 
      display={"flex"} 
      flexDirection={"column"} 
      alignItems={"center"}
      justifyContent={"space-between"}
      height={"100%"}
      width={"100%"}
    >
      <Box flex={1} display={"flex"} flexDirection={"column"} alignItems={"center"} justifyContent={"center"}>
        <Box textAlign={"center"}>
          <img src={Logo} alt="App Logo" width={150} />
          <Typography variant="h4" marginTop={3}>
            Pinguin
          </Typography>
          <Typography variant="subtitle1"> built by Kehn Marv</Typography>
        </Box>
        <Box marginTop={6} textAlign={"center"}>
          <Typography variant="h5" fontWeight={400}>
            What's on your mind today?
          </Typography>
        </Box>
      </Box>
      
      {/* Input area */}
      <Box
        sx={{
          width: "100%",
          maxWidth: "800px",
          display: "flex",
          justifyContent: "center",
          flexDirection: "column",
          px: 3,
          pb: 3,
        }}
      >
        <NewSubmitButton />
      </Box>
    </Box>
  );
};

export default GetStartedPage;
