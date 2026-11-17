import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "./index.css";
import App from "./App";

// no StrictMode: its double effect would register the PeerJS ID twice and lose it
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
