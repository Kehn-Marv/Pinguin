import React from "react";
import ThemeProvider from "./ThemeProvider";
import Router from "./Router";
import { ErrorBoundary } from "react-error-boundary";
import ErrorPage from "./ErrorPage";
import Welcome from "./Welcome/Welcome";
import { AppProvider } from "./context/AppContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ModeProvider } from "./context/ModeContext";
import DiagnosticsButton from "./components/DiagnosticsButton";
import { RequiresOllama } from "./Requirers/RequiresOllama";

const App = () => {
  return (
    <ThemeProvider>
      <AppProvider>
        <NotificationProvider>
          <ModeProvider>
            <ErrorBoundary fallback={<ErrorPage />}>
              <RequiresOllama>
                <Welcome>
                  <Router />
                </Welcome>
                <DiagnosticsButton />
              </RequiresOllama>
            </ErrorBoundary>
          </ModeProvider>
        </NotificationProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;
