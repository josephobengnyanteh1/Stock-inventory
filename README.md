# StockWise

Stock inventory website. Node.js (Express) server, Supabase (Auth + Postgres), plain HTML/CSS/JS frontend.

## Roles
| Action | Admin | Sales manager |
|---|---|---|
| Create account / verify email | yes (public sign up) | created by admin |
| View dashboard | full business view | own sales only |
| Add, edit, delete products | yes | no |
| See product cost and stock value | yes | no |
| Record sales | yes | yes |
| View sales | all | own |
| Add or remove sales managers | yes | no |

There is no default admin. Anyone who creates an account becomes the admin of their own business.
Rules are enforced on the server (`server.js`), not just hidden in the UI.

## Setup
1. Create a project at https://supabase.com.
2. Supabase -> SQL Editor -> paste `supabase/schema.sql` -> Run.
3. Supabase -> Authentication -> Sign In / Providers -> Email: keep "Confirm email" ON.
4. Supabase -> Authentication -> URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/verify.html`
   (when you deploy, add your live URL and its `/verify.html` too)
5. Copy `.env.example` to `.env` and fill in the URL, anon key and service role key (Project Settings -> API).
6. Install and run:
   ```
   npm install
   npm run dev
   ```
7. Open http://localhost:3000, click "Create an account", verify the email, and you land on the dashboard.

Supabase's built-in email sender has a low hourly limit. For heavier use, add your own SMTP under Authentication -> SMTP Settings.
