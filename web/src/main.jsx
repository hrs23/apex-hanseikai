import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { lang } from "./lib/i18n";
import { installErrorReporting } from "./lib/report";
import "./styles.css";
import ErrorBoundary from "./views/ErrorBoundary.jsx";

installErrorReporting();
document.documentElement.lang = lang;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
