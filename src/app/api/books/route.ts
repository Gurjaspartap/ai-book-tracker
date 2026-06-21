import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    let items: any[] = [];
    let googleFailed = false;
    let googleErrorMsg = "";

    // 1. Try Google Books API first
    try {
      const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
      const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8${
        apiKey ? `&key=${apiKey}` : ""
      }`;

      const res = await fetch(googleUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          items = data.items;
        }
      } else {
        googleFailed = true;
        const errData = await res.json().catch(() => ({}));
        googleErrorMsg = errData.error?.message || `Status ${res.status}`;
        console.warn("Google Books API call failed. Error Details:", googleErrorMsg);
      }
    } catch (err: any) {
      googleFailed = true;
      googleErrorMsg = err.message || "Network exception";
      console.warn("Google Books API network exception:", err);
    }

    // 2. Fallback to OpenLibrary if Google Books failed, returned empty, or exceeded quota
    if (googleFailed || items.length === 0) {
      console.log(`Falling back to OpenLibrary Search API for query: "${query}"`);
      try {
        const fields = "key,title,author_name,cover_i,subject,number_of_pages_median,first_publish_year";
        const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=8`;

        const res = await fetch(olUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "User-Agent": "AuraBooks/1.0 (aurabooks@example.com)",
          },
        });

        if (res.ok) {
          const data = await res.json();
          const olDocs = data.docs || [];

          // Map OpenLibrary documents to the Google Books schema format
          items = olDocs.map((doc: any) => {
            const authors = doc.author_name || [];
            const coverId = doc.cover_i;
            const subjects = doc.subject || [];
            
            const coverUrl = coverId 
              ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
              : "";
              
            const smallCoverUrl = coverId 
              ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`
              : "";

            return {
              id: `ol_${doc.key.split("/").pop()}`, // clean work key
              volumeInfo: {
                title: doc.title,
                authors: authors,
                description: `Published: ${doc.first_publish_year || "Unknown year"}. (Source: OpenLibrary)`,
                imageLinks: coverId ? {
                  thumbnail: coverUrl,
                  smallThumbnail: smallCoverUrl
                } : undefined,
                pageCount: doc.number_of_pages_median || 0,
                categories: subjects.slice(0, 5), // take first 5 tags
              }
            };
          });
        } else {
          console.error(`OpenLibrary API responded with status ${res.status}`);
          // If both failed, return the Google error to let user know they hit Google's quota limits
          if (googleFailed) {
            return NextResponse.json(
              { error: `Google Books Quota Exceeded (${googleErrorMsg}). OpenLibrary fallback also failed.` },
              { status: 429 }
            );
          }
        }
      } catch (olErr: any) {
        console.error("OpenLibrary fallback exception:", olErr);
        if (googleFailed) {
          return NextResponse.json(
            { error: `Google Books Quota Exceeded (${googleErrorMsg}). OpenLibrary fallback failed.` },
            { status: 429 }
          );
        }
      }
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Book Search API Route handler crashed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search books" },
      { status: 500 }
    );
  }
}
