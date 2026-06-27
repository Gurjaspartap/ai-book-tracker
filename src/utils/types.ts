export interface Book {
  id: string;
  user_id?: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  categories: string[];
  status: "will-read" | "reading" | "completed" | "not-completed";
  current_page: number;
  total_pages: number;
  rating?: number; // 1 to 5
  notes: string;
  created_at: string;
  updated_at: string;
  file_url?: string | null;
  file_type?: string | null;
  extracted_text_url?: string | null;
  language?: string | null;
}

export interface FavoriteAuthor {
  id: string;
  user_id?: string;
  name: string;
  bio?: string;
  books?: any[];
  loading?: boolean;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReadingSession {
  id: string;
  user_id: string;
  book_id?: string; // Optional because the user can start a timer without a book selected
  duration_minutes: number;
  created_at: string;
}
