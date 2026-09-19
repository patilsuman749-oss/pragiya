# PRAGYA AI — Netlify deployment

## Netlify settings

- Publish directory: `public`
- Functions directory: `netlify/functions`
- No build command is required.

## Environment variables

Set these in Netlify Project configuration > Environment variables:

- `GEMINI_API_KEY` = your Gemini API key
- `GEMINI_MODEL` = `gemini-3.5-flash-lite` (optional)

Never commit `.env` or your real API key to GitHub.

## API routes

- `POST /api/chat`
- `GET /api/health`

The existing frontend already calls `/api/chat`, so no frontend URL change is required.
