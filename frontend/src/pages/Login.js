import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff, FiLoader, FiAlertCircle } from "react-icons/fi";
import { useToast } from "../contexts/ToastContext";
import BrandLogo from "../components/BrandLogo";
import "../styles/Auth.css";

import { getApiUrl } from "../config";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
      showToast("Session expired. Please log in again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleLogin() {
    setErrorMessage("");

    if (!email || !password) {
      const msg = "Please fill in all required fields.";
      setErrorMessage(msg);
      showToast(msg);
      return;
    }

    if (!validateEmail(email)) {
      const msg = "Please enter a valid email address.";
      setErrorMessage(msg);
      showToast(msg);
      return;
    }

    setIsLoading(true);

    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.detail || "Invalid email or password. Please check your credentials.");
      }
      if (data.token) {
        localStorage.setItem("samrag_auth_token", data.token);
        localStorage.setItem("samrag_user", JSON.stringify(data.user));
      }
      showToast("Login successful!");
      navigate("/");
      window.location.reload();
    } catch (error) {
      const msg = error.message || "An error occurred during login.";
      setErrorMessage(msg);
      showToast(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <BrandLogo size="large" />
      </div>
      <form className="auth-input-container" onSubmit={(e) => {
        e.preventDefault();
        if (!isLoading) handleLogin();
      }}>
        {errorMessage && (
          <div className="auth-error-banner">
            <FiAlertCircle className="auth-error-icon" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="input-field-wrapper">
          <input
            className="id field"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            disabled={isLoading}
          />
        </div>

        <div className="input-field-wrapper password-wrapper">
          <input
            className="password field"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isLoading}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
          </button>
        </div>

        <button
          className={`continue field ${isLoading ? "loading" : ""}`}
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="btn-loading-content">
              <FiLoader className="btn-spinner" size={18} />
              Logging in...
            </span>
          ) : (
            "Log In"
          )}
        </button>
      </form>
      <div className="footer">
        <p>Don't have an account?</p>
        <button className="route" onClick={() => navigate("/register")} disabled={isLoading}>
          Sign Up
        </button>
      </div>
    </div>
  );
}

export default Login;