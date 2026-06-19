import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { AlarmProvider } from "./context/AlarmContext.jsx";
import "./styles.css";
import "leaflet/dist/leaflet.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AlarmProvider>
        <App />
      </AlarmProvider>
    </AuthProvider>
  </React.StrictMode>,
);
