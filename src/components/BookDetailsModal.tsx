"use client";

import React, { useState, useEffect } from "react";
import { Book } from "@/utils/types";
import { updateBook, deleteBook } from "@/utils/booksStore";

interface BookDetailsModalProps {
  book: Book;
  isOpen: boolean;
  onClose: () => void;
  onBookUpdated: () => void;
}

export default function BookDetailsModal({ book, isOpen, onClose, onBookUpdated }: BookDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "chat">("details");
  
  // Book fields state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [status, setStatus] = useState<Book["status"]>("will-read");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [categoriesInput, setCategoriesInput] = useState("");
  const [notes, setNotes] = useState("");
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  
  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (book) {
      setTitle(book.title || "");
      setAuthor(book.author || "");
      setDescription(book.description || "");
      setCoverUrl(book.cover_url || "");
      setStatus(book.status || "will-read");
      setCurrentPage(book.current_page || 0);
      setTotalPages(book.total_pages || 0);
      setRating(book.rating);
      setCategoriesInput(book.categories ? book.categories.join(", ") : "");
      setNotes(book.notes || "");
      
      // Reset AI states
      setAiError(null);
      setUndoNote(null);
      setPreviewMode(false);
      setChatMessages([
        {
          role: "assistant",
          content: `Hi! I can help you analyze "${book.title}". Ask me about its themes, characters, or even ask me to quiz you on your notes!`,
        },
      ]);
    }
  }, [book, isOpen]);

  if (!isOpen || !book) return null;

  const handleSaveChanges = async (overrides?: { status?: Book["status"]; current_page?: number; rating?: number }) => {
    try {
      const categories = categoriesInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const finalStatus = overrides?.status !== undefined ? overrides.status : status;
      let finalCurrentPage = overrides?.current_page !== undefined ? overrides.current_page : currentPage;
      const finalTotalPages = totalPages;

      if (finalStatus === "completed" && finalTotalPages > 0) {
        finalCurrentPage = finalTotalPages;
      }

      // Enforce current_page boundaries
      const validatedPage = Math.min(finalCurrentPage, finalTotalPages);

      await updateBook(book.id, {
        title,
        author,
        description,
        cover_url: coverUrl,
        status: validatedPage === finalTotalPages && finalTotalPages > 0 ? "completed" : finalStatus,
        current_page: validatedPage,
        total_pages: finalTotalPages,
        rating: overrides?.rating !== undefined ? overrides.rating : rating,
        categories,
        notes,
      });

      onBookUpdated();
    } catch (err) {
      console.error(err);
      alert("Failed to save changes.");
    }
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
  };

  const handleSaveNotes = async () => {
    try {
      await updateBook(book.id, { notes });
      onBookUpdated();
      alert("Notes saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save notes.");
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      try {
        await deleteBook(book.id);
        onBookUpdated();
        onClose();
      } catch (err) {
        console.error(err);
        alert("Failed to delete book.");
      }
    }
  };

  // AI helper: Call AI proxy or local Ollama
  const runAICall = async (prompt: string, systemPrompt?: string, chatHistory: any[] = []) => {
    const aiProvider = localStorage.getItem("ai_provider") || "gemini";
    const aiApiKey = localStorage.getItem("ai_api_key") || "";
    const aiModel = localStorage.getItem("ai_model") || "gemini-2.5-flash-lite";
    const ollamaUrl = localStorage.getItem("ollama_url") || "http://localhost:11434";

    if (aiProvider === "ollama") {
      // Local direct browser call to Ollama (to run fully offline!)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      try {
        const hasHistory = chatHistory.length > 0;
        const endpoint = hasHistory ? "/api/chat" : "/api/generate";
        
        let body: any = {};
        if (hasHistory) {
          body = {
            model: aiModel,
            messages: [
              ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
              ...chatHistory.map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: prompt }
            ],
            stream: false
          };
        } else {
          body = {
            model: aiModel,
            prompt: prompt,
            system: systemPrompt,
            stream: false
          };
        }

        const response = await fetch(`${ollamaUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama server returned status: ${response.status}. Make sure OLLAMA_ORIGINS="*" is set.`);
        }

        const data = await response.json();
        return hasHistory ? data.message?.content : data.response;
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === "AbortError") {
          throw new Error("Local Ollama request timed out (60 seconds). Is the model loading?");
        }
        throw new Error(`Failed to connect to local Ollama. Ensure Ollama is running at ${ollamaUrl} and CORS is configured.`);
      }
    } else {
      // Cloud API Proxy (Next.js route)
      const messagesPayload = chatHistory.length > 0
        ? [...chatHistory.map(m => ({ role: m.role, content: m.content })), { role: "user", content: prompt }]
        : [{ role: "user", content: prompt }];

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          model: aiModel,
          messages: messagesPayload,
          systemPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.text;
    }
  };

  // Enhance notes using AI
  const handleEnhanceNotes = async () => {
    if (!notes.trim()) {
      alert("Please write some notes first before asking the AI to enhance them.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    const systemPrompt = `You are a reading assistant. The user will provide rough reading notes for the book "${title}" by ${author}. Your job is to format, clarify, and enhance the notes. Maintain the user's original thoughts, but improve structure with markdown bullet points, clear headings, key takeaways, and perfect grammar. Keep it clean and concise. Do not add intro/outro chit-chat. Start directly with the enhanced notes.`;
    const prompt = `Here are my rough notes:\n\n${notes}`;

    try {
      const resultText = await runAICall(prompt, systemPrompt);
      if (resultText) {
        setUndoNote(notes);
        setNotes(resultText.trim());
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to enhance notes.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleUndoEnhance = () => {
    if (undoNote !== null) {
      setNotes(undoNote);
      setUndoNote(null);
    }
  };

  // Chat with book
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || aiLoading) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setAiLoading(true);
    setAiError(null);

    // Append user message immediately
    const updatedMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(updatedMessages);

    const systemPrompt = `You are an expert literary assistant discussing the book "${title}" by ${author}.
    Metadata description: ${description}
    User's personal reading notes: ${notes || "No notes written yet."}
    
    Answer the user's questions about this book using this context and your knowledge of the book. Refer to their notes if they ask. Keep answers engaging and insightful.`;

    try {
      const responseText = await runAICall(userMsg, systemPrompt, chatMessages.filter(m => m.role !== "system"));
      if (responseText) {
        setChatMessages([...updatedMessages, { role: "assistant" as const, content: responseText.trim() }]);
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to get AI response.");
      setChatMessages([...updatedMessages, { role: "system" as const, content: `Error: ${err.message || "Failed to communicate with AI model."}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "780px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className={`card-badge ${status}`} style={{ position: "static" }}>
              {status === "will-read" ? "Want to Read" : status === "reading" ? "Reading" : status === "completed" ? "Completed" : "Not Completed"}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ maxHeight: "72vh", overflowY: "auto" }}>
          {/* Main Book Details Grid */}
          <div className="book-details-grid">
            {coverUrl ? (
              <img src={coverUrl} className="details-cover" alt="cover" />
            ) : (
              <div className="details-cover" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "12px" }}>
                <span style={{ fontSize: "3rem" }}>📖</span>
                <span>NO COVER</span>
              </div>
            )}
            
            <div className="details-meta">
              <input
                type="text"
                className="form-input"
                style={{ fontSize: "1.5rem", fontWeight: "800", background: "transparent", border: "none", padding: 0 }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book Title"
                onBlur={() => handleSaveChanges()}
              />
              <input
                type="text"
                className="form-input"
                style={{ fontSize: "1rem", color: "var(--text-secondary)", background: "transparent", border: "none", padding: 0, marginTop: "-0.25rem" }}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author"
                onBlur={() => handleSaveChanges()}
              />

              <div className="form-group" style={{ marginTop: "0.5rem" }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Tags / Genres</label>
                <input
                  type="text"
                  className="form-input"
                  value={categoriesInput}
                  onChange={(e) => setCategoriesInput(e.target.value)}
                  placeholder="e.g. Science Fiction, Classics"
                  onBlur={() => handleSaveChanges()}
                />
              </div>

              <div className="form-row three" style={{ marginTop: "0.5rem" }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.7rem" }}>Status</label>
                  <select
                    className="filter-select"
                    value={status}
                    onChange={(e) => { 
                      const newStatus = e.target.value as Book["status"];
                      setStatus(newStatus); 
                      if (newStatus === "completed" && totalPages > 0) {
                        setCurrentPage(totalPages);
                        handleSaveChanges({ status: newStatus, current_page: totalPages });
                      } else {
                        handleSaveChanges({ status: newStatus });
                      }
                    }}
                    style={{ width: "100%", padding: "0.4rem 1.5rem 0.4rem 0.6rem" }}
                  >
                    <option value="will-read">Want to Read</option>
                    <option value="reading">Reading</option>
                    <option value="completed">Completed</option>
                    <option value="not-completed">Not Completed</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.7rem" }}>Pages Read</label>
                  <input
                    type="number"
                    className="form-input"
                    value={currentPage}
                    onChange={(e) => { setCurrentPage(Math.max(0, parseInt(e.target.value) || 0)); }}
                    onBlur={() => handleSaveChanges()}
                    style={{ padding: "0.4rem 0.6rem" }}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.7rem" }}>Total Pages</label>
                  <input
                    type="number"
                    className="form-input"
                    value={totalPages}
                    onChange={(e) => { setTotalPages(Math.max(0, parseInt(e.target.value) || 0)); }}
                    onBlur={() => handleSaveChanges()}
                    style={{ padding: "0.4rem 0.6rem" }}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: "0.5rem" }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.7rem" }}>Rating</label>
                  <div className="rating-input">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`rating-star-btn ${rating && rating > i ? "active" : ""}`}
                        onClick={() => { setRating(i + 1); handleSaveChanges({ rating: i + 1 }); }}
                      >
                        ★
                      </button>
                    ))}
                    {rating && (
                      <button
                        type="button"
                        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer", marginLeft: "0.25rem" }}
                        onClick={() => { setRating(undefined); handleSaveChanges({ rating: 0 }); }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.7rem" }}>Cover Image Link</label>
                  <input
                    type="text"
                    className="form-input"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    onBlur={() => handleSaveChanges()}
                    placeholder="Image URL"
                    style={{ padding: "0.4rem 0.6rem" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TAB SEGMENT ACTION */}
          <div className="details-tab-group" style={{ marginTop: "1.5rem" }}>
            <button
              className={`details-tab ${activeTab === "details" ? "active" : ""}`}
              onClick={() => setActiveTab("details")}
            >
              Description
            </button>
            <button
              className={`details-tab ${activeTab === "notes" ? "active" : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              Reading Notes
            </button>
            <button
              className={`details-tab ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              Ask AI about Book
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div style={{ marginTop: "1rem" }}>
            {activeTab === "details" && (
              <div className="form-group">
                <textarea
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => handleSaveChanges()}
                  placeholder="Summarize the book details..."
                  rows={6}
                />
              </div>
            )}

            {activeTab === "notes" && (
              <div className="notes-editor-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="form-label" style={{ fontSize: "0.7rem", margin: 0 }}>Reading Notes</span>
                  <div style={{ display: "flex", gap: "0.25rem", background: "rgba(0,0,0,0.3)", padding: "0.2rem", borderRadius: "var(--radius-sm)" }}>
                    <button 
                      type="button" 
                      className={`tab-btn ${!previewMode ? "active" : ""}`}
                      onClick={() => setPreviewMode(false)}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", borderRadius: "4px" }}
                    >
                      Edit
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${previewMode ? "active" : ""}`}
                      onClick={() => setPreviewMode(true)}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", borderRadius: "4px" }}
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {!previewMode ? (
                  <textarea
                    className="form-textarea"
                    style={{ fontFamily: "var(--font-sans)", minHeight: "180px", lineHeight: "1.6" }}
                    value={notes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder="Jot down quotes, thoughts, page reflections, or ideas..."
                  />
                ) : (
                  <div 
                    className="form-textarea markdown-preview"
                    style={{ 
                      minHeight: "180px", 
                      maxHeight: "350px", 
                      overflowY: "auto", 
                      background: "rgba(0, 0, 0, 0.25)", 
                      padding: "1rem", 
                      border: "1px solid var(--border-color)", 
                      borderRadius: "var(--radius-md)", 
                      lineHeight: "1.6"
                    }}
                  >
                    {renderMarkdown(notes)}
                  </div>
                )}
                
                {aiError && (
                  <div style={{ color: "#f87171", fontSize: "0.8rem" }}>
                    ⚠️ {aiError}
                  </div>
                )}

                <div className="ai-actions-row">
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {aiLoading ? (
                      <span className="ai-status-text">
                        <span className="ai-loading-spinner"></span>
                        AI is enhancing notes...
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        💡 AI can format, organize, and correct your notes.
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {undoNote && (
                      <button type="button" className="btn btn-secondary" onClick={handleUndoEnhance} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                        ↩ Undo
                      </button>
                    )}
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={handleEnhanceNotes} 
                      disabled={aiLoading}
                      style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
                    >
                      🪄 Enhance Notes
                    </button>
                  </div>
                </div>

                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleSaveNotes}
                  style={{ alignSelf: "flex-end" }}
                >
                  💾 Save Notes
                </button>
              </div>
            )}

            {activeTab === "chat" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="ai-chat-box">
                  <div className="ai-chat-messages">
                    {chatMessages.map((msg, index) => (
                      <div key={index} className={`chat-message ${msg.role}`}>
                        {msg.content}
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="chat-message assistant" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <span className="ai-loading-spinner"></span>
                        AI is reading book context...
                      </div>
                    )}
                  </div>
                </div>

                <form onSubmit={handleSendChatMessage} className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about themes, characters, or summarize the book..."
                    disabled={aiLoading}
                  />
                  <button type="submit" className="chat-send-btn" disabled={aiLoading || !chatInput.trim()}>
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-danger" onClick={handleDelete}>
            🗑️ Delete Book
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Private Markdown Parser helpers
function renderMarkdown(text: string) {
  if (!text.trim()) return <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No notes written yet. Switch to Edit to write some.</p>;
  
  const lines = text.split("\n");
  
  return lines.map((line, idx) => {
    const cleanLine = line.trim();
    
    // Headers
    if (cleanLine.startsWith("### ")) {
      return <h4 key={idx} style={{ color: "#a5b4fc", marginTop: "1rem", marginBottom: "0.5rem", fontWeight: "700", fontSize: "1rem" }}>{parseInlineMarkdown(cleanLine.substring(4))}</h4>;
    }
    if (cleanLine.startsWith("## ")) {
      return <h3 key={idx} style={{ color: "#ffffff", marginTop: "1.25rem", marginBottom: "0.6rem", fontWeight: "700", fontSize: "1.15rem" }}>{parseInlineMarkdown(cleanLine.substring(3))}</h3>;
    }
    if (cleanLine.startsWith("# ")) {
      return <h2 key={idx} style={{ color: "#ffffff", marginTop: "1.5rem", marginBottom: "0.75rem", fontWeight: "800", fontSize: "1.3rem" }}>{parseInlineMarkdown(cleanLine.substring(2))}</h2>;
    }
    
    // Bullet points
    if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
      return (
        <ul key={idx} style={{ paddingLeft: "1.25rem", margin: "0.35rem 0" }}>
          <li style={{ listStyleType: "disc", color: "var(--text-primary)" }}>{parseInlineMarkdown(cleanLine.substring(2))}</li>
        </ul>
      );
    }
    
    // Numbered lists
    const numMatch = cleanLine.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return (
        <ol key={idx} style={{ paddingLeft: "1.25rem", margin: "0.35rem 0" }} start={parseInt(numMatch[1])}>
          <li style={{ listStyleType: "decimal", color: "var(--text-primary)" }}>{parseInlineMarkdown(numMatch[2])}</li>
        </ol>
      );
    }
    
    // Blockquotes
    if (cleanLine.startsWith("> ")) {
      return (
        <blockquote key={idx} style={{ borderLeft: "3px solid var(--color-primary)", paddingLeft: "0.75rem", margin: "0.75rem 0", color: "var(--text-secondary)", fontStyle: "italic", background: "rgba(255,255,255,0.02)", padding: "0.4rem 0.75rem", borderRadius: "0 4px 4px 0" }}>
          {parseInlineMarkdown(cleanLine.substring(2))}
        </blockquote>
      );
    }

    // Empty line
    if (line === "") {
      return <div key={idx} style={{ height: "0.5rem" }} />;
    }

    // Normal paragraph
    return <p key={idx} style={{ margin: "0.35rem 0", color: "var(--text-primary)" }}>{parseInlineMarkdown(line)}</p>;
  });
}

function parseInlineMarkdown(text: string) {
  const parts = [];
  const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
  let match;
  let lastIndex = 0;
  
  regex.lastIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }
    
    if (match[2]) {
      parts.push(<strong key={matchIndex} style={{ fontWeight: "700", color: "#ffffff" }}>{match[2]}</strong>);
    } else if (match[4]) {
      parts.push(<em key={matchIndex} style={{ fontStyle: "italic" }}>{match[4]}</em>);
    }
    
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}
