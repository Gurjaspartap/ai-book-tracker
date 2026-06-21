import { Book } from "./types";
import { getSupabaseClient } from "./supabaseClient";

const LOCAL_STORAGE_KEY = "book-tracker-books";

// Helper to generate a random ID for local books
function generateLocalId() {
  return "local_" + Math.random().toString(36).substring(2, 15);
}

// Fetch all books
export async function getBooks(): Promise<Book[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching books from Supabase:", error);
        // Fallback to local storage if DB query fails
        return getLocalBooks();
      }
      return data as Book[];
    }
  }
  return getLocalBooks();
}

// Get books from LocalStorage only
export function getLocalBooks(): Book[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Error parsing local books:", e);
    return [];
  }
}

// Save books to LocalStorage
export function saveLocalBooks(books: Book[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(books));
}

// Add a book
export async function addBook(
  bookData: Omit<Book, "id" | "created_at" | "updated_at">
): Promise<Book> {
  const timestamp = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        const newBook = {
          ...bookData,
          user_id: user.id,
          created_at: timestamp,
          updated_at: timestamp,
        };

        const { data, error } = await supabase
          .from("books")
          .insert([newBook])
          .select()
          .single();

        if (error) {
          console.error("Error adding book to Supabase:", error);
          throw error;
        }
        return data as Book;
      }
    }
  } catch (err) {
    console.error("Supabase addBook failed, falling back to local storage:", err);
  }

  // Local storage mode
  const localBooks = getLocalBooks();
  const newBook: Book = {
    ...bookData,
    id: generateLocalId(),
    created_at: timestamp,
    updated_at: timestamp,
  };
  localBooks.unshift(newBook);
  saveLocalBooks(localBooks);
  return newBook;
}

// Update a book
export async function updateBook(
  bookId: string,
  updates: Partial<Book>
): Promise<Book> {
  const timestamp = new Date().toISOString();

  if (!bookId.startsWith("local_")) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (user) {
          const { data, error } = await supabase
            .from("books")
            .update({
              ...updates,
              updated_at: timestamp,
            })
            .eq("id", bookId)
            .select()
            .single();

          if (error) {
            console.error("Error updating book in Supabase:", error);
            throw error;
          }
          return data as Book;
        }
      }
    } catch (err) {
      console.error("Supabase updateBook failed, falling back to local storage:", err);
    }
  }

  // Local storage mode (or fallback for local books created before logging in)
  const localBooks = getLocalBooks();
  const index = localBooks.findIndex((b) => b.id === bookId);
  if (index === -1) {
    throw new Error("Book not found in local storage");
  }

  const updatedBook: Book = {
    ...localBooks[index],
    ...updates,
    updated_at: timestamp,
  };

  localBooks[index] = updatedBook;
  // Keep order sorted by updated_at (or preserve original order, let's preserve but updated_at changes)
  saveLocalBooks(localBooks);
  return updatedBook;
}

// Delete a book
export async function deleteBook(bookId: string): Promise<void> {
  if (!bookId.startsWith("local_")) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          const { error } = await supabase.from("books").delete().eq("id", bookId);
          if (error) {
            console.error("Error deleting book from Supabase:", error);
            throw error;
          }
          return;
        }
      }
    } catch (err) {
      console.error("Supabase deleteBook failed, falling back to local storage:", err);
    }
  }

  // Local storage mode
  const localBooks = getLocalBooks();
  const filtered = localBooks.filter((b) => b.id !== bookId);
  saveLocalBooks(filtered);
}

// Sync Local Books to Supabase after Login
export async function syncLocalBooksToCloud(): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return 0;

  const localBooks = getLocalBooks();
  if (localBooks.length === 0) return 0;

  let syncCount = 0;
  for (const book of localBooks) {
    try {
      const newBook = {
        title: book.title,
        author: book.author,
        description: book.description,
        cover_url: book.cover_url,
        categories: book.categories,
        status: book.status,
        current_page: book.current_page,
        total_pages: book.total_pages,
        rating: book.rating,
        notes: book.notes,
        user_id: user.id,
        created_at: book.created_at,
        updated_at: book.updated_at,
      };

      const { error } = await supabase.from("books").insert([newBook]);
      if (!error) syncCount++;
    } catch (err) {
      console.error("Failed to sync book:", book.title, err);
    }
  }

  // Clear local storage after successful sync (or we can preserve it as backup, let's empty it)
  if (syncCount > 0) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  return syncCount;
}
