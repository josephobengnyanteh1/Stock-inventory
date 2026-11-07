# StockWise inventory

A small inventory and sales app built with HTML, CSS, browser JavaScript, Express, and Neon Postgres.

## Connect Neon

1. In the Neon Console, open your project and copy its PostgreSQL connection string. Use the pooled connection string for the app.
2. In this project folder, create your private environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Open `.env` and replace the example `DATABASE_URL` with the connection string from Neon. Keep `.env` private; it is ignored by Git.
4. Install dependencies and start the backend:

   ```powershell
   npm install
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). On the first run the backend creates the tables from `database/schema.sql` automatically.

The database and records are available in the Neon Console under **Tables** or **SQL Editor**. The app creates tables for users, products, sales, sale items, and the shop settings.

## Accounts and roles

- The first signup creates the administrator account and sets the shop name.
- The administrator can register one sales manager for the same shop.
- Administrators can manage products and view reports. Sales managers can view products and create sales.
- Both accounts sign in with the email address or phone number and password used at signup.

Passwords are stored as salted hashes. Login sessions use an HTTP-only cookie and last until logout, cookie expiry, or backend restart.

## Local development notes

- Keep `.env` and its Neon connection string out of Git. Never put a database password in frontend JavaScript or share it in screenshots.
- `database/schema.sql` is safe to run again; it creates missing tables and indexes without deleting existing records.
- Neon is the shared data store; `http://localhost:3000` is still served from the computer running Express. To let users reach the app over the internet, deploy the Express app separately and set `DATABASE_URL` in that host's environment settings.
