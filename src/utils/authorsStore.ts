import { FavoriteAuthor } from "./types";
import { getSupabaseClient } from "./supabaseClient";

const LOCAL_STORAGE_KEY = "book-tracker-favorite-authors";

function generateLocalId() {
  return "local_" + Math.random().toString(36).substring(2, 15);
}

// Fetch all favorite authors
export async function getFavoriteAuthors(): Promise<FavoriteAuthor[]> {
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        const { data, error } = await supabase
          .from("favorite_authors")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Error fetching authors from Supabase:", error);
          return getLocalAuthors();
        }
        return (data || []) as FavoriteAuthor[];
      }
    }
  } catch (err) {
    console.error("Error in getFavoriteAuthors:", err);
  }
  return getLocalAuthors();
}

// Get authors from LocalStorage only
export function getLocalAuthors(): FavoriteAuthor[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Error parsing local authors:", e);
    return [];
  }
}

// Save authors to LocalStorage
export function saveLocalAuthors(authors: FavoriteAuthor[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(authors));
}

// Add a favorite author
export async function addFavoriteAuthor(
  authorData: Omit<FavoriteAuthor, "id" | "created_at" | "updated_at">
): Promise<FavoriteAuthor> {
  const timestamp = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        const newAuthor = {
          name: authorData.name,
          bio: authorData.bio || "",
          user_id: user.id,
          created_at: timestamp,
          updated_at: timestamp,
        };

        const { data, error } = await supabase
          .from("favorite_authors")
          .insert([newAuthor])
          .select()
          .single();

        if (error) {
          console.error("Error adding author to Supabase:", error);
          throw error;
        }
        return data as FavoriteAuthor;
      }
    }
  } catch (err) {
    console.error("Supabase addFavoriteAuthor failed, falling back to local storage:", err);
  }

  // Local storage fallback
  const localAuthors = getLocalAuthors();
  const newAuthor: FavoriteAuthor = {
    ...authorData,
    id: generateLocalId(),
    created_at: timestamp,
    updated_at: timestamp,
  };
  localAuthors.push(newAuthor);
  saveLocalAuthors(localAuthors);
  return newAuthor;
}

// Delete a favorite author
export async function deleteFavoriteAuthor(authorId: string): Promise<void> {
  if (!authorId.startsWith("local_")) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          const { error } = await supabase
            .from("favorite_authors")
            .delete()
            .eq("id", authorId);
          if (error) {
            console.error("Error deleting author from Supabase:", error);
            throw error;
          }
          return;
        }
      }
    } catch (err) {
      console.error("Supabase deleteFavoriteAuthor failed, falling back to local storage:", err);
    }
  }

  // Local storage fallback
  const localAuthors = getLocalAuthors();
  const filtered = localAuthors.filter((a) => a.id !== authorId);
  saveLocalAuthors(filtered);
}

// Sync local authors to cloud
export async function syncLocalAuthorsToCloud(): Promise<number> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return 0;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return 0;

    const localAuthors = getLocalAuthors();
    if (localAuthors.length === 0) return 0;

    let syncCount = 0;
    for (const author of localAuthors) {
      try {
        const newAuthor = {
          name: author.name,
          bio: author.bio || "",
          user_id: user.id,
          created_at: author.created_at || new Date().toISOString(),
          updated_at: author.updated_at || new Date().toISOString(),
        };

        const { error } = await supabase.from("favorite_authors").insert([newAuthor]);
        if (!error) syncCount++;
      } catch (err) {
        console.error("Failed to sync author:", author.name, err);
      }
    }

    if (syncCount > 0) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    return syncCount;
  } catch (err) {
    console.error("Error syncing local authors to cloud:", err);
    return 0;
  }
}
