# PRAGYA AI — Google Login + Chat History Sidebar

## What was added

- `public/js/firebase-init.js` — new file. Initializes Firebase with your
  `pragya-ai-3a2b5` project, sets up Google Auth and Firestore, and exposes
  everything as `window.PragyaFirebase`.
- `public/index.html` — added a login screen (shown until you sign in) and
  a chat-history sidebar (+ New chat button, chat list, account row with
  sign out).
- `public/js/app.js` — rewritten to: wait for sign-in, load/save chats to
  Firestore instead of `localStorage`, support multiple chats, and
  auto-title each chat from its first message.
- `public/style.css` — added styles for the login screen and sidebar
  (collapsible drawer on mobile, fixed panel on desktop).
- `public/js/voice.js` — unchanged.

## How data is stored

```
users/{uid}/chats/{chatId}                      -> { title, createdAt, updatedAt }
users/{uid}/chats/{chatId}/messages/{messageId}  -> { role, text, createdAt }
```

Only "Thinking...", "Connecting...", "Reconnecting...", and error/status
bubbles are skipped from Firestore — real user messages and PRAGYA's actual
answers are the only things saved.

## Steps to finish, in order

1. **Deploy Firestore security rules.**
   In the Firebase console: **Firestore Database → Rules tab** → replace the
   contents with what's in `firestore.rules` in this folder → **Publish**.
   Without this, a signed-in user could read or overwrite anyone else's
   chats.

2. **Add your live domain to Authorized domains.**
   **Authentication → Settings tab → Authorized domains → Add domain.**
   Add whatever domain your site is actually hosted on (your Netlify domain
   or custom domain). `localhost` is already there by default, which is why
   local testing works even before this step.

3. **Replace your files.**
   Copy the four files under `public/` in this folder over your existing
   `public/` folder (overwrite `index.html`, `style.css`, `js/app.js`, and
   add the new `js/firebase-init.js`).

4. **Test locally or redeploy to Netlify**, then open the site — you should
   see the "Sign in with Google" screen first, and after signing in, the
   sidebar with "+ New chat" and your chat list.

## Notes

- The Firebase config (`apiKey`, `projectId`, etc.) in `firebase-init.js` is
  safe to have in public client-side code — it's not a secret. Access is
  controlled by the security rules in step 1 and the domain allowlist in
  step 2, not by hiding this config.
- If you ever want a "Delete chat" button in the sidebar, `firebase-init.js`
  already has a `deleteChat(uid, chatId)` function ready to wire up — just
  ask and I'll add the button.
