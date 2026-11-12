# StockWise

Stock inventory website. Node.js (Express) server, Supabase (Auth + Postgres), plain HTML/CSS/JS frontend.

## Roles
| Action | Admin | Sales manager |
|---|---|---|
| Create account | yes (public sign up, no email verification) | created by admin |
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
3. Nothing to configure for email. Sign up goes through the server, so users sign in right away and no verification email is sent.
4. Copy `.env.example` to `.env` and fill in the URL, anon key and service role key (Project Settings -> API).
5. Install and run:
   ```
   npm install
   npm run dev
   ```
6. Open http://localhost:3000, click "Create account", and you land on the dashboard.

