import { NextResponse } from "next/server";
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
    .trim();
}

async function parseEpubMetadata(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const opfPath = Object.keys(zip.files).find(name => name.endsWith(".opf"));
  if (!opfPath) {
    throw new Error("Invalid EPUB: no .opf file found");
  }
  
  const opfText = await zip.files[opfPath].async("text");
  
  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const authorMatch = opfText.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const descMatch = opfText.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
  const langMatch = opfText.match(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i);
  const subjects = [...opfText.matchAll(/<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/gi)].map(m => m[1]);
  
  return {
    title: titleMatch ? cleanXmlText(titleMatch[1]) : "Unknown Title",
    author: authorMatch ? cleanXmlText(authorMatch[1]) : "Unknown Author",
    description: descMatch ? cleanXmlText(descMatch[1]) : "",
    categories: subjects.map(s => cleanXmlText(s)),
    language: langMatch ? cleanXmlText(langMatch[1]) : "en"
  };
}

async function searchBookMetadata(query: string): Promise<any[]> {
  let googleFailed = false;

  // 1. Try Google Books API
  try {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3${
      apiKey ? `&key=${apiKey}` : ""
    }`;
    const res = await fetch(googleUrl, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items;
      }
    } else {
      googleFailed = true;
    }
  } catch (err) {
    googleFailed = true;
  }

  // 2. Try OpenLibrary fallback
  if (googleFailed) {
    try {
      const fields = "key,title,author_name,cover_i,subject,number_of_pages_median,first_publish_year";
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=3`;
      const res = await fetch(olUrl, {
        method: "GET",
        headers: { "User-Agent": "PB23READS/1.0" }
      });
      if (res.ok) {
        const data = await res.json();
        const docs = data.docs || [];
        return docs.map((doc: any) => {
          const coverId = doc.cover_i;
          return {
            volumeInfo: {
              title: doc.title,
              authors: doc.author_name,
              description: doc.first_publish_year ? `Published: ${doc.first_publish_year}. (Source: OpenLibrary)` : "",
              imageLinks: coverId ? {
                thumbnail: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
                smallThumbnail: `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`
              } : undefined,
              pageCount: doc.number_of_pages_median || 0,
              categories: doc.subject || []
            }
          };
        });
      }
    } catch (err) {
      console.error("OpenLibrary lookup failed in detect route:", err);
    }
  }

  return [];
}

async function enrichBookMetadata(detected: { title: string; author: string; description?: string; categories?: string[]; language?: string }) {
  if (!detected.title || detected.title.toLowerCase() === "unknown title" || detected.title === "") {
    return {
      ...detected,
      coverUrl: "",
      totalPages: 0,
      language: detected.language || "en"
    };
  }

  const cleanTitle = detected.title.replace(/[\*\^_\(\)\[\]]/g, "").trim();
  const cleanAuthor = detected.author && detected.author.toLowerCase() !== "unknown author" 
    ? detected.author.replace(/[\*\^_\(\)\[\]]/g, "").trim()
    : "";
  
  let searchQuery = cleanTitle;
  if (cleanAuthor) {
    searchQuery = `intitle:${cleanTitle} inauthor:${cleanAuthor}`;
  }

  let items: any[] = [];
  try {
    items = await searchBookMetadata(searchQuery);
    if (items.length === 0 && cleanAuthor) {
      items = await searchBookMetadata(`${cleanTitle} ${cleanAuthor}`);
    }
    if (items.length === 0) {
      items = await searchBookMetadata(cleanTitle);
    }
  } catch (err) {
    console.error("Search enrichment failed:", err);
  }

  if (items.length > 0) {
    const bestMatch = items[0].volumeInfo;
    let coverUrl = bestMatch.imageLinks?.thumbnail || bestMatch.imageLinks?.smallThumbnail || "";
    if (coverUrl.startsWith("http://")) {
      coverUrl = coverUrl.replace("http://", "https://");
    }

    return {
      title: bestMatch.title || detected.title,
      author: bestMatch.authors ? bestMatch.authors.join(", ") : (detected.author || "Unknown Author"),
      description: bestMatch.description || detected.description || "",
      categories: bestMatch.categories && bestMatch.categories.length > 0 
        ? bestMatch.categories.slice(0, 5) 
        : (detected.categories || []),
      coverUrl: coverUrl,
      totalPages: bestMatch.pageCount || 0,
      language: bestMatch.language || detected.language || "en"
    };
  }

  return {
    ...detected,
    coverUrl: "",
    totalPages: 0,
    language: detected.language || "en"
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".epub")) {
      try {
        const meta = await parseEpubMetadata(buffer);
        const enriched = await enrichBookMetadata(meta);
        return NextResponse.json(enriched);
      } catch (err: any) {
        console.error("EPUB metadata parsing failed, falling back to AI:", err);
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }
    } else if (fileName.endsWith(".pdf")) {
      // Parse PDF text
      let pdfData;
      try {
        const parser = new pdf.PDFParse({ data: buffer });
        pdfData = await parser.getText({ first: 2 }); // only parse the first 2 pages to be fast
      } catch (err: any) {
        console.error("PDF text extraction failed:", err);
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }

      const extractedText = pdfData.text || "";
      if (!extractedText.trim()) {
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }

      // Call Gemini to analyze the PDF text and return JSON
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "Please configure GEMINI_API_KEY in your environment to enable AI metadata detection.",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }

      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

      const systemPrompt = `You are a book cataloging assistant. Analyze the following cover/front page text extracted from a PDF book and extract the book metadata in JSON format.
Return ONLY a valid JSON object matching this schema:
{
  "title": "Clean Title of the Book",
  "author": "Author Name(s)",
  "description": "A brief 2-3 sentence summary of the book (if mentioned or inferred from the text)",
  "categories": ["Category1", "Category2"],
  "language": "ISO 639-1 language code of the book (e.g. 'en', 'pa', 'hi', 'es' etc.)"
}
Do not write any markdown tags, code blocks, or additional text. Just output the clean JSON object.`;

      const prompt = `Text to analyze:\n${extractedText.substring(0, 4000)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      if (!res.ok) {
        console.error("Gemini call failed for metadata extraction:", await res.text());
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }

      const data = await res.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      try {
        const cleanedJson = responseText
          .replace(/^```json/i, "")
          .replace(/^```/, "")
          .replace(/```$/, "")
          .trim();
        const parsed = JSON.parse(cleanedJson);
        const detected = {
          title: parsed.title || file.name.replace(/\.[^/.]+$/, ""),
          author: parsed.author || "Unknown Author",
          description: parsed.description || "",
          categories: parsed.categories || [],
          language: parsed.language || "en"
        };
        const enriched = await enrichBookMetadata(detected);
        return NextResponse.json(enriched);
      } catch (jsonErr) {
        console.error("Failed to parse JSON response from Gemini:", responseText, jsonErr);
        const fallbackMeta = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          author: "Unknown Author",
          description: "",
          categories: []
        };
        const enriched = await enrichBookMetadata(fallbackMeta);
        return NextResponse.json(enriched);
      }
    }

    const fallbackMeta = {
      title: file.name.replace(/\.[^/.]+$/, ""),
      author: "Unknown Author",
      description: "",
      categories: []
    };
    const enriched = await enrichBookMetadata(fallbackMeta);
    return NextResponse.json(enriched);
  } catch (err: any) {
    console.error("Metadata detection endpoint error:", err);
    return NextResponse.json({ error: err.message || "Failed to process file" }, { status: 500 });
  }
}
