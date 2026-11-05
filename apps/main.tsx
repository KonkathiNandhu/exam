import React from "react";
import { createRoot } from "react-dom/client";
import AnswerOverlay from "./answer-overlay/App";
import Desktop from "./desktop-web/App";
import Mobile from "./mobile-web/App";
import Practice from "./mock-assessment/App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <>
    {location.pathname === "/overlay" ? (
      <AnswerOverlay />
    ) : location.pathname === "/mobile" ? (
      <Mobile />
    ) : location.pathname === "/practice" ? (
      <Practice />
    ) : (
      <Desktop />
    )}
  </>,
);
