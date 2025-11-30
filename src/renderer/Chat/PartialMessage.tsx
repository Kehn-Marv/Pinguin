import React, { memo, useState } from "react";
import { Box, useTheme, IconButton } from "@mui/material";
import { ContentCopy, Done } from "@mui/icons-material";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../../assets/logo.svg";

const PartialMessage = memo(({ message }: { message: string }) => {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  // Don't render if message is empty
  if (!message || message.trim() === "") {
    return null;
  }

  return (
    <Box
      sx={{
        marginTop: 3,
        marginBottom: 3,
        display: "flex",
        flexDirection: "row",
        width: "100%",
      }}
    >
      <Box width={"10%"}>
        <img src={Logo} alt="Ollama Logo" width={24} />
      </Box>
      <Box 
        width={"90%"}
        sx={{
          wordWrap: "break-word",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          maxWidth: "100%",
        }}
      >
        <Box
          sx={{
            wordWrap: "break-word",
            overflowWrap: "break-word",
            maxWidth: "100%",
            lineHeight: 1.7,
            fontSize: "15px",
            // Paragraphs
            "& p": {
              margin: "1em 0",
              lineHeight: 1.7,
              wordWrap: "break-word",
              overflowWrap: "break-word",
              "&:first-of-type": {
                marginTop: 0,
              },
              "&:last-of-type": {
                marginBottom: 0,
              },
            },
            // Headings
            "& h1": {
              fontSize: "1.8em",
              fontWeight: 600,
              marginTop: "1.2em",
              marginBottom: "0.6em",
              lineHeight: 1.3,
            },
            "& h2": {
              fontSize: "1.5em",
              fontWeight: 600,
              marginTop: "1.2em",
              marginBottom: "0.6em",
              lineHeight: 1.3,
            },
            "& h3": {
              fontSize: "1.3em",
              fontWeight: 600,
              marginTop: "1em",
              marginBottom: "0.5em",
              lineHeight: 1.3,
            },
            "& h4, & h5, & h6": {
              fontSize: "1.1em",
              fontWeight: 600,
              marginTop: "1em",
              marginBottom: "0.5em",
              lineHeight: 1.3,
            },
            // Lists
            "& ul, & ol": {
              marginTop: "0.8em",
              marginBottom: "0.8em",
              paddingLeft: "2em",
              lineHeight: 1.7,
            },
            "& li": {
              marginTop: "0.4em",
              marginBottom: "0.4em",
            },
            "& li > p": {
              margin: "0.4em 0",
            },
            // Blockquotes
            "& blockquote": {
              borderLeft: "4px solid",
              borderColor: theme.palette.divider,
              paddingLeft: "1em",
              marginLeft: 0,
              marginTop: "1em",
              marginBottom: "1em",
              fontStyle: "italic",
              color: theme.palette.text.secondary,
            },
            // Horizontal rules
            "& hr": {
              border: "none",
              borderTop: "1px solid",
              borderColor: theme.palette.divider,
              marginTop: "1.5em",
              marginBottom: "1.5em",
            },
            // Links
            "& a": {
              color: theme.palette.primary.main,
              textDecoration: "none",
              "&:hover": {
                textDecoration: "underline",
              },
            },
            // Strong/Bold
            "& strong": {
              fontWeight: 600,
            },
            // Emphasis/Italic
            "& em": {
              fontStyle: "italic",
            },
            // Code blocks
            "& pre": {
              maxWidth: "100%",
              overflowX: "auto",
              marginTop: "1em",
              marginBottom: "1em",
            },
            // Tables
            "& table": {
              borderCollapse: "collapse",
              width: "100%",
              marginTop: "1em",
              marginBottom: "1em",
            },
            "& th, & td": {
              border: "1px solid",
              borderColor: theme.palette.divider,
              padding: "8px 12px",
              textAlign: "left",
            },
            "& th": {
              backgroundColor: theme.palette.action.hover,
              fontWeight: 600,
            },
          }}
        >
          <Markdown
            components={{
            code({ inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              const codeString = String(children).replace(/\n$/, "");
              
              return !inline && match ? (
                <Box sx={{ position: "relative", my: 2 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      zIndex: 1,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(codeString);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      sx={{
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.2)",
                        },
                      }}
                    >
                      {copied ? (
                        <Done sx={{ fontSize: 16 }} />
                      ) : (
                        <ContentCopy sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Box>
                  <SyntaxHighlighter
                    style={theme.palette.mode === "dark" ? vscDarkPlus : vs}
                    language={match[1]}
                    PreTag="div"
                    wrapLines={true}
                    wrapLongLines={true}
                    customStyle={{
                      margin: 0,
                      borderRadius: "8px",
                      fontSize: "0.9em",
                      padding: "16px",
                      paddingRight: "50px", // Extra padding on right for copy button
                      maxWidth: "100%",
                      overflowX: "auto",
                    } as any}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </Box>
              ) : (
                <code
                  className={className}
                  style={{
                    backgroundColor: theme.palette.mode === "dark" 
                      ? "rgba(255, 255, 255, 0.1)" 
                      : "rgba(0, 0, 0, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "0.9em",
                    fontFamily: "monospace",
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            },
          }}
        >
            {message}
          </Markdown>
        </Box>
      </Box>
    </Box>
  );
});

PartialMessage.displayName = 'PartialMessage';

export default PartialMessage;
