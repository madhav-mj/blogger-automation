import axios from "axios";
import { google } from "googleapis";
import DOMPurify from "isomorphic-dompurify";
import rateLimit from "express-rate-limit";
import { createMiddleware } from "@next-safe/middleware";

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs per IP
  message: {
    error: "Too many requests, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting middleware
const applyRateLimit = (req, res) => {
  return new Promise((resolve, reject) => {
    limiter(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

// Validate environment variables
const validateEnvironment = () => {
  const requiredEnvVars = [
    'GEMINI_API_KEY',
    'CLIENT_ID',
    'CLIENT_SECRET',
    'REFRESH_TOKEN',
    'BLOG_ID',
    'REDIRECT_URI'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
};

// Validate request body
const validateRequest = (body) => {
  const { title, tags = [], publish = true } = body;
  
  if (!title || title.trim().length < 5) {
    throw new Error("Title must be at least 5 characters long");
  }
  
  if (title.trim().length > 200) {
    throw new Error("Title must be less than 200 characters");
  }
  
  if (tags && !Array.isArray(tags)) {
    throw new Error("Tags must be an array");
  }
  
  if (tags && tags.length > 10) {
    throw new Error("Maximum 10 tags allowed");
  }
  
  return { title: title.trim(), tags, publish };
};

// Generate content with Gemini
const generateContentWithGemini = async (title) => {
  const prompt = `
Write a detailed, SEO-optimized blog post in HTML.
Title: ${title}

Requirements:
- Language: Hinglish (mix of Hindi and English)
- Use proper HTML structure: <h2> for main sections, <h3> for subsections
- Include 3-4 relevant H2 sections
- Add bullet points with <ul><li> where appropriate
- Keep paragraphs concise (3-4 sentences max)
- Add a short conclusion
- DO NOT include: <html>, <body>, <head>, or any metadata
- DO NOT include: <script>, <style>, <meta>, <link>
- Total length: 800-1200 words

Tone: Conversational and informative
Target audience: Indian readers familiar with both languages

Example structure:
<h2>Main Section 1</h2>
<p>Introduction paragraph...</p>
<h3>Subsection 1.1</h3>
<p>Details...</p>
<ul>
  <li>Point 1</li>
  <li>Point 2</li>
</ul>
<h2>Conclusion</h2>
<p>Summary...</p>
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
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
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        timeout: 25000,
        signal: controller.signal
      }
    );

    const html = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!html) {
      throw new Error("Gemini returned empty content");
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
};

// Sanitize HTML content
const sanitizeHTML = (html) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'style', 'class']
  });
};

// Publish to Blogger
const publishToBlogger = async (title, content, tags, publish = true) => {
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

  const response = await blogger.posts.insert({
    blogId: process.env.BLOG_ID,
    requestBody: {
      title,
      content,
      labels: tags,
      status: publish ? "live" : "draft"
    }
  });

  return response.data;
};

// Main handler function
export default async function handler(req, res) {
  // Handle GET request for health check
  if (req.method === "GET") {
    try {
      validateEnvironment();
      return res.status(200).json({
        status: "ok",
        service: "blog-publisher",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        rateLimit: {
          windowMs: "15 minutes",
          maxRequests: 5
        }
      });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error.message
      });
    }
  }

  // Handle POST request
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      allowed: ["GET", "POST"]
    });
  }

  try {
    // Apply rate limiting
    await applyRateLimit(req, res);

    // Validate environment
    validateEnvironment();

    // Parse and validate request body
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { title, tags, publish } = validateRequest(body);

    // Generate content
    const generatedHTML = await generateContentWithGemini(title);

    // Sanitize HTML
    const cleanHTML = sanitizeHTML(generatedHTML);

    // Publish to Blogger
    const blogPost = await publishToBlogger(title, cleanHTML, tags, publish);

    // Success response
    return res.status(200).json({
      success: true,
      message: publish ? "Blog post published successfully" : "Blog post saved as draft",
      postId: blogPost.id,
      postUrl: blogPost.url,
      status: blogPost.status,
      published: blogPost.published,
      timestamp: new Date().toISOString(),
      metadata: {
        titleLength: title.length,
        tagCount: tags?.length || 0,
        contentLength: cleanHTML.length
      }
    });

  } catch (err) {
    console.error("Publishing Error:", {
      timestamp: new Date().toISOString(),
      error: err.message,
      status: err.response?.status,
      data: err.response?.data,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle specific error types
    if (err.message.includes("Missing environment variables")) {
      return res.status(500).json({
        error: "Server configuration error",
        message: err.message
      });
    }

    if (err.message.includes("Title must be")) {
      return res.status(400).json({
        error: "Validation error",
        message: err.message
      });
    }

    if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: "Request timeout",
        message: "Content generation took too long. Please try again."
      });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: "Too many requests. Please try again later."
      });
    }

    if (err.response?.data?.error?.message?.includes("quota")) {
      return res.status(429).json({
        error: "API quota exceeded",
        message: "Gemini API quota has been exceeded. Please try again later."
      });
    }

    // Default error response
    const errorMessage = err.response?.data?.error?.message ||
                        err.message ||
                        "Publishing failed";

    return res.status(err.response?.status || 500).json({
      error: "Publishing failed",
      message: errorMessage,
      retryable: ![400, 401, 403].includes(err.response?.status)
    });
  }
}

// Configuration for Next.js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
    externalResolver: true,
  },
};
