"use client";

import React from "react";
import { Book } from "@/utils/types";

interface BookCardProps {
  book: Book;
  onClick: () => void;
}

export default function BookCard({ book, onClick }: BookCardProps) {
  const { title, author, cover_url, status, current_page, total_pages, rating, categories } = book;

  // Calculate reading progress percentage
  const progressPercent = total_pages > 0 ? Math.min(100, Math.round((current_page / total_pages) * 100)) : 0;

  // Status mapping to labels
  const statusLabels = {
    "will-read": "Want to Read",
    "reading": "Reading",
    "completed": "Completed",
    "not-completed": "Not Completed",
  };

  // Render rating stars helper
  const renderStars = (ratingVal?: number) => {
    if (!ratingVal) return null;
    return (
      <div className="card-rating" title={`${ratingVal} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ color: i < ratingVal ? "#fbbf24" : "var(--text-muted)", fontSize: "0.85rem" }}>
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="book-card" onClick={onClick}>
      <div className="card-cover">
        {cover_url ? (
          <>
            <div className="cover-bg-glow" style={{ backgroundImage: `url(${cover_url})` }} />
            <img src={cover_url} className="cover-image" alt={`${title} cover`} loading="lazy" />
          </>
        ) : (
          <div className="no-cover-placeholder">
            <span style={{ fontSize: "2.5rem" }}>📖</span>
            <span style={{ fontSize: "0.75rem", fontWeight: "bold" }}>NO COVER</span>
          </div>
        )}
        <span className={`card-badge ${status}`}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="card-body">
        <h3 className="card-title" title={title}>{title}</h3>
        <p className="card-author" title={author}>{author || "Unknown Author"}</p>
        
        {rating && rating > 0 && (
          <div style={{ marginTop: "0.25rem" }}>{renderStars(rating)}</div>
        )}

        {categories && categories.length > 0 && (
          <div className="card-tags">
            {categories.slice(0, 3).map((tag, idx) => (
              <span key={idx} className="tag-pill">
                {tag}
              </span>
            ))}
            {categories.length > 3 && (
              <span className="tag-pill" style={{ opacity: 0.6 }}>
                +{categories.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {status !== "will-read" && total_pages > 0 && (
        <div className="card-footer">
          <div className="progress-info">
            <span>Progress</span>
            <span>{progressPercent}% ({current_page}/{total_pages} pg)</span>
          </div>
          <div className="progress-track">
            <div 
              className={`progress-bar ${status === "completed" ? "completed" : status === "not-completed" ? "not-completed" : ""}`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
