"use client";

import React, { useState, useEffect, useRef } from "react";
import { Book } from "@/utils/types";
import { getBooks, getLocalBooks, addBook } from "@/utils/booksStore";
import { getSupabaseClient } from "@/utils/supabaseClient";

// Import components
import BookCard from "@/components/BookCard";
import AddBookModal from "@/components/AddBookModal";
import BookDetailsModal from "@/components/BookDetailsModal";
import SettingsModal from "@/components/SettingsModal";
import AuthModal from "@/components/AuthModal";

interface FavoriteAuthor {
  id: string;
  name: string;
  books?: any[];
  loading?: boolean;
  error?: string | null;
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation Tabs State
  const [activeView, setActiveView] = useState<"shelf" | "insights" | "authors">("shelf");

  // Shelf View: Filtering & Sorting State
  const [activeTab, setActiveTab] = useState<"all" | "will-read" | "reading" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");

  // AI Insights State
  const [aiInsights, setAiInsights] = useState("");
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // Favorite Authors State
  const [favoriteAuthors, setFavoriteAuthors] = useState<FavoriteAuthor[]>([]);
  const [newAuthorName, setNewAuthorName] = useState("");

  // User State
  const [user, setUser] = useState<any>(null);
  const [supabaseActive, setSupabaseActive] = useState(false);

