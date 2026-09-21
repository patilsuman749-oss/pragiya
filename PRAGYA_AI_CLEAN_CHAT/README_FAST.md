# PRAGYA AI — Fast Voice + Text Build

## What changed
- Faster default Gemini model: `gemini-3.5-flash-lite`.
- Minimal Gemini thinking level for quicker everyday replies.
- Shorter rolling conversation history to reduce request size.
- Added a text message box with a SEND button.
- Text messages can be sent even when the microphone is off.
- PRAGYA tries to select an available male English browser voice.
- Male voice is made deeper with a lower pitch and slightly slower speaking rate.
- More useful timeout/error message.

## Run
```bash
cd backend
npm install
node server.js
```

Then open:
`http://localhost:3000`

## Important
The `.env` file contains your Gemini API key. Do not publish or share that file. If the key has been exposed outside your private development environment, rotate/revoke it in Google AI Studio and put the new key in `.env`.
