import React, { createContext, useEffect, useState } from "react";
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
} from "@mui/material/styles";
import { CssBaseline, Backdrop, CircularProgress } from "@mui/material";
import getTheme from "./backend/config/getTheme";
import setTheme from "./backend/config/setTheme";

export const ThemeContext = createContext({
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  toggleTheme: () => {},
  isDark: true,
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  setLoading: (_loading: boolean) => {},
  isLoading: false,
});

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#95d2f0",
    },
    secondary: {
      main: "#169af9",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        *::-webkit-scrollbar-track {
          background-color: transparent;
        }
        *::-webkit-scrollbar-thumb {
          background-color: #B0B0B0;
          border-radius: 3px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background-color: #D0D0D0;
        }
      `,
    },
  },
});

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#95d2f0",
    },
    secondary: {
      main: "#169af9",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        *::-webkit-scrollbar-track {
          background-color: transparent;
        }
        *::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 3px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.5);
        }
      `,
    },
  },
});

const ThemeProvider = ({ children }: { children: React.JSX.Element }) => {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Load theme preference
    getTheme().then((theme) => {
      // Current API only supports "light" | "dark", not "system"
      setIsDark(theme === "dark");
    });
  }, []);

  const toggleTheme = (): void => {
    const newTheme = isDark ? "light" : "dark";
    setTheme(newTheme);
    setIsDark(!isDark);
  };

  const setLoading = (loading: boolean): void => {
    setIsLoading(loading);
  };

  // Set data-theme attribute on body for CSS targeting
  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        toggleTheme,
        setLoading,
        isLoading,
      }}
    >
      <MuiThemeProvider theme={isDark ? darkTheme : lightTheme}>
        <CssBaseline />
        {children}
        <Backdrop
          sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
          open={isLoading}
        >
          <CircularProgress color="inherit" />
        </Backdrop>
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
