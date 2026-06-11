import React from 'react'
import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../services/firebase";

function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand">
            <span className="brand-dot"></span>
            <div>
              <strong>dotDashboard</strong>
              <small>IoT Monitoring Platform</small>
            </div>
          </div>
        </div>

        <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p>
          {mode === "login"
            ? "Sign in to monitor your IoT devices."
            : "Create an account to start using dotDashboard."}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="primary-button full">
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        <button
          type="button"
          className="ghost-button full"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Create new account" : "Back to login"}
        </button>
      </div>
    </div>
  );
}

export default Login;