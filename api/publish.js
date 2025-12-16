import axios from "axios";
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title required" });
    }

    // Gemini
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `
Write a long SEO-friendly blog post in HTML.
Title: ${title}

Rules:
- Hinglish
- Use <h2>, <h3>, <p>, <ul>, <li>
- No markdown
- No emojis
- No <html>, <body>, <head>
`
          }]
        }]
      }
    );

    const html = geminiRes.data.candidates[0].content.parts[0].text;

    // Blogger
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
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Publishing failed" });
  }
}
