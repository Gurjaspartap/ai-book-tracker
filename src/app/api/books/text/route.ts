import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/utils/supabaseClient";
import JSZip from "jszip";
import * as pdf from "pdf-parse";

function cleanXmlText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ") // normalize spacing
    .trim();
}

async function extractEpubText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  
  const textFiles = Object.keys(zip.files)
    .filter(name => /\.(html|xhtml|xml)$/i.test(name))
    .sort();
    
  let fullText = "";
  for (const filePath of textFiles) {
    if (filePath.endsWith("container.xml") || filePath.endsWith("toc.ncx") || filePath.endsWith(".opf")) {
      continue;
    }
    const htmlText = await zip.files[filePath].async("text");
    const plainText = cleanXmlText(htmlText);
    if (plainText.trim()) {
      fullText += plainText + "\n\n";
    }
  }
  return fullText;
}

export async function POST(request: Request) {
  try {
    const { bookId, supabaseUrl, supabaseAnonKey, accessToken } = await request.json();

    if (!bookId) {
      return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
    }

    let supabase = null;
    const finalUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const finalKey = supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (finalUrl && finalKey) {
      const options: any = {};
      if (accessToken) {
        options.global = {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        };
      }
      supabase = createClient(finalUrl, finalKey, options);
    } else {
      supabase = getSupabaseClient();
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase client could not be initialized" }, { status: 500 });
    }

    // 1. Fetch book record from DB
    const { data: book, error: fetchError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (fetchError) {
      console.error("Error fetching book from Supabase:", fetchError);
      return NextResponse.json({ error: `Book not found in database: ${fetchError.message} (Code: ${fetchError.code})` }, { status: 404 });
    }

    if (!book) {
      return NextResponse.json({ error: "Book not found in database: record is empty" }, { status: 404 });
    }

    // If already extracted, fetch the cached text file directly
    if (book.extracted_text_url) {
      try {
        const textRes = await fetch(book.extracted_text_url);
        if (textRes.ok) {
          const textContent = await textRes.text();
          return NextResponse.json({ text: textContent });
        }
      } catch (cacheErr) {
        console.warn("Failed to fetch cached text, re-extracting:", cacheErr);
      }
    }

    if (!book.cover_url && !book.file_url) {
      // Wait, in our schema we use file_url or store it in another text column. Let's make sure we check both!
      // Let's use book.file_url or book.cover_url if that was used as fallback, but book.file_url is the standard.
    }

    const fileUrl = book.file_url;
    if (!fileUrl) {
      return NextResponse.json({ error: "No book file linked to this record" }, { status: 400 });
    }

    // 2. Download the original EPUB/PDF file
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: `Failed to download file from storage: ${fileRes.statusText}` }, { status: 500 });
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 3. Extract text based on file format
    let extractedText = "";
    const isEpub = fileUrl.toLowerCase().includes(".epub") || (book.file_type === "epub");

    if (isEpub) {
      extractedText = await extractEpubText(buffer);
    } else {
      // PDF
      const parser = new pdf.PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      extractedText = pdfData.text || "";
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: "Extracted text is empty or invalid" }, { status: 500 });
    }

    // 4. Upload the extracted text as a .txt file cache back to Supabase Storage
    const cleanFileName = `cache_${bookId}.txt`;
    const textBuffer = Buffer.from(extractedText, "utf-8");

    // We upload to the same bucket "book-files" under a "text-cache" folder
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("book-files")
      .upload(`text-cache/${cleanFileName}`, textBuffer, {
        contentType: "text/plain",
        upsert: true
      });

    if (uploadError) {
      console.error("Failed to upload plain text cache to Supabase storage:", uploadError);
    } else {
      // 5. Get public URL and update the book record
      const { data: urlData } = supabase.storage
        .from("book-files")
        .getPublicUrl(`text-cache/${cleanFileName}`);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("books")
        .update({ extracted_text_url: publicUrl })
        .eq("id", bookId);

      if (updateError) {
        console.error("Failed to update book record with extracted_text_url:", updateError);
      }
    }

    return NextResponse.json({ text: extractedText });
  } catch (err: any) {
    console.error("Text extraction route error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
