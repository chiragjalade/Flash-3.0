import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/space-grotesk/400.css";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/glass.css";
import "./styles/liquid-glass.css";
import "./styles/global.css";

const container = document.getElementById("root")!;
createRoot(container).render(<App />);
