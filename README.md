# Daily Work
A personal daily work calendar with notes, categories, optional hours, search, editing, deletion and JSON export.

## Run locally
Requires Python 3, with no extra packages. Double-click `start.bat` or run `python server.py`, then open http://127.0.0.1:8080. Keep the server running while using the website.

On localhost, entries remain in `data/worklog.sqlite3`, without a login or internet connection. Copy this database while the app is stopped for a full backup. Database files, logs and credentials are excluded from Git.

## Set up Supabase
1. Open your Supabase project, select SQL Editor, and run the entire `supabase/schema.sql` file. It creates the entries table, validation constraints, owner-only Row Level Security policies and an update timestamp trigger. Re-running it does not delete entries.
2. Email/password authentication must be enabled in Authentication. Keep email confirmation enabled. The website provides Create account and Sign in controls.
3. After deployment, set Authentication > URL Configuration > Site URL to the production HTTPS URL. Add that exact origin followed by `/` as an allowed redirect URL. For local cloud testing, also allow `http://127.0.0.1:8080/`.
4. The project URL and browser-safe publishable key are configured in `public/config.js`. Never put a secret key, service-role key or database password in this file.

The cloud site uses Supabase Auth and the REST Data API directly; no Python server is deployed. RLS enforces ownership for all four record operations. Sessions are held in sessionStorage for this browser tab and refreshed when necessary. Sign out clears the local session and requests server-side session revocation. Password recovery is not yet provided in the app; manage account recovery through Supabase administration if necessary.

## Deploy on Vercel
1. Sign into Vercel with GitHub; import `eddytiya/daily-work`.
2. Use Framework Preset **Other**, repository root as Root Directory, no Build Command, and **public** as Output Directory. `vercel.json` also declares these settings and browser security headers.
3. Deploy and configure the production address in Supabase as described above.
4. Open the website, create an account, confirm the email, then sign in. Test saving, refreshing, editing, signing out, and signing in again. Verify from a second account that the first account's entries are inaccessible.

No environment variables or secret keys are needed by the static deployment. The source repository does not include your journal data. Existing local SQLite entries are not automatically migrated to Supabase; retain your local database and exported JSON backup.

## Verify
Run `node --test tests/storage.test.cjs`, `node --check public/app.js`, and `python -m py_compile server.py`.
For cloud testing locally, visit http://127.0.0.1:8080/?cloud=1. Without that query parameter localhost continues to use SQLite.
