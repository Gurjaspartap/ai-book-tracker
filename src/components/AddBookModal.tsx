"use client";

import React, { useState } from "react";
import { addBook } from "@/utils/booksStore";
import { Book } from "@/utils/types";

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookAdded: () => void;
}

export default function AddBookModal({ isOpen, onClose, onBookAdded }: AddBookModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // Book detail inputs
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [status, setStatus] = useState<Book["status"]>("will-read");
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError(null);
    setSearchResults([]);

    try {
      const res = await fetch(
        `/api/books?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Search request failed.");
      }
      setSearchResults(data.items || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch book search results. Please try again or fill manually.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectBook = (googleBook: any) => {
    const info = googleBook.volumeInfo;
    
    // Auto-fill form values
    setTitle(info.title || "");
    setAuthor(info.authors ? info.authors.join(", ") : "");
    setDescription(info.description || "");
    
    // Replace http with https for secure loading
    let imgUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
    if (imgUrl.startsWith("http://")) {
      imgUrl = imgUrl.replace("http://", "https://");
    }
    setCoverUrl(imgUrl);
    setTotalPages(info.pageCount || 0);
    setCategoriesInput(info.categories ? info.categories.join(", ") : "");
    
    setManualMode(true);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Book Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const categories = categoriesInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    try {
      await addBook({
        title,
        author,
        description,
        cover_url: coverUrl,
        categories,
        status,
        current_page: 0,
        total_pages: totalPages,
        notes: "",
      });

      // Reset states
      setTitle("");
      setAuthor("");
      setDescription("");
      setCoverUrl("");
      setCategoriesInput("");
      setTotalPages(0);
      setStatus("will-read");
      setSearchQuery("");
      setManualMode(false);
      
      onBookAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add book.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px" }}>
        <div className="modal-header">
          <h2 className="modal-title">Add New Book</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{ color: "#f87171", padding: "0.5rem 0", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          {!manualMode ? (
            <div className="book-search-container">
              <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem" }}>
                <div style={{ position: "relative", flexGrow: 1 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter book name (even with typos)..."
                    style={{ paddingLeft: "1rem" }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={searching}>
                  {searching ? "Searching..." : "Search"}
                </button>
              </form>

              {searching && (
                <div style={{ textAlign: "center", padding: "1rem" }}>
                  <span className="ai-status-text" style={{ justifyContent: "center" }}>
                    <span className="ai-loading-spinner"></span>
                    Searching Google Books database...
                  </span>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="search-results-list">
                  {searchResults.map((item) => {
                    const info = item.volumeInfo;
                    const authors = info.authors ? info.authors.join(", ") : "Unknown Author";
                    let thumb = info.imageLinks?.smallThumbnail || info.imageLinks?.thumbnail || "";
                    if (thumb.startsWith("http://")) thumb = thumb.replace("http://", "https://");

                    return (
                      <div
                        key={item.id}
                        className="search-result-item"
                        onClick={() => handleSelectBook(item)}
                      >
                        {thumb ? (
                          <img src={thumb} className="search-result-cover" alt="cover" />
                        ) : (
                          <div className="search-result-cover" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "var(--text-muted)", border: "1px solid var(--border-color)" }}>📖</div>
                        )}
                        <div className="search-result-info">
                          <div className="search-result-title">{info.title}</div>
                          <div className="search-result-author">{authors}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>or </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}
                  onClick={() => setManualMode(true)}
                >
                  Enter details manually
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Book Title *</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. The Hobbit"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Author(s)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="e.g. J.R.R. Tolkien"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Pages</label>
                  <input
                    type="number"
                    className="form-input"
                    value={totalPages || ""}
                    onChange={(e) => setTotalPages(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 310"
                    min="0"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cover Image URL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://example.com/cover.jpg"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tags / Genres (comma separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={categoriesInput}
                    onChange={(e) => setCategoriesInput(e.target.value)}
                    placeholder="Fantasy, Fiction, Classic"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reading Status</label>
                <select
                  className="filter-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Book["status"])}
                  style={{ width: "100%" }}
                >
                  <option value="will-read">Want to Read</option>
                  <option value="reading">Currently Reading</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Short Description</label>
                <textarea
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of the book..."
                  rows={3}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setManualMode(false)}
                >
                  Back to Search
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={loading}
                >
                  {loading ? "Adding..." : "Add Book"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
