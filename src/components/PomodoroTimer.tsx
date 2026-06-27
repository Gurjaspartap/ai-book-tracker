"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, Square, X } from "lucide-react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { getSupabaseClient } from "@/utils/supabaseClient";

import { getBooks } from "@/utils/booksStore";
import { Book } from "@/utils/types";

interface PomodoroTimerProps {
  bookId?: string; // Optional book id if tied to a book
  bookTitle?: string; // Optional book title for display
  onClose?: () => void;
  onSelectBookRequest?: () => void; // Triggered when "Select Book" is clicked
  onClearBook?: () => void; // Triggered when clearing the selection
}

export default function PomodoroTimer({ bookId, bookTitle, onClose, onSelectBookRequest, onClearBook }: PomodoroTimerProps) {
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  
  // Inline editing state
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [inputMinutes, setInputMinutes] = useState(durationMinutes.toString());
  
  const { width, height } = useWindowSize();
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize Audio Context on user interaction to bypass autoplay policies
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playAlarm = useCallback(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // Play a joyful 3-note alarm
    const playNote = (frequency: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, startTime + duration);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playNote(440, now, 0.5); // A4
    playNote(554.37, now + 0.3, 0.5); // C#5
    playNote(659.25, now + 0.6, 1.0); // E5
  }, []);

  const logSession = async (secondsElapsed: number) => {
    const minutesToLog = Math.round(secondsElapsed / 60);
    if (minutesToLog < 1) return; // Don't log if less than a minute

    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      await supabase.from("reading_sessions").insert({
        user_id: user.id,
        book_id: bookId || null,
        duration_minutes: minutesToLog,
      });
      console.log(`Logged ${minutesToLog} minutes of reading.`);
    } catch (error) {
      console.error("Failed to log reading session:", error);
    }
  };

  // Load state from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("pomodoro_timer_state");
        if (stored) {
          const state = JSON.parse(stored);
          if (state.durationMinutes) setDurationMinutes(state.durationMinutes);
          setIsActive(state.isActive || false);
          setIsFinished(state.isFinished || false);
          if (state.sessionStartTime) setSessionStartTime(state.sessionStartTime);
          
          if (state.isActive && state.sessionStartTime) {
            const secondsElapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
            const newTimeLeft = (state.durationMinutes * 60) - secondsElapsed;
            if (newTimeLeft > 0) {
              setTimeLeft(newTimeLeft);
            } else {
              setTimeLeft(0);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load timer state", e);
      }
      setHasHydrated(true);
    }
  }, []);

  // Save state to local storage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined" && hasHydrated) {
      const state = {
        isActive,
        sessionStartTime,
        durationMinutes,
        isFinished
      };
      localStorage.setItem("pomodoro_timer_state", JSON.stringify(state));
    }
  }, [isActive, sessionStartTime, durationMinutes, isFinished, hasHydrated]);

  // Reset timer when duration changes, if not active
  useEffect(() => {
    if (!isActive && hasHydrated) {
      setTimeLeft(durationMinutes * 60);
    }
  }, [durationMinutes, isActive, hasHydrated]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      // Timer completed
      setIsActive(false);
      setIsFinished(true);
      playAlarm();
      
      if (sessionStartTime) {
        const secondsElapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        logSession(secondsElapsed);
      }
      setSessionStartTime(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, sessionStartTime, playAlarm, bookId]);

  const toggleTimer = () => {
    initAudio();
    if (!isActive) {
      if (!sessionStartTime) setSessionStartTime(Date.now());
      setIsActive(true);
    } else {
      setIsActive(false);
    }
  };

  const handleStop = () => {
    setIsActive(false);
    if (sessionStartTime && !isFinished) {
      const secondsElapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      logSession(secondsElapsed);
    }
    setTimeLeft(durationMinutes * 60);
    setSessionStartTime(null);
    setIsFinished(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleTimeSubmit = () => {
    let newMins = parseInt(inputMinutes, 10);
    if (isNaN(newMins) || newMins < 1) newMins = 1;
    if (newMins > 999) newMins = 999;
    
    setDurationMinutes(newMins);
    setTimeLeft(newMins * 60);
    setInputMinutes(newMins.toString());
    setIsEditingTime(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTimeSubmit();
    }
    if (e.key === 'Escape') {
      setIsEditingTime(false);
      setInputMinutes(durationMinutes.toString());
    }
  };

  if (isFinished) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(5px)" }}>
        <Confetti width={width} height={height} numberOfPieces={300} recycle={false} />
        <div style={{ background: "var(--bg-surface-elevated)", padding: "2rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", textAlign: "center", maxWidth: "350px", width: "90%", boxShadow: "var(--shadow-lg)" }}>
          <h2 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>Time's Up!</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            Great job! You completed your {durationMinutes} minute reading session.
          </p>
          <div style={{ fontSize: "4rem", margin: "1rem 0" }}>🎉</div>
          <button
            onClick={handleStop}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
          >
            <Square size={16} /> Finish & Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-surface-elevated)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius-lg)",
      padding: "1.5rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      boxShadow: "var(--shadow-md)",
      width: "100%",
      maxWidth: "280px"
    }}>
      {onClose && (
        <button 
          onClick={onClose}
          style={{ position: "absolute", top: "0.75rem", right: "0.75rem", background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      )}
      
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        Focus Timer
      </div>
      
      <div 
        style={{ fontSize: "3rem", fontWeight: "bold", fontFamily: "monospace", margin: "1rem 0 0.5rem", color: "var(--text-primary)", cursor: isActive ? "default" : "pointer" }}
        onClick={() => { if (!isActive) { setIsEditingTime(true); setInputMinutes(durationMinutes.toString()); } }}
        title={isActive ? "" : "Click to edit time"}
      >
        {isEditingTime && !isActive ? (
          <input
            type="number"
            value={inputMinutes}
            onChange={(e) => setInputMinutes(e.target.value)}
            onBlur={handleTimeSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{ width: "120px", fontSize: "3rem", fontWeight: "bold", fontFamily: "monospace", background: "rgba(0,0,0,0.3)", border: "1px solid var(--color-primary)", color: "var(--text-primary)", textAlign: "center", borderRadius: "var(--radius-md)" }}
          />
        ) : (
          formatTime(timeLeft)
        )}
      </div>

      {onSelectBookRequest && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginBottom: "1rem" }}>
          {bookId ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem", background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }} title={bookTitle || "Selected Book"}>
                📚 {bookTitle && bookTitle.length > 20 ? bookTitle.substring(0, 20) + '...' : bookTitle || "Selected Book"}
              </span>
              <button onClick={onClearBook} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginLeft: "0.5rem" }} title="Clear book">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button 
              onClick={onSelectBookRequest}
              style={{ width: "100%", padding: "0.65rem", background: "rgba(255,255,255,0.05)", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: "0.85rem", cursor: "pointer", transition: "var(--transition-fast)" }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
            >
              + Select Book
            </button>
          )}
        </div>
      )}
      
      <div style={{ display: "flex", gap: "1rem", marginTop: isActive ? "1rem" : "0.5rem" }}>
        <button
          onClick={toggleTimer}
          className="btn btn-primary"
          style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {isActive ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: "4px" }} />}
        </button>
        
        <button
          onClick={handleStop}
          disabled={timeLeft === durationMinutes * 60 && !isActive}
          className="btn btn-danger"
          title="Stop & Log Time"
          style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: (timeLeft === durationMinutes * 60 && !isActive) ? 0.5 : 1 }}
        >
          <Square size={20} />
        </button>
      </div>
      
      {/* Subtle progress indicator */}
      <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", marginTop: "1.5rem", overflow: "hidden" }}>
        <div style={{ height: "100%", background: "var(--color-primary)", width: `${((durationMinutes * 60 - timeLeft) / (durationMinutes * 60)) * 100}%`, transition: "width 1s linear" }} />
      </div>
    </div>
  );
}
