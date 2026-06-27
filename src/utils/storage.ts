import { getSupabaseClient } from "./supabaseClient";

/**
 * Uploads a book file (PDF/EPUB) to Supabase Storage under the 'book-files' bucket
 * and returns the public access URL.
 */
export async function uploadBookFile(file: File, bookId: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Cloud file storage requires Supabase Cloud Mode.");
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase();
  if (!fileExt || (fileExt !== "pdf" && fileExt !== "epub")) {
    throw new Error("Unsupported file format. Please upload a PDF or EPUB file.");
  }

  // Structure: books/{bookId}/{bookId}.{ext} to ensure unique paths
  const filePath = `books/${bookId}/${bookId}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("book-files")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (error) {
    console.error("Supabase storage upload failed:", error);
    throw new Error(error.message || "Failed to upload file to storage bucket.");
  }

  const { data: urlData } = supabase.storage
    .from("book-files")
    .getPublicUrl(filePath);

  if (!urlData || !urlData.publicUrl) {
    throw new Error("Failed to retrieve public URL for uploaded file.");
  }

  return urlData.publicUrl;
}
