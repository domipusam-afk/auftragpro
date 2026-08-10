import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installApiAuthInterceptor } from "./lib/api-auth";

installApiAuthInterceptor();

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
