"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/utils/supabaseClient";
import { syncLocalBooksToCloud } from "@/utils/booksStore";
import { syncLocalAuthorsToCloud } from "@/utils/authorsStore";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
  initialMode?: "signin" | "signup" | "forgot" | "update";
}

type AuthMode = "signin" | "signup" | "forgot" | "update";

export default function AuthModal({ isOpen, onClose, onAuthSuccess, initialMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setMessage(null);
      setPassword("");
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage({
        text: "Supabase is not configured yet. Please configure it in Settings first.",
        type: "error",
      });
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage({
          text: "Registration successful! Please check your email for the verification link.",
          type: "success",
        });
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        setMessage({
          text: "Logged in successfully!",
          type: "success",
        });

        // Trigger sync of local storage books & authors to cloud database
        try {
          const [syncedBooks, syncedAuthors] = await Promise.all([
            syncLocalBooksToCloud(),
            syncLocalAuthorsToCloud()
          ]);
          if (syncedBooks > 0) {
            console.log(`Synced ${syncedBooks} local books to Supabase`);
          }
          if (syncedAuthors > 0) {
            console.log(`Synced ${syncedAuthors} local authors to Supabase`);
          }
        } catch (syncErr) {
          console.error("Failed to sync local data after login:", syncErr);
        }

        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 1000);
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setMessage({
          text: "Password reset link sent! Check your email inbox.",
          type: "success",
        });
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({
          password: password,
        });
        if (error) throw error;
        setMessage({
          text: "Password updated successfully! Logging you in...",
          type: "success",
        });
        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setMessage({
        text: err.message || "Authentication request failed.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "signup": return "Create Cloud Account";
      case "forgot": return "Reset Password Request";
      case "update": return "Set New Password";
      default: return "Access Cloud Bookshelf";
    }
  };

  const getButtonText = () => {
    if (loading) return "Processing...";
    switch (mode) {
      case "signup": return "Sign Up";
      case "forgot": return "Send Reset Link";
      case "update": return "Update Password";
      default: return "Sign In";
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{getTitle()}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleAuth} className="modal-body">
          {/* Header tabs for signin / signup */}
          {(mode === "signin" || mode === "signup") && (
            <div className="details-tab-group" style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                className={`details-tab ${mode === "signin" ? "active" : ""}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setMode("signin");
                  setMessage(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`details-tab ${mode === "signup" ? "active" : ""}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setMode("signup");
                  setMessage(null);
                }}
              >
                Sign Up
              </button>
            </div>
          )}

          {message && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: message.type === "success" ? "rgba(52, 211, 153, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${message.type === "success" ? "rgba(52, 211, 153, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                color: message.type === "success" ? "#6ee7b7" : "#f87171",
                fontSize: "0.875rem",
              }}
            >
              {message.text}
            </div>
          )}

          {mode === "update" && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              You have logged in via a recovery link. Please choose a new secure password.
            </div>
          )}

          {/* Email input (used in signin, signup, forgot) */}
          {mode !== "update" && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          )}

          {/* Password input (used in signin, signup, update) */}
          {mode !== "forgot" && (
            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label" style={{ margin: 0 }}>Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: "0.75rem" }}
                    onClick={() => {
                      setMode("forgot");
                      setMessage(null);
                    }}
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "1rem", height: "45px" }}
            disabled={loading}
          >
            {loading ? (
              <span className="ai-status-text" style={{ justifyContent: "center" }}>
                <span className="ai-loading-spinner"></span>
                Processing...
              </span>
            ) : (
              getButtonText()
            )}
          </button>
        </form>

        <div className="modal-footer" style={{ justifyContent: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {mode === "forgot" && (
            <button
              type="button"
              style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => {
                setMode("signin");
                setMessage(null);
              }}
            >
              ← Back to Sign In
            </button>
          )}

          {mode === "signin" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
              <span>
                New to AuraBooks?{" "}
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => {
                    setMode("signup");
                    setMessage(null);
                  }}
                >
                  Create an account
                </button>
              </span>
              <span>
                Forgot your password?{" "}
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => {
                    setMode("forgot");
                    setMessage(null);
                  }}
                >
                  Reset it here
                </button>
              </span>
            </div>
          )}

          {mode === "signup" && (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
                onClick={() => {
                  setMode("signin");
                  setMessage(null);
                }}
              >
                Sign In instead
              </button>
            </span>
          )}

          {mode === "update" && (
            <span>
              Need help? Contact support or request a new reset email.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
