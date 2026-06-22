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
