import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setJwt } from "./lib/api";

// Child view links look like /child#t=<jwt>. Bootstrap the child session before the app mounts.
(function bootstrapChildFromHash() {
  try {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const m = hash.match(/[#&]t=([^&]+)/);
    if (m) {
      setJwt(decodeURIComponent(m[1]), "child");
      const cleaned = hash.replace(/[#&]t=[^&]+/, "");
      window.history.replaceState(null, "", window.location.pathname + window.location.search + cleaned);
    }
  } catch { /* noop */ }
})();

createRoot(document.getElementById("root")!).render(<App />);
