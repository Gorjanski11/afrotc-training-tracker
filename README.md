# AFROTC Training Objective Tracker

A standalone static website (React + TypeScript + Vite, Tailwind v4 + Radix/shadcn UI) for tracking POC cadet completion of AFROTCI 36-2011 Vol 1 Training Objectives. Hosted on GitHub Pages, backed by Firebase Firestore.

**No login of any kind.** Anyone who has the site's URL can view *and edit* everything — add/edit/delete cadets, log completions, manage PMT events. This is an intentional, explicit choice for a small-detachment tool with an unlisted URL, not an oversight. There is no protection against accidental or malicious changes by anyone who has the link — see `firestore.rules`.

## One-time setup

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. **Build > Firestore Database** → Create database → Native mode → pick a region (can't be changed later, but the exact choice doesn't matter).
3. **Project settings (gear icon) > General > Your apps** → Add app → Web (`</>`) → register it (no Firebase Hosting setup needed — this project only uses Firestore from Firebase, hosting is GitHub Pages). Copy the `firebaseConfig` object it gives you.
4. Open [src/lib/firebase.ts](src/lib/firebase.ts) and paste those values in place of the `"REPLACE_ME"` placeholders.
5. Publish the security rules: go to **Firestore Database > Rules**, delete what's there, paste in the contents of [firestore.rules](firestore.rules), click **Publish**.

That's it — no Authentication setup, no accounts to create.

### 2. Set up git identity and commit

```bash
cd C:\Users\corte\afrotc-training-tracker
git config user.name "Your Name"
git config user.email "your@email.com"
git add -A
git commit -m "Initial commit"
```

### 3. Create the GitHub repo and push

1. Create a new repo on GitHub named exactly `afrotc-training-tracker` (this name is baked into `vite.config.ts`'s `base` path — update that first if you use a different name). Don't initialize it with a README/license/gitignore.
2. Push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/afrotc-training-tracker.git
   git push -u origin main
   ```

### 4. Turn on GitHub Pages via GitHub Actions

1. In the repo, **Settings > Pages > Build and deployment > Source** → change to **GitHub Actions**.
2. Check the **Actions** tab — pushing to `main` already triggered the "Deploy to GitHub Pages" workflow. Wait for it to go green (~1-2 minutes).
3. Back in **Settings > Pages**, your live URL appears: `https://<your-username>.github.io/afrotc-training-tracker/`.

### 5. First-run setup on the live site

1. Visit the URL from step 4.3.
2. Go to **Roster** → click **Import / Re-sync Training Objectives Catalog**. Confirms with a count (32 Training Objectives).
3. Check the **Reference Library** tab — skim it for any transcription mistakes now, before cadets start logging completions against it.
4. **Roster → Add Cadet** to build your real roster (starts empty — no migration from any prior system).
5. **Calendar** → add PMT events and assign which Training Objectives each covers — this drives the Dashboard's due/missed flagging.

## Local development

```
npm install
npm run dev
```

By default this talks directly to your **production** Firestore. To develop against a disposable local database instead:

1. Install the Firebase CLI: `npm install -g firebase-tools` (or use `npx firebase-tools` each time).
2. `npx firebase-tools emulators:start --only firestore --project demo-afrotc-tracker` (the `demo-` prefix means no real project is required; [firebase.json](firebase.json) configures the emulator port).
   - Requires a Java Runtime Environment on your machine — install one (e.g. Eclipse Temurin) if it complains it can't find `java`.
3. In a second terminal: `VITE_USE_FIREBASE_EMULATOR=true npm run dev` — [src/lib/firebase.ts](src/lib/firebase.ts) connects to the local emulator instead of production whenever that env var is set in dev mode.

## Architecture notes

- **No router.** Navigation is plain in-memory tab state ([src/App.tsx](src/App.tsx)) — avoids GitHub Pages' lack of server-side rewrites breaking deep links/refreshes.
- **No auth.** Every Firestore collection is `allow read, write: if true` ([firestore.rules](firestore.rules)). If you ever want to add real protection later, reintroduce Firebase Authentication with a single shared account and change the rule to `allow write: if request.auth != null` — the app's screens don't currently have any read-only mode, so that would need `readOnly` props threaded back through `CadetDetailScreen`, `CalendarScreen`, `CompletionEntryDialog`, and `EventDetailDialog` (removed in this version).
- **Firestore collections**: `cadets`, `trainingObjectives`, `completions`, `pmtEvents` — see [src/domain/types.ts](src/domain/types.ts) for shapes.
- **Adding a future "area"** beyond Training Objectives: a new Firestore collection, a new hook (`useXyz.ts`) modeled on [src/hooks/useCompletions.ts](src/hooks/useCompletions.ts), a new screen, and a new tab in `App.tsx`. The blanket Firestore rule already covers any new collection automatically.
