import axios from 'axios';
import { google } from 'googleapis';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Content-Type, Accept'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    // Parse JSON body
    let body;
    try {
      body = req.body;
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      }
    } catch (parseError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid JSON in request body' 
      });
    }

    const { title, tags = [] } = body;

    // Validate input
    if (!title || typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title must be at least 5 characters long' 
      });
    }

    // Validate environment variables
    const requiredEnvVars = [
      'GEMINI_API_KEY',
      'BLOGGER_CLIENT_ID',
      'BLOGGER_CLIENT_SECRET',
      'BLOGGER_REFRESH_TOKEN',
      'BLOGGER_BLOG_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    console.log('Starting blog generation...');

    // Step 1: Generate content with Gemini
    console.log('Generating content with Gemini...');
    
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Write a detailed, SEO-friendly blog post in HTML about "${title}".
                
                Requirements:
                - Language: Hinglish (Hindi + English mix)
                - Use HTML tags: <h2>, <h3>, <p>, <ul>, <li>
                - Do NOT include: <html>, <body>, <head>, <title>, <meta>
                - No markdown, no emojis
                - Make it 800-1000 words
                - Include 3-4 main sections
                - Add bullet points where appropriate
                - End with a conclusion
                
                Format example:
                <h2>Main Topic</h2>
                <p>Introduction paragraph...</p>
                <h3>Sub Topic</h3>
                <p>Details...</p>
                <ul>
                  <li>Point 1</li>
                  <li>Point 2</li>
                </ul>
                <h2>Conclusion</h2>
                <p>Summary...</p>`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 2000
        }
      },
      {
        headers: { 
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const html = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!html) {
      throw new Error('Gemini API returned empty content');
    }

    console.log('Content generated successfully, length:', html.length);

    // Step 2: Publish to Blogger
    console.log('Publishing to Blogger...');
    
    const auth = new google.auth.OAuth2(
      process.env.BLOGGER_CLIENT_ID,
      process.env.BLOGGER_CLIENT_SECRET,
      process.env.BLOGGER_REDIRECT_URI || 'https://your-app.vercel.app/api/auth/callback'
    );

    auth.setCredentials({
      refresh_token: process.env.BLOGGER_REFRESH_TOKEN
    });

    const blogger = google.blogger({ 
      version: 'v3', 
      auth 
    });

    const postResponse = await blogger.posts.insert({
      blogId: process.env.BLOGGER_BLOG_ID,
      requestBody: {
        title: title.trim(),
        content: html,
        labels: tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
      }
    });

    console.log('Blog published successfully! Post ID:', postResponse.data.id);

    // Success response
    return res.status(200).json({
      success: true,
      message: 'Blog published successfully!',
      postId: postResponse.data.id,
      url: postResponse.data.url,
      title: postResponse.data.title,
      published: postResponse.data.published,
      status: postResponse.data.status
    });

  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // User-friendly error messages
    let errorMessage = 'Failed to publish blog post';
    let statusCode = 500;

    if (error.message.includes('Missing environment variables')) {
      errorMessage = 'Server configuration error. Please contact administrator.';
      statusCode = 500;
    } else if (error.message.includes('Title must be')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('quota') || error.response?.status === 429) {
      errorMessage = 'API quota exceeded. Please try again later.';
      statusCode = 429;
    } else if (error.message.includes('timeout') || error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out. Please try again.';
      statusCode = 504;
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
      statusCode = error.response.status || 500;
    } else if (error.message.includes('Unauthorized') || error.message.includes('invalid_grant')) {
      errorMessage = 'Blogger authentication failed. Please check your refresh token.';
      statusCode = 401;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
}