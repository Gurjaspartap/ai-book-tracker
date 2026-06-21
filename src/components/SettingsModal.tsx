"use client";

import React, { useState, useEffect } from "react";
import { resetSupabaseClient } from "@/utils/supabaseClient";
import { getBooks, saveLocalBooks } from "@/utils/booksStore";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-1.5-flash");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");

  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setProvider(localStorage.getItem("ai_provider") || "gemini");
      setApiKey(localStorage.getItem("ai_api_key") || "");
      
      const savedModel = localStorage.getItem("ai_model");
      if (savedModel) {
        setModel(savedModel);
      } else {
        // Set default based on provider
        setModel("gemini-1.5-flash");
      }

      setOllamaUrl(localStorage.getItem("ollama_url") || "http://localhost:11434");
      setSupabaseUrl(localStorage.getItem("supabase_url") || "");
      setSupabaseKey(localStorage.getItem("supabase_anon_key") || "");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    if (newProvider === "gemini") setModel("gemini-1.5-flash");
    else if (newProvider === "openai") setModel("gpt-4o-mini");
    else if (newProvider === "claude") setModel("claude-3-5-sonnet-20240620");
    else if (newProvider === "ollama") setModel("llama3.2");
  };

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ai_provider", provider);
      localStorage.setItem("ai_api_key", apiKey);
      localStorage.setItem("ai_model", model);
      localStorage.setItem("ollama_url", ollamaUrl);
      
      const prevUrl = localStorage.getItem("supabase_url") || "";
      const prevKey = localStorage.getItem("supabase_anon_key") || "";

      localStorage.setItem("supabase_url", supabaseUrl);
      localStorage.setItem("supabase_anon_key", supabaseKey);

      // If Supabase config changed, reset the client instance
      if (prevUrl !== supabaseUrl || prevKey !== supabaseKey) {
        resetSupabaseClient();
      }
    }
    onSave();
    onClose();
  };

  // Export Library to JSON
  const handleExport = async () => {
    try {
      const books = await getBooks();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(books, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `aurabooks_export_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export library data.");
    }
  };

  // Import Library from JSON
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportStatus(null);
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            // Basic validation
            const isValid = parsed.every(b => b.title && typeof b.title === "string");
            if (!isValid) {
              setImportStatus("Invalid file structure. Make sure each object has a 'title' field.");
              return;
            }

            // Save to local storage
            saveLocalBooks(parsed);
            setImportStatus(`Successfully imported ${parsed.length} books! Refreshing library...`);
            setTimeout(() => {
              onSave();
              onClose();
              setImportStatus(null);
            }, 1500);
          } else {
            setImportStatus("Invalid file format. File must contain a JSON array of books.");
          }
        } catch (err) {
          setImportStatus("Error parsing JSON file. Check for formatting errors.");
        }
      };
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "650px" }}>
        <div className="modal-header">
          <h2 className="modal-title">System Settings</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Section 1: AI Provider Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              AI Integration Settings
            </h3>
            
            <div className="form-group">
              <label className="form-label">AI Service Provider</label>
              <select 
                className="filter-select" 
                value={provider} 
                onChange={(e) => handleProviderChange(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="gemini">Google Gemini (Cloud)</option>
                <option value="openai">OpenAI (Cloud)</option>
                <option value="claude">Anthropic Claude (Cloud)</option>
                <option value="ollama">Ollama (Local Offline)</option>
              </select>
            </div>

            {provider !== "ollama" ? (
              <>
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API Key (stored locally in browser)"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Model Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={provider === "gemini" ? "gemini-1.5-flash" : provider === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-20240620"}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Ollama Connection URL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ollama Model Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama3.2, gemma2, etc."
                  />
                </div>
                
                <div className="guide-box">
                  <h4>⚠️ Local CORS Configuration Required for Ollama</h4>
                  <p>To let your browser talk to Ollama directly, you must configure Ollama to accept requests from web origins:</p>
                  <p><strong>Windows:</strong> Close Ollama from taskbar. Open Command Prompt and run:</p>
                  <code>setx OLLAMA_ORIGINS "*"</code>
                  <p>Then restart the Ollama application.</p>
                  <p><strong>macOS/Linux:</strong> Run terminal command:</p>
                  <code>OLLAMA_ORIGINS="*" ollama serve</code>
                </div>
              </>
            )}
          </div>

          {/* Section 2: Supabase Credentials */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <h3 style={{ fontSize: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              Supabase Cloud Sync Settings
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Leave blank to run in <strong>Offline Local Mode</strong>. If filled, the app connects to your personal Supabase database with sync and authentication!
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Supabase URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Supabase Anon Key</label>
                <input
                  type="password"
                  className="form-input"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOi..."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Data Backup */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <h3 style={{ fontSize: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              Backup & Recovery
            </h3>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <button className="btn btn-secondary" onClick={handleExport} style={{ flex: 1 }}>
                📤 Export Library (JSON)
              </button>
              
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="file"
                  id="import-file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: "none" }}
                />
                <label 
                  htmlFor="import-file" 
                  className="btn btn-secondary" 
                  style={{ display: "flex", width: "100%", textAlign: "center" }}
                >
                  📥 Import Library (JSON)
                </label>
              </div>
            </div>
            {importStatus && (
              <div style={{ fontSize: "0.8rem", color: importStatus.includes("Successfully") ? "#6ee7b7" : "#f87171" }}>
                {importStatus}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
