import React from 'react'
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./services/firebase";

import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Profile from "./pages/Profile";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleLogout = async () => {
    await signOut(auth);
    setPage("dashboard");
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="layout">
      <Sidebar page={page} setPage={setPage} />

      <main className="main">
        <Navbar
          user={user}
          onLogout={handleLogout}
          theme={theme}
          setTheme={setTheme}
        />

        {page === "dashboard" && <Dashboard />}
        {page === "devices" && <Devices />}
        {page === "profile" && <Profile />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;