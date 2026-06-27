"use client";

import React, { useEffect, useState } from "react";
import { getSupabaseClient } from "@/utils/supabaseClient";

interface ReadingSession {
  id: string;
  duration_minutes: number;
  created_at: string;
}

export default function ReadingStatsDashboard() {
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase not connected. Stats unavailable offline.");
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Please sign in to view reading stats.");
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("reading_sessions")
          .select("id, duration_minutes, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSessions(data || []);
      } catch (err: any) {
        console.error("Failed to load stats:", err);
        setError("Failed to load reading sessions.");
      } finally {
        setLoading(false);
      }
    }
    
    loadStats();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
        Loading reading stats...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#f87171" }}>
        ⚠️ {error}
      </div>
    );
  }

  // Calculate stats
  const totalMinutes = sessions.reduce((acc, curr) => acc + curr.duration_minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Calculate current streak
  let currentStreak = 0;
  let maxStreak = 0;
  
  if (sessions.length > 0) {
    // Group by unique day string (YYYY-MM-DD local time)
    const activeDays = new Set<string>();
    sessions.forEach(s => {
      const dateStr = new Date(s.created_at).toLocaleDateString("en-CA"); // YYYY-MM-DD
      activeDays.add(dateStr);
    });

    const sortedDays = Array.from(activeDays).sort().reverse(); // newest first
    
    // Check if today or yesterday is the start of the streak
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA");
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString("en-CA");

    let streakCounter = 0;
    let expectedDate = new Date();

    if (activeDays.has(todayStr)) {
       // Streak active today
       expectedDate = today;
    } else if (activeDays.has(yesterdayStr)) {
       // Streak active yesterday, hasn't broken yet
       expectedDate = yesterday;
    }

    if (activeDays.has(todayStr) || activeDays.has(yesterdayStr)) {
      // Trace backwards
      let dateCursor = new Date(expectedDate);
      while(true) {
        const cursorStr = dateCursor.toLocaleDateString("en-CA");
        if (activeDays.has(cursorStr)) {
          streakCounter++;
          dateCursor.setDate(dateCursor.getDate() - 1); // go back one day
        } else {
          break;
        }
      }
      currentStreak = streakCounter;
    }

    // Rough max streak calculation (can be optimized but fine for now)
    let tempMax = 0;
    let tempCurr = 0;
    let prevDateStr: string | null = null;
    
    // sortedDays is descending
    const ascDays = [...sortedDays].reverse(); // ascending dates
    ascDays.forEach(dayStr => {
      if (!prevDateStr) {
        tempCurr = 1;
      } else {
        const d1 = new Date(prevDateStr);
        const d2 = new Date(dayStr);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempCurr++;
        } else {
          tempCurr = 1;
        }
      }
      if (tempCurr > tempMax) tempMax = tempCurr;
      prevDateStr = dayStr;
    });
    maxStreak = tempMax;
  }

  return (
    <div className="stats-dashboard" style={{ marginTop: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        
        <div style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", borderRadius: "var(--radius-lg)", padding: "1.5rem", color: "white", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Streak</h3>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🔥</span> {currentStreak} <span style={{ fontSize: "1rem", fontWeight: "normal", opacity: 0.8 }}>days</span>
          </div>
          <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.8rem", opacity: 0.8 }}>Longest: {maxStreak} days</p>
        </div>

        <div style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", borderRadius: "var(--radius-lg)", padding: "1.5rem", color: "white", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Time Read</h3>
          <div style={{ fontSize: "2.5rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>⏱️</span> {totalHours} <span style={{ fontSize: "1rem", fontWeight: "normal", opacity: 0.8 }}>hours</span>
          </div>
          <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.8rem", opacity: 0.8 }}>({totalMinutes} minutes)</p>
        </div>
        
      </div>

      <div style={{ background: "var(--bg-card)", padding: "1.5rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)" }}>
        <h3 style={{ margin: "0 0 1rem 0" }}>Recent Sessions</h3>
        {sessions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sessions.slice(0, 5).map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem", background: "var(--bg-body)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  {new Date(s.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontWeight: "600", color: "var(--color-primary)" }}>
                  +{s.duration_minutes} min
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No reading sessions logged yet. Start the Pomodoro timer to log your reading!</p>
        )}
      </div>
    </div>
  );
}
