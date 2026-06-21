import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { provider, apiKey, model, messages, systemPrompt } = await request.json();

    if (!provider || !apiKey || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Missing required fields (provider, apiKey, messages)" },
        { status: 400 }
      );
    }

    if (provider === "gemini") {
      // Format messages for Gemini (expects roles "user" and "model")
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      // If there's a system message in the array, add it to systemInstruction
      const systemMsg = messages.find((m) => m.role === "system")?.content;
      const systemInstruction = systemPrompt || systemMsg
        ? { parts: [{ text: systemPrompt || systemMsg }] }
        : undefined;

      // Map models if needed
      const geminiModel = model || "gemini-1.5-flash";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          systemInstruction,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini API error: ${res.statusText}`);
      }

      const data = await res.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!responseText) {
        throw new Error("Empty response received from Gemini API");
      }

      return NextResponse.json({ text: responseText });
    }

    if (provider === "openai") {
      const openaiModel = model || "gpt-4o-mini";
      
      // OpenAI expects a system role
      const formattedMessages = [];
      const systemMsg = messages.find((m) => m.role === "system")?.content;
      const finalSystemPrompt = systemPrompt || systemMsg;
      
      if (finalSystemPrompt) {
        formattedMessages.push({ role: "system", content: finalSystemPrompt });
      }

      formattedMessages.push(
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))
      );

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: formattedMessages,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
      }

      const data = await res.json();
      const responseText = data.choices?.[0]?.message?.content;

      if (!responseText) {
        throw new Error("Empty response received from OpenAI API");
      }

      return NextResponse.json({ text: responseText });
    }

    if (provider === "claude") {
      const claudeModel = model || "claude-3-5-sonnet-20240620";
      
      const systemMsg = messages.find((m) => m.role === "system")?.content;
      const finalSystemPrompt = systemPrompt || systemMsg;

      const formattedMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "system" ? "user" : m.role, // fallback
          content: m.content,
        }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 4096,
          system: finalSystemPrompt || undefined,
          messages: formattedMessages,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Claude API error: ${res.statusText}`);
      }

      const data = await res.json();
      const responseText = data.content?.[0]?.text;

      if (!responseText) {
        throw new Error("Empty response received from Claude API");
      }

      return NextResponse.json({ text: responseText });
    }

    return NextResponse.json({ error: "Unsupported AI provider" }, { status: 400 });
  } catch (error: any) {
    console.error("AI API Proxy Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process AI request" },
      { status: 500 }
    );
  }
}
