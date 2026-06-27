"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Timer, Moon, Sun, PanelRightClose, PanelRightOpen } from "lucide-react";
import { getSupabaseClient } from "@/utils/supabaseClient";
import { Book } from "@/utils/types";
import { ReactReader } from "react-reader";
import PomodoroTimer from "@/components/PomodoroTimer";

export default function ReadBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const router = useRouter();
  const { bookId } = use(params);
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // EPUB State
  const [location, setLocation] = useState<string | number>(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Sidebar / Timer State
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    async function loadBook() {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError("Database not connected.");
          setLoading(false);
          return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("id", bookId)
          .single();

        if (error) throw error;
        setBook(data);
        
        if (data.current_page) {
          // Attempt to restore location for epub
          setLocation(data.current_page.toString());
        }
      } catch (err: any) {
        console.error("Error fetching book:", err);
        setError("Failed to load book file.");
      } finally {
        setLoading(false);
      }
    }
    loadBook();
  }, [bookId, router]);

  // Sync progress back to db occasionally for EPUB
  const updateProgress = async (pageOrLocation: number | string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      
      let pageNum = typeof pageOrLocation === 'number' ? pageOrLocation : parseInt(pageOrLocation.toString(), 10) || 0;
      await supabase
        .from("books")
        .update({ current_page: pageNum })
        .eq("id", bookId);
    } catch (err) {
      console.error("Failed to update progress", err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", background: "var(--bg-main)" }}>
        Loading reader...
      </div>
    );
  }

  if (error || !book || !book.file_url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", alignItems: "center", justifyContent: "center", gap: "1rem", background: "var(--bg-main)" }}>
        <p style={{ color: "#ef4444" }}>{error || "No readable file found for this book."}</p>
        <button onClick={() => router.back()} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  const isEpub = book.file_type?.toLowerCase().includes("epub") || book.file_url.toLowerCase().endsWith(".epub");

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: isDarkMode ? "#111827" : "#f9fafb",
      color: isDarkMode ? "#f9fafb" : "#111827"
    }}>
      {/* Top Navigation */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        borderBottom: `1px solid ${isDarkMode ? '#1f2937' : '#e5e7eb'}`,
        background: isDarkMode ? "#111827" : "#ffffff",
        color: isDarkMode ? "#f9fafb" : "#111827"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button 
            onClick={() => router.back()} 
            style={{ padding: "0.5rem", borderRadius: "50%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "inherit" }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontWeight: 600, fontSize: "1.1rem", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "400px" }}>
            {book.title}
          </h1>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isEpub && (
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              title="Toggle Dark Mode"
              style={{ padding: "0.5rem", borderRadius: "50%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "inherit" }}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
          
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle Timer Sidebar"
            style={{ 
              padding: "0.5rem", 
              borderRadius: "50%", 
              background: showSidebar ? (isDarkMode ? "#312e81" : "#e0e7ff") : "transparent",
              color: showSidebar ? (isDarkMode ? "#a5b4fc" : "#4338ca") : "inherit",
              border: "none", 
              cursor: "pointer", 
              display: "flex", 
              alignItems: "center" 
            }}
          >
            {showSidebar ? <PanelRightClose size={20} /> : <Timer size={20} />}
          </button>
        </div>
      </div>

      {/* Main Content Area: Reader + Sidebar */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* Book Reader View */}
        <div style={{ flex: 1, position: "relative", transition: "all 0.3s ease" }}>
          {isEpub ? (
            <div style={{ height: "100%", width: "100%", position: "relative", filter: isDarkMode ? 'invert(1) hue-rotate(180deg)' : 'none', background: isDarkMode ? '#111' : '#fff' }}>
              <ReactReader
                url={book.file_url}
                location={location}
                locationChanged={(loc: string) => {
                  setLocation(loc);
                  updateProgress(loc);
                }}
                epubOptions={{
                  flow: "scrolled",
                  manager: "continuous"
                }}
              />
            </div>
          ) : (
            /* Native PDF Viewer via iframe */
            <iframe 
              src={book.file_url + "#toolbar=0"} 
              style={{ width: "100%", height: "100%", border: "none" }}
              title={book.title}
            />
          )}
        </div>

        {/* Slide-out Sidebar for Timer */}
        <div style={{
          width: showSidebar ? "320px" : "0px",
          opacity: showSidebar ? 1 : 0,
          overflow: "hidden",
          transition: "all 0.3s ease",
          borderLeft: showSidebar ? `1px solid ${isDarkMode ? '#1f2937' : '#e5e7eb'}` : "none",
          background: "var(--bg-main)",
          color: "var(--text-primary)"
        }}>
          <div style={{ padding: "1.5rem", height: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
             {showSidebar && (
               <div style={{ width: "100%", maxWidth: "240px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                 <h2 style={{ fontWeight: 600, fontSize: "1.25rem", marginBottom: "1.5rem", textAlign: "center" }}>Focus Session</h2>
                 <PomodoroTimer bookId={book.id} />
               </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}
