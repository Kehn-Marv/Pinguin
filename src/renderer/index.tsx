import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./global.css";

document.body.innerHTML = '<div id="app"></div>';

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App element not found");
}
const root = createRoot(appElement);
root.render(<App />);
