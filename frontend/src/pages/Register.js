import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff, FiLoader } from "react-icons/fi";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/Modal";
import BrandLogo from "../components/BrandLogo";
import "../styles/Auth.css";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  }

  async function handleRegister() {
    if (!name || !email || !password) {
      showToast("Please fill in all fields.");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.");
      return;
    }

    if (password.length < 8 || password.length > 20) {
      showToast("Password must be between 8 and 20 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.detail || "An unknown error occurred.");
      }
      setShowCompleteModal(true);
    } catch (error) {
      showToast(error.message || "An unknown error occurred.");
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
        if (!isLoading) handleRegister();
      }}>
        <div className="input-field-wrapper">
          <input
            className="id field"
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
          />
        </div>
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
            autoComplete="new-password"
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
        <p className="info">*Password must be at least 8 characters long.</p>
        <button
          className={`continue field ${isLoading ? "loading" : ""}`}
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="btn-loading-content">
              <FiLoader className="btn-spinner" size={18} />
              Signing Up...
            </span>
          ) : (
            "Sign Up"
          )}
        </button>
      </form>
      <div className="footer">
        <p>Already have an account?</p>
        <button className="route" onClick={() => navigate("/login")} disabled={isLoading}>Log In</button>
      </div>

      {showCompleteModal && (
        <Modal
          message="Registration completed successfully."
          onConfirm={() => {
            setShowCompleteModal(false);
            navigate("/login");
          }}
          showCancelButton={false}
        />
      )}
    </div>
  );
}

export default Register;
