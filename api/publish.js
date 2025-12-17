import axios from "axios";
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { title } = req.body;
    if (!title || title.trim().length < 5) {
      return res.status(400).json({ error: "Valid title required" });
    }

    // 🔹 Gemini (UPDATED MODEL)
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `
Write a long SEO-friendly blog post in HTML.
Title: ${title}

Rules:
- Language: Hinglish
- Use <h2>, <h3>, <p>, <ul>, <li>
- No markdown
- No emojis
- Do NOT include <html>, <body>, <head>
`
          }]
        }]
      },
      { timeout: 20000 } // Vercel-safe
    );

    const html =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!html) {
      return res.status(500).json({ error: "Gemini returned empty content" });
    }

    // 🔹 Blogger
    const oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.REFRESH_TOKEN
    });

    const blogger = google.blogger({
      version: "v3",
      auth: oauth2Client
    });

    await blogger.posts.insert({
      blogId: process.env.BLOG_ID,
      requestBody: {
        title,
        content: html
      }
    });

    res.json({ success: true });

  } catch (err) {
    console.error(
      err.response?.data || err.message || err
    );
    res.status(500).json({ error: "Publishing failed" });
  }
}
