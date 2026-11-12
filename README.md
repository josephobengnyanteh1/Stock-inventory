# StockWise — Stock Inventory & Sales Management (PHP + MySQL)

## Run it (XAMPP / WAMP / Laragon)
1. Copy this folder into `htdocs` (XAMPP) or `www` (WAMP), e.g. `C:\xampp\htdocs\stockwise`.
2. Start **Apache** and **MySQL** in the XAMPP control panel.
3. Open **http://localhost/stockwise/** in your browser.

The database (`stockwise`) and all tables are created automatically on first visit.
Prefer manual setup? Import `database.sql` in phpMyAdmin instead.

Default MySQL settings (user `root`, no password) are in `config.php` — change them if yours differ.

No XAMPP? With PHP 8.1+ and MySQL installed: `php -S localhost:8000` inside this folder.

## First use
- The first visit shows **Set up your shop**: this creates the administrator account.
- After that, only an administrator can add team members (Team page).

## Roles
| | Administrator | Sales manager |
|---|---|---|
| Dashboard, Sales | ✓ | ✓ |
| View products | ✓ | ✓ |
| Add / edit / delete products | ✓ | – |
| Reports & profit figures | ✓ | – |
| Manage team accounts | ✓ | – |

## Structure
- `includes/` – database connection, authentication/helpers, shared layout
- `*.php` – pages (login, signup, dashboard, products, sales, reports, team)
- `assets/` – CSS and JavaScript
- `database.sql` – MySQL schema

## Security notes
Passwords use `password_hash`, all queries are prepared statements, forms are CSRF-protected, output is escaped, and stock changes during a sale run in a locked transaction.