  // Modals state
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"signin" | "signup" | "forgot" | "update">("signin");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const requestCountRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  // Load books, auth state, cached insights and authors
  const loadData = async () => {
    const reqId = ++requestCountRef.current;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      let activeUser = null;
      if (supabase) {
        setSupabaseActive(true);
        const { data: sessionData } = await supabase.auth.getSession();
        activeUser = sessionData?.session?.user || null;
      } else {
        setSupabaseActive(false);
      }
      
      if (reqId === requestCountRef.current) {
        setUser(activeUser);
        currentUserIdRef.current = activeUser ? activeUser.id : null;
      }
      
      const library = await getBooks();
      if (reqId === requestCountRef.current) {
        setBooks(library);
      }

      // Hydrate local cache items
      if (typeof window !== "undefined" && reqId === requestCountRef.current) {
        setAiInsights(localStorage.getItem("ai_insights") || "");
        
        const savedAuthors = localStorage.getItem("favorite_authors");
        if (savedAuthors) {
          try {
            setFavoriteAuthors(JSON.parse(savedAuthors));
          } catch (e) {
            console.error("Failed to parse favorite authors:", e);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      if (reqId === requestCountRef.current) {
        setBooks(getLocalBooks());
      }
    } finally {
      if (reqId === requestCountRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();

    // Manual check for password recovery redirection (handles race condition)
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash.includes("type=recovery") || search.includes("type=recovery") || hash.includes("recovery")) {
        setAuthInitialMode("update");
        setAuthOpen(true);
      }
    }

    // Listen for auth changes
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          const newUserId = session?.user?.id || null;
          
          if (event === "PASSWORD_RECOVERY") {
            setAuthInitialMode("update");
            setAuthOpen(true);
          }

          // If the logged in user actually changed, or they logged in/out, reload books
          if (newUserId !== currentUserIdRef.current) {
            currentUserIdRef.current = newUserId;
            setUser(session?.user || null);
            loadData();
          }
        }
      );
      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
      setUser(null);
      loadData();
    }
  };

  // Helper to call AI models for insights
  const runAICall = async (prompt: string, systemPrompt?: string) => {
    const aiProvider = localStorage.getItem("ai_provider") || "gemini";
    const aiApiKey = localStorage.getItem("ai_api_key") || "";
    const aiModel = localStorage.getItem("ai_model") || "gemini-2.5-flash-lite";
    const ollamaUrl = localStorage.getItem("ollama_url") || "http://localhost:11434";

    if (aiProvider === "ollama") {
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: aiModel,
          prompt: prompt,
          system: systemPrompt,
          stream: false
        })
      });
      if (!response.ok) throw new Error("Ollama connection failed.");
      const data = await response.json();
      return data.response;
    } else {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          model: aiModel,
          messages: [{ role: "user", content: prompt }],
          systemPrompt
        })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "AI proxy call failed.");
      }
      const data = await response.json();
      return data.text;
    }
  };

  // AI Insights Generation Handler
  const generateAIInsights = async () => {
    if (books.length === 0) {
      alert("Please add some books to your library first to generate insights!");
      return;
    }

    setGeneratingInsights(true);
    setInsightsError(null);

    const systemPrompt = `You are a literary analyst and reading coach. The user will provide a list of books from their personal book tracker (including titles, authors, categories/genres, reading statuses, and ratings). 
    Analyze their reading list and generate:
    1. Reading Profile: Identify themes, dominant genres, and habits.
    2. Mindset Gains: Explain the knowledge, perspective shifts, or skills they will acquire from their reading choices.
    3. Personalized Suggestions: Recommend 3 specific books they would love next, explaining why for each.
    
    Format your response in beautiful markdown. Use clean headings, bullet points, and an encouraging, intelligent tone. Start directly with the insights.`;
    
    const prompt = `Here is my current reading list:\n${books
      .map(
        (b) =>
          `- "${b.title}" by ${b.author} [Category: ${
            b.categories ? b.categories.join(", ") : "None"
          }, Status: ${b.status}, Rating: ${b.rating || "Unrated"}]`
      )
      .join("\n")}`;

    try {
      const resultText = await runAICall(prompt, systemPrompt);
      if (resultText) {
        setAiInsights(resultText.trim());
        localStorage.setItem("ai_insights", resultText.trim());
      }
    } catch (err: any) {
      console.error(err);
      setInsightsError(err.message || "Failed to generate reading insights.");
    } finally {
      setGeneratingInsights(false);
    }
  };

  // Favorite Authors: Fetch bibliography
  const fetchAuthorBooks = async (authorName: string, authorId: string) => {
    setFavoriteAuthors((prev) =>
      prev.map((a) => (a.id === authorId ? { ...a, loading: true, error: null } : a))
    );

    try {
      const query = `inauthor:"${authorName}"`;
      const res = await fetch(`/api/books?q=${encodeURIComponent(query)}`);
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Search proxy request failed.");
      }

      const data = await res.json();
      const fetchedBooks = data.items || [];

      setFavoriteAuthors((prev) => {
        const updated = prev.map((a) =>
          a.id === authorId ? { ...a, books: fetchedBooks, loading: false } : a
        );
        localStorage.setItem("favorite_authors", JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      console.error(err);
      setFavoriteAuthors((prev) =>
        prev.map((a) =>
          a.id === authorId ? { ...a, error: err.message || "Failed to load books.", loading: false } : a
        )
      );
    }
  };

  // Favorite Authors: Add author
  const handleAddAuthor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthorName.trim()) return;

    const authorName = newAuthorName.trim();
    const authorId = "author_" + Math.random().toString(36).substring(2, 11);

    const newAuthor: FavoriteAuthor = {
      id: authorId,
      name: authorName,
      books: [],
      loading: false,
      error: null,
    };

    const updatedAuthors = [...favoriteAuthors, newAuthor];
    setFavoriteAuthors(updatedAuthors);
    localStorage.setItem("favorite_authors", JSON.stringify(updatedAuthors));
    setNewAuthorName("");

    // Trigger fetch
    fetchAuthorBooks(authorName, authorId);
  };

  // Favorite Authors: Remove author
  const handleRemoveAuthor = (authorId: string) => {
    if (confirm("Are you sure you want to remove this author?")) {
      const updated = favoriteAuthors.filter((a) => a.id !== authorId);
      setFavoriteAuthors(updated);
      localStorage.setItem("favorite_authors", JSON.stringify(updated));
    }
  };

  // Favorite Authors: Direct add book to Want to Read shelf
  const handleAddAuthorBookToShelf = async (volInfo: any, authorName: string) => {
    try {
      await addBook({
        title: volInfo.title,
        author: volInfo.authors ? volInfo.authors.join(", ") : authorName,
        description: volInfo.description || "",
        cover_url: volInfo.imageLinks?.thumbnail || volInfo.imageLinks?.smallThumbnail || "",
        categories: volInfo.categories || [],
        status: "will-read",
        current_page: 0,
        total_pages: volInfo.pageCount || 0,
        notes: "",
      });

      // Reload library state
      const library = await getBooks();
      setBooks(library);
      alert(`"${volInfo.title}" added to your Want to Read shelf!`);
    } catch (err) {
      console.error(err);
      alert("Failed to add book to your list.");
    }
  };

  // Get unique tags/genres from all shelf books
  const uniqueTags = Array.from(
    new Set(books.flatMap((b) => b.categories || []))
  ).sort();

  // Filter and sort shelf books
  const filteredBooks = books
    .filter((book) => {
      if (activeTab !== "all" && book.status !== activeTab) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = book.title?.toLowerCase().includes(query);
        const matchesAuthor = book.author?.toLowerCase().includes(query);
        const matchesNotes = book.notes?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesAuthor && !matchesNotes) return false;
      }

      if (selectedTag && (!book.categories || !book.categories.includes(selectedTag))) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "rating") {
        return (b.rating || 0) - (a.rating || 0);
      }
      if (sortBy === "progress") {
        const aProg = a.total_pages > 0 ? a.current_page / a.total_pages : 0;
        const bProg = b.total_pages > 0 ? b.current_page / b.total_pages : 0;
        return bProg - aProg;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  // Calculate Metrics
  const totalCount = books.length;
  const willReadCount = books.filter((b) => b.status === "will-read").length;
  const readingCount = books.filter((b) => b.status === "reading").length;
  const completedCount = books.filter((b) => b.status === "completed").length;

  return (
    <div className="app-container">
      {/* HEADER SECTION */}
      <header className="app-header">
        <div className="logo-section">
          <h1>PB23 Reads</h1>
          <p>AI-Powered Personal Library Tracker</p>
        </div>

        <div className="header-actions">
          {supabaseActive ? (
            user ? (
              <div className="user-badge">
                <span>☁️</span>
                <span className="user-email" title={user.email}>
                  {user.email}
                </span>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleSignOut}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", marginLeft: "0.25rem" }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => { setAuthInitialMode("signin"); setAuthOpen(true); }}>
                🔑 Sync Cloud / Sign In
              </button>
            )
          ) : (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "0.5rem" }}>
              Offline Local Mode
            </span>
          )}

          <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙️ Settings
          </button>
          
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            ➕ Add Book
          </button>
        </div>
      </header>

      {/* METRICS CARD DISPLAY */}
      <section className="metrics-grid">
        <div className="metric-card total" onClick={() => { setActiveView("shelf"); setActiveTab("all"); }} style={{ cursor: "pointer" }}>
          <span className="metric-label">Total Books</span>
          <span className="metric-value">{totalCount}</span>
        </div>
        <div className="metric-card will-read" onClick={() => { setActiveView("shelf"); setActiveTab("will-read"); }} style={{ cursor: "pointer" }}>
          <span className="metric-label">Want to Read</span>
          <span className="metric-value">{willReadCount}</span>
        </div>
        <div className="metric-card reading" onClick={() => { setActiveView("shelf"); setActiveTab("reading"); }} style={{ cursor: "pointer" }}>
          <span className="metric-label">Reading</span>
          <span className="metric-value">{readingCount}</span>
        </div>
        <div className="metric-card completed" onClick={() => { setActiveView("shelf"); setActiveTab("completed"); }} style={{ cursor: "pointer" }}>
          <span className="metric-label">Completed</span>
          <span className="metric-value">{completedCount}</span>
        </div>
      </section>

      {/* NAVIGATION TABS (SHELF, INSIGHTS, AUTHORS) */}
      <nav className="view-tabs-container">
        <button 
          className={`view-tab-btn ${activeView === "shelf" ? "active" : ""}`}
          onClick={() => setActiveView("shelf")}
        >
          📚 My Bookshelf
        </button>
        <button 
          className={`view-tab-btn ${activeView === "insights" ? "active" : ""}`}
          onClick={() => setActiveView("insights")}
        >
          🪄 AI Insights
        </button>
        <button 
          className={`view-tab-btn ${activeView === "authors" ? "active" : ""}`}
          onClick={() => setActiveView("authors")}
        >
          ⭐ Favorite Authors
        </button>
      </nav>

      {/* VIEW PANEL 1: MY BOOKSHELF */}
      {activeView === "shelf" && (
        <>
          {/* SEARCH AND FILTERS CONTROLS BAR */}
          <section className="controls-bar">
            <div className="shelf-tabs">
              <button 
                className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All Shelf
              </button>
              <button 
                className={`tab-btn ${activeTab === "will-read" ? "active" : ""}`}
                onClick={() => setActiveTab("will-read")}
              >
                Want to Read
              </button>
              <button 
                className={`tab-btn ${activeTab === "reading" ? "active" : ""}`}
                onClick={() => setActiveTab("reading")}
              >
                Reading
              </button>
              <button 
                className={`tab-btn ${activeTab === "completed" ? "active" : ""}`}
                onClick={() => setActiveTab("completed")}
              >
                Completed
              </button>
            </div>

            <div className="search-wrapper">
              <svg className="search-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search by title, author, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filters-wrapper">
              <select
                className="filter-select"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
              >
                <option value="">All Tags</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>

              <select
                className="filter-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="updated_at">Recently Active</option>
                <option value="title">Title (A-Z)</option>
                <option value="rating">Highest Rating</option>
                <option value="progress">Most Read Progress</option>
              </select>
            </div>
          </section>

          {/* BOOKSHELF DISPLAY AREA */}
          <main className="bookshelf-section">
            {loading ? (
              <div className="empty-state" style={{ borderStyle: "solid" }}>
                <span className="ai-loading-spinner" style={{ width: "2rem", height: "2rem", borderWidth: "3px" }}></span>
                <p>Loading your bookshelf...</p>
              </div>
            ) : filteredBooks.length > 0 ? (
              <div className="books-grid">
                {filteredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onClick={() => setSelectedBook(book)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span style={{ fontSize: "3rem" }}>📚</span>
                <h3>No books found</h3>
                <p>
                  {books.length === 0
                    ? "Your library is empty. Click 'Add Book' to get started!"
                    : "No books match your active search filter options."}
                </p>
                {books.length === 0 && (
                  <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                    Add your first book
                  </button>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {/* VIEW PANEL 2: AI INSIGHTS */}
      {activeView === "insights" && (
        <main className="insights-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ margin: 0, border: "none", padding: 0 }}>Reading Profile & Suggestions</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                AI Analysis of your library choice patterns, skills gained, and recommendations.
              </p>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={generateAIInsights}
              disabled={generatingInsights || books.length === 0}
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
            >
              {generatingInsights ? (
                <span className="ai-status-text" style={{ color: "#ffffff" }}>
                  <span className="ai-loading-spinner"></span>
                  Analyzing Library...
                </span>
              ) : (
                "🪄 Generate AI Insights"
              )}
            </button>
          </div>

          {insightsError && (
            <div style={{ padding: "0.75rem 1rem", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", borderRadius: "var(--radius-md)", marginBottom: "1rem", fontSize: "0.875rem" }}>
              ⚠️ {insightsError}
            </div>
          )}

          {aiInsights ? (
            <div style={{ color: "var(--text-primary)" }}>
              {renderMarkdown(aiInsights)}
            </div>
          ) : (
            <div className="empty-state" style={{ borderStyle: "dashed" }}>
              <span style={{ fontSize: "3rem" }}>🪄</span>
              <h3>No insights generated yet</h3>
              <p>
                {books.length === 0 
                  ? "Add books to your library first so the AI can analyze your reading profile!" 
                  : "Click the 'Generate AI Insights' button above to analyze your bookshelf."}
              </p>
              {books.length > 0 && (
                <button className="btn btn-primary" onClick={generateAIInsights} disabled={generatingInsights}>
                  Analyze My Shelf
                </button>
              )}
            </div>
          )}
        </main>
      )}

      {/* VIEW PANEL 3: FAVORITE AUTHORS */}
      {activeView === "authors" && (
        <main className="authors-container">
          {/* Add Author Box */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h2>My Favorite Authors</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Add authors to track their bibliographies, view details, and instantly add their books to your want-to-read list.
            </p>
            <form onSubmit={handleAddAuthor} className="author-add-box">
              <input
                type="text"
                className="form-input"
                placeholder="Enter author's name (e.g. Brandon Sanderson)..."
                value={newAuthorName}
                onChange={(e) => setNewAuthorName(e.target.value)}
                style={{ flexGrow: 1 }}
              />
              <button type="submit" className="btn btn-primary">
                ➕ Add Author
              </button>
            </form>
          </div>

          {/* Authors List */}
          {favoriteAuthors.length > 0 ? (
            <div className="author-card-list">
              {favoriteAuthors.map((author) => (
                <div key={author.id} className="author-row-card">
                  <div className="author-row-header">
                    <h3 className="author-name-title">
                      <span>👤</span>
                      {author.name}
                    </h3>
                    <button 
                      className="btn btn-danger" 
                      onClick={() => handleRemoveAuthor(author.id)}
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                    >
                      Remove
                    </button>
                  </div>

                  {author.loading && (
                    <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-secondary)" }}>
                      <span className="ai-status-text" style={{ justifyContent: "center" }}>
                        <span className="ai-loading-spinner"></span>
                        Fetching bibliography for {author.name}...
                      </span>
                    </div>
                  )}

                  {author.error && (
                    <div style={{ color: "#f87171", fontSize: "0.8rem", padding: "0.5rem 0" }}>
                      ⚠️ {author.error}{" "}
                      <button 
                        type="button" 
                        onClick={() => fetchAuthorBooks(author.name, author.id)}
                        style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {author.books && author.books.length > 0 ? (
                    <div className="author-books-scroll">
                      {author.books.map((b) => {
                        const info = b.volumeInfo;
                        const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
                        const pubYear = info.description && info.description.includes("Published:") 
                          ? info.description.split(".")[0] 
                          : "Popular release";
                          
                        return (
                          <div key={b.id} className="author-book-mini-card">
                            <div className="author-book-cover-container">
                              {cover ? (
                                <img src={cover} className="author-book-cover" alt="cover" />
                              ) : (
                                <div style={{ fontSize: "2rem" }}>📖</div>
                              )}
                            </div>
                            <div className="author-book-info">
                              <div className="author-book-title" title={info.title}>{info.title}</div>
                              <div className="author-book-year">{pubYear}</div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary author-book-btn"
                              onClick={() => handleAddAuthorBookToShelf(info, author.name)}
                            >
                              ➕ Want to Read
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    !author.loading && !author.error && (
                      <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        No books fetched yet. Click retry above or re-add the author.
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ borderStyle: "dashed" }}>
              <span style={{ fontSize: "3rem" }}>👤</span>
              <h3>No favorite authors added yet</h3>
              <p>Type in an author name above to track their bibliography and add their works directly to your shelves!</p>
            </div>
          )}
        </main>
      )}

      {/* EMBEDDED MODALS */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => { setAuthOpen(false); setAuthInitialMode("signin"); }}
        onAuthSuccess={loadData}
        initialMode={authInitialMode}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={loadData}
      />

      <AddBookModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onBookAdded={loadData}
      />

      {selectedBook && (
        <BookDetailsModal
          book={selectedBook}
          isOpen={!!selectedBook}
          onClose={() => setSelectedBook(null)}
          onBookUpdated={loadData}
        />
      )}
    </div>
  );
}

// Private Markdown Parser helpers
function renderMarkdown(text: string) {
  if (!text) return null;
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
