"use client";

import React, { useState, useEffect } from "react";
import { Book } from "@/utils/types";
import { getBooks, getLocalBooks } from "@/utils/booksStore";
import { getSupabaseClient } from "@/utils/supabaseClient";

// Import components
import BookCard from "@/components/BookCard";
import AddBookModal from "@/components/AddBookModal";
import BookDetailsModal from "@/components/BookDetailsModal";
import SettingsModal from "@/components/SettingsModal";
import AuthModal from "@/components/AuthModal";

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Sorting State
  const [activeTab, setActiveTab] = useState<"all" | "will-read" | "reading" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");

  // User State
  const [user, setUser] = useState<any>(null);
  const [supabaseActive, setSupabaseActive] = useState(false);

  // Modals state
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // Load books and auth state
  const loadData = async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        setSupabaseActive(true);
        const { data: sessionData } = await supabase.auth.getSession();
        setUser(sessionData?.session?.user || null);
      } else {
        setSupabaseActive(false);
        setUser(null);
      }
      
      const library = await getBooks();
      setBooks(library);
    } catch (err) {
      console.error("Failed to load data:", err);
      // Fallback to local storage
      setBooks(getLocalBooks());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for auth changes
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          setUser(session?.user || null);
          const library = await getBooks();
          setBooks(library);
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

  // Get unique tags/genres from all books
  const uniqueTags = Array.from(
    new Set(books.flatMap((b) => b.categories || []))
  ).sort();

  // Filter and sort book array
  const filteredBooks = books
    .filter((book) => {
      // 1. Filter by Status Tab
      if (activeTab !== "all" && book.status !== activeTab) return false;

      // 2. Filter by Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = book.title?.toLowerCase().includes(query);
        const matchesAuthor = book.author?.toLowerCase().includes(query);
        const matchesNotes = book.notes?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesAuthor && !matchesNotes) return false;
      }

      // 3. Filter by Category Tag
      if (selectedTag && (!book.categories || !book.categories.includes(selectedTag))) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort logic
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
      // Default: sort by updated_at
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
          <h1>AuraBooks</h1>
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
              <button className="btn btn-secondary" onClick={() => setAuthOpen(true)}>
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
        <div className="metric-card total" onClick={() => setActiveTab("all")} style={{ cursor: "pointer" }}>
          <span className="metric-label">Total Books</span>
          <span className="metric-value">{totalCount}</span>
        </div>
        <div className="metric-card will-read" onClick={() => setActiveTab("will-read")} style={{ cursor: "pointer" }}>
          <span className="metric-label">Want to Read</span>
          <span className="metric-value">{willReadCount}</span>
        </div>
        <div className="metric-card reading" onClick={() => setActiveTab("reading")} style={{ cursor: "pointer" }}>
          <span className="metric-label">Reading</span>
          <span className="metric-value">{readingCount}</span>
        </div>
        <div className="metric-card completed" onClick={() => setActiveTab("completed")} style={{ cursor: "pointer" }}>
          <span className="metric-label">Completed</span>
          <span className="metric-value">{completedCount}</span>
        </div>
      </section>

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

      {/* EMBEDDED MODALS */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={loadData}
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
