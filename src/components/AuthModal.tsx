"use client";

import React, { useState } from "react";
import { getSupabaseClient } from "@/utils/supabaseClient";
import { syncLocalBooksToCloud } from "@/utils/booksStore";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage({
          text: "Registration successful! Please check your email for verification link.",
          type: "success",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        setMessage({
          text: "Logged in successfully!",
          type: "success",
        });

        // Trigger sync of local storage books to cloud database
        try {
          const syncedCount = await syncLocalBooksToCloud();
          if (syncedCount > 0) {
            console.log(`Synced ${syncedCount} local books to Supabase`);
          }
        } catch (syncErr) {
          console.error("Failed to sync books after login:", syncErr);
        }

        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setMessage({
        text: err.message || "Authentication failed.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isSignUp ? "Create Cloud Account" : "Access Cloud Bookshelf"}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleAuth} className="modal-body">
          <div className="details-tab-group" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className={`details-tab ${!isSignUp ? "active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => {
                setIsSignUp(false);
                setMessage(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`details-tab ${isSignUp ? "active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => {
                setIsSignUp(true);
                setMessage(null);
              }}
            >
              Sign Up
            </button>
          </div>

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

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

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
            ) : isSignUp ? (
              "Sign Up"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="modal-footer" style={{ justifyContent: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {!isSignUp ? (
            <span>
              New to AuraBooks?{" "}
              <button
                type="button"
                style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
                onClick={() => setIsSignUp(true)}
              >
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: "bold" }}
                onClick={() => setIsSignUp(false)}
              >
                Sign In instead
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
