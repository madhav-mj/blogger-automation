import axios from 'axios';
import { google } from 'googleapis';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With,Content-Type'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, tags = [] } = req.body;

    // Validate input
    if (!title || title.trim().length < 5) {
      return res.status(400).json({ error: 'Title must be at least 5 characters' });
    }

    // Step 1: Generate content with Gemini
    console.log('Generating content with Gemini...');
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Write a long SEO-friendly blog post in HTML about "${title}".
                
                Requirements:
                - Language: Hinglish (Hindi + English mix)
                - Use HTML tags: <h2>, <h3>, <p>, <ul>, <li>
                - No markdown, no emojis
                - Don't include <html>, <body>, <head>
                - Make it 1000+ words
                - Add sections with headings
                - Include bullet points
                - Add a conclusion`
              }
            ]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );

    const html = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!html) {
      throw new Error('Failed to generate content');
    }

    // Step 2: Publish to Blogger
    console.log('Publishing to Blogger...');
    const auth = new google.auth.OAuth2(
      process.env.BLOGGER_CLIENT_ID,
      process.env.BLOGGER_CLIENT_SECRET,
      process.env.BLOGGER_REDIRECT_URI
    );

    auth.setCredentials({
      refresh_token: process.env.BLOGGER_REFRESH_TOKEN
    });

    const blogger = google.blogger({ version: 'v3', auth });

    const post = await blogger.posts.insert({
      blogId: process.env.BLOGGER_BLOG_ID,
      requestBody: {
        title: title.trim(),
        content: html,
        labels: tags
      }
    });

    // Success response
    res.status(200).json({
      success: true,
      message: 'Blog published successfully!',
      postId: post.data.id,
      url: post.data.url,
      title: post.data.title
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    // User-friendly error messages
    let errorMessage = 'Failed to publish blog';
    
    if (error.message.includes('quota')) {
      errorMessage = 'API quota exceeded. Please try again later.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}
