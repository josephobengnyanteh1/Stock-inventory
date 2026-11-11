const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { pool } = require("./db");

const app = express();
const sessions = new Map();
const sessionCookie = "stockwise_session";
const number = value => Number(value);
const lowStock = product => product.quantity <= product.reorderLevel;
const validProduct = body => typeof body.name === "string" && body.name.trim() && typeof body.category === "string" && body.category.trim() && Number.isFinite(number(body.price)) && number(body.price) >= 0 && Number.isFinite(number(body.cost ?? 0)) && number(body.cost ?? 0) >= 0 && Number.isInteger(number(body.quantity)) && number(body.quantity) >= 0 && Number.isInteger(number(body.reorderLevel ?? 5)) && number(body.reorderLevel ?? 5) >= 0;
const id = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const normalizeContact = value => {
  const contact = String(value || "").trim();
  if (contact.includes("@")) {
    const email = contact.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? { value: email, type: "email" } : null;
  }
  const phone = contact.replace(/[\s().-]/g, "");
  return /^\+?[0-9]{7,15}$/.test(phone) ? { value: phone, type: "phone" } : null;
};
const verificationSecret = process.env.EMAIL_VERIFICATION_SECRET || "stockwise-default-secret";
const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;
const hashEmailCode = (email, code) => crypto.createHmac("sha256", verificationSecret).update(`${email}:${code}`).digest("hex");
const hashVerificationToken = token => crypto.createHash("sha256").update(String(token)).digest("hex");
function safeHexEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
const publicUser = user => ({ id: user.id, name: user.name, contact: user.contact, role: user.role, shopName: user.shopName || "", isVerified: user.is_verified });
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || "").split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function setSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  res.cookie(sessionCookie, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000, path: "/" });
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please log in to continue." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Your account does not have permission to do that." });
    next();
  };
}
function mapProduct(row) {
  return { id: row.id, sku: row.sku, name: row.name, category: row.category, price: number(row.price), cost: number(row.cost), quantity: row.quantity, reorderLevel: row.reorder_level, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapSale(row, items) {
  return { id: row.id, total: number(row.total), paymentMethod: row.payment_method, createdAt: row.created_at, items };
}
function makeSaleItem(row) {
  return { productId: row.product_id, sku: row.sku, name: row.name, quantity: row.quantity, unitPrice: number(row.unit_price), unitCost: number(row.unit_cost), lineTotal: number(row.line_total) };
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(asyncRoute(async (req, _res, next) => {
  const cookie = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`));
  const token = cookie?.slice(sessionCookie.length + 1);
  const userId = token && sessions.get(token);
  if (userId) {
    const { rows } = await pool.query("SELECT u.id, u.name, u.contact, u.role, u.is_verified, s.shop_name FROM users u LEFT JOIN store_settings s ON s.singleton = TRUE WHERE u.id = $1", [userId]);
    if (rows[0]) req.user = { id: rows[0].id, name: rows[0].name, contact: rows[0].contact, role: rows[0].role, is_verified: rows[0].is_verified, shopName: rows[0].shop_name || "" };
    else sessions.delete(token);
  }
  next();
}));

app.get("/api/health", (_req, res) => res.json({ status: "ok", message: "Stock inventory API is running" }));
app.get("/api/auth/status", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'administrator') AS admin_exists, (SELECT shop_name FROM store_settings WHERE singleton = TRUE) AS shop_name");
  const state = rows[0];
  res.json({ setupRequired: !state.admin_exists, managerRegistrationOpen: req.user?.role === "administrator", shopName: state.shop_name || "", user: req.user ? publicUser(req.user) : null });
}));
app.get("/api/auth/me", (req, res) => req.user ? res.json(publicUser(req.user)) : res.status(401).json({ error: "Please log in." }));

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const contact = normalizeContact(req.body.contact);
  const shopName = typeof req.body.shopName === "string" ? req.body.shopName.trim() : "";
  const requestedRole = req.body.role;
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Enter a name between 2 and 80 characters." });
  if (!contact) return res.status(400).json({ error: "Enter a valid email address or phone number." });
  if (shopName.length < 2 || shopName.length > 120) return res.status(400).json({ error: "Enter a shop name between 2 and 120 characters." });
  if (password.length < 8 || password.length > 200) return res.status(400).json({ error: "Password must be at least 8 characters." });

  const client = await pool.connect();
  let user;
  let role;
  let initialAdministrator = false;
  let publicAdministrator = false;
  let verificationCodeToSend = null;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [74190261]);
    const { rows: users } = await client.query("SELECT id, role FROM users");
    const adminExists = users.some(candidate => candidate.role === "administrator");
    const settings = await client.query("SELECT shop_name FROM store_settings WHERE singleton = TRUE");
    const existingShopName = settings.rows[0]?.shop_name || "";
    if (!adminExists && users.length === 0 && requestedRole === "administrator") {
      role = "administrator";
      initialAdministrator = true;
      await client.query("INSERT INTO store_settings (singleton, shop_name) VALUES (TRUE, $1) ON CONFLICT (singleton) DO UPDATE SET shop_name = EXCLUDED.shop_name", [shopName]);
    } else if (adminExists && !req.user && requestedRole === "administrator" && existingShopName && shopName.toLowerCase() === existingShopName.toLowerCase()) {
      role = "administrator";
      publicAdministrator = true;
    } else if (adminExists && req.user?.role === "administrator" && ["administrator", "sales_manager"].includes(requestedRole) && (!existingShopName || shopName.toLowerCase() === existingShopName.toLowerCase())) {
      role = requestedRole;
      if (!existingShopName) await client.query("INSERT INTO store_settings (singleton, shop_name) VALUES (TRUE, $1) ON CONFLICT (singleton) DO NOTHING", [shopName]);
    } else {
      await client.query("ROLLBACK");
      if (adminExists && !req.user && requestedRole === "administrator" && existingShopName && shopName.toLowerCase() !== existingShopName.toLowerCase()) {
        return res.status(400).json({ error: "Enter the existing shop name exactly to create an administrator account for this store." });
      }
      return res.status(403).json({ error: adminExists ? "Only an administrator can register accounts for this shop." : "Account setup is unavailable." });
    }

    const userId = `U-${crypto.randomUUID()}`;
    const isEmailContact = contact.type === "email";
    
    // TEMPORARY: Force verification for emails even if SMTP is missing so you can test it locally
    const requiresVerification = isEmailContact; 
    const isVerified = !requiresVerification;
    
    let verificationHash = null;
    if (requiresVerification) {
      verificationCodeToSend = String(Math.floor(100000 + Math.random() * 900000));
      verificationHash = hashEmailCode(contact.value, verificationCodeToSend);
      
      // Print the code directly to your VS Code terminal for local testing
      console.log("\n========================================");
      console.log(`[TEMPORARY EMAIL VERIFICATION CODE]`);
      console.log(`Email: ${contact.value}`);
      console.log(`Code: ${verificationCodeToSend}`);
      console.log("========================================\n");
    }

    const { rows } = await client.query(
      "INSERT INTO users (id, name, contact, contact_type, role, password_hash, is_verified, verification_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, contact, role, is_verified, created_at",
      [userId, name, contact.value, contact.type, role, hashPassword(password), isVerified, verificationHash]
    );
    user = { ...rows[0], shopName: role === "administrator" ? shopName : existingShopName || shopName };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email or phone number already exists." });
    throw error;
  } finally {
    client.release();
  }

  if (verificationCodeToSend && mailer) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: contact.value,
        subject: "Verify your StockWise account",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Welcome to StockWise, ${name}!</h2>
            <p>Please use the verification code below to verify your email address and activate your account:</p>
            <div style="font-size: 24px; font-weight: bold; background: #f4f6f8; padding: 12px 20px; display: inline-block; letter-spacing: 4px; border-radius: 6px; margin: 15px 0;">
              ${verificationCodeToSend}
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `
      });
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError);
    }
  }

  if ((initialAdministrator || publicAdministrator) && user.is_verified) {
    setSession(res, user);
  }

  res.status(201).json({ 
    user: publicUser(user), 
    role, 
    requiresVerification: !user.is_verified,
    message: !user.is_verified ? "Account created successfully. Check your terminal for the temporary test code." : undefined
  });
}));

app.post("/api/auth/verify-email", asyncRoute(async (req, res) => {
  const contact = normalizeContact(req.body.contact || req.body.email);
  const code = String(req.body.code || "").trim();
  if (!contact || !code) {
    return res.status(400).json({ error: "Provide a valid email and verification code." });
  }

  const { rows } = await pool.query("SELECT id, name, contact, role, is_verified, verification_hash FROM users WHERE lower(contact) = lower($1) AND contact_type = 'email'", [contact.value]);
  const user = rows[0];

  if (!user) {
    return res.status(404).json({ error: "Account not found." });
  }
  if (user.is_verified) {
    return res.json({ message: "Email is already verified. You can log in." });
  }

  const expectedHash = hashEmailCode(user.contact, code);
  if (!user.verification_hash || !safeHexEqual(user.verification_hash, expectedHash)) {
    return res.status(400).json({ error: "Invalid or incorrect verification code." });
  }

  await pool.query("UPDATE users SET is_verified = TRUE, verification_hash = NULL WHERE id = $1", [user.id]);
  res.json({ message: "Email verified successfully! You can now log in." });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const contact = normalizeContact(req.body.contact || req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const { rows } = await pool.query("SELECT u.id, u.name, u.contact, u.role, u.is_verified, u.password_hash, s.shop_name FROM users u LEFT JOIN store_settings s ON s.singleton = TRUE WHERE lower(u.contact) = lower($1)", [contact?.value || ""]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Email/phone number or password is incorrect." });
  if (user.is_verified === false) return res.status(403).json({ error: "Please verify your email address before logging in." });
  
  const sessionUser = { id: user.id, name: user.name, contact: user.contact, role: user.role, is_verified: user.is_verified, shopName: user.shop_name || "" };
  setSession(res, sessionUser);
  res.json({ user: publicUser(sessionUser) });
}));

app.post("/api/auth/logout", (req, res) => {
  const cookie = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`));
  if (cookie) sessions.delete(cookie.slice(sessionCookie.length + 1));
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).end();
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) return next();
  if (!req.user) return res.status(401).json({ error: "Please log in to continue." });
  next();
});

app.get("/api/products", asyncRoute(async (req, res) => {
  const query = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const { rows } = await pool.query("SELECT * FROM products WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR sku ILIKE '%' || $1 || '%' OR category ILIKE '%' || $1 || '%') AND ($2 = '' OR category = $2) ORDER BY name", [query, category]);
  res.json(rows.map(mapProduct));
}));
app.post("/api/products", requireRole("administrator"), asyncRoute(async (req, res) => {
  if (!validProduct(req.body)) return res.status(400).json({ error: "Enter a name, category, nonnegative price, whole-number quantity, and reorder level." });
  const sku = String(req.body.sku || `SKU-${Date.now().toString().slice(-6)}`).trim();
  try {
    const { rows } = await pool.query("INSERT INTO products (id, sku, name, category, price, cost, quantity, reorder_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *", [id("P"), sku, req.body.name.trim(), req.body.category.trim(), number(req.body.price), number(req.body.cost || 0), number(req.body.quantity), number(req.body.reorderLevel ?? 5)]);
    res.status(201).json(mapProduct(rows[0]));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That SKU is already in use." });
    throw error;
  }
}));
app.put("/api/products/:id", requireRole("administrator"), asyncRoute(async (req, res) => {
  if (!validProduct(req.body)) return res.status(400).json({ error: "Check the product details and enter valid nonnegative values." });
  const sku = String(req.body.sku || "").trim();
  try {
    const { rows } = await pool.query("UPDATE products SET sku = COALESCE(NULLIF($2, ''), sku), name = $3, category = $4, price = $5, cost = $6, quantity = $7, reorder_level = $8, updated_at = NOW() WHERE id = $1 RETURNING *", [req.params.id, sku, req.body.name.trim(), req.body.category.trim(), number(req.body.price), number(req.body.cost || 0), number(req.body.quantity), number(req.body.reorderLevel ?? 5)]);
    if (!rows[0]) return res.status(404).json({ error: "Product not found." });
    res.json(mapProduct(rows[0]));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That SKU is already in use." });
    throw error;
  }
}));
app.delete("/api/products/:id", requireRole("administrator"), asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
  res.status(204).end();
}));

app.get("/api/sales", asyncRoute(async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;
  const { rows: sales } = await pool.query("SELECT * FROM sales WHERE ($1::date IS NULL OR created_at::date >= $1::date) AND ($2::date IS NULL OR created_at::date <= $2::date) ORDER BY created_at DESC LIMIT 200", [from, to]);
  if (!sales.length) return res.json([]);
  const { rows: items } = await pool.query("SELECT * FROM sale_items WHERE sale_id = ANY($1::text[]) ORDER BY id", [sales.map(sale => sale.id)]);
  const grouped = new Map();
  for (const row of items) grouped.set(row.sale_id, [...(grouped.get(row.sale_id) || []), makeSaleItem(row)]);
  res.json(sales.map(sale => mapSale(sale, grouped.get(sale.id) || [])));
}));
app.post("/api/sales", requireRole("administrator", "sales_manager"), asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body.items) || !req.body.items.length) return res.status(400).json({ error: "Add at least one item to the sale." });
  const quantities = new Map();
  for (const item of req.body.items) {
    const quantity = number(item.quantity);
    if (typeof item.productId !== "string" || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: "Sale quantities must be whole numbers greater than zero." });
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + quantity);
  }
  const paymentMethod = ["Cash", "Card", "Mobile money"].includes(req.body.paymentMethod) ? req.body.paymentMethod : "Cash";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: products } = await client.query("SELECT * FROM products WHERE id = ANY($1::text[]) FOR UPDATE", [[...quantities.keys()]]);
    const byId = new Map(products.map(product => [product.id, product]));
    const lines = [];
    for (const [productId, quantity] of quantities) {
      const product = byId.get(productId);
      if (!product) { await client.query("ROLLBACK"); return res.status(400).json({ error: "A selected product no longer exists. Refresh and try again." }); }
      if (product.quantity < quantity) { await client.query("ROLLBACK"); return res.status(409).json({ error: `Not enough stock for ${product.name}. Available: ${product.quantity}.` }); }
      const priceCents = Math.round(number(product.price) * 100);
      const costCents = Math.round(number(product.cost) * 100);
      lines.push({ productId, sku: product.sku, name: product.name, quantity, unitPrice: priceCents / 100, unitCost: costCents / 100, lineTotal: priceCents * quantity / 100 });
    }
    const total = lines.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0) / 100;
    const saleId = id("S");
    await client.query("INSERT INTO sales (id, total, payment_method, created_by) VALUES ($1, $2, $3, $4)", [saleId, total, paymentMethod, req.user.id]);
    for (const line of lines) {
      await client.query("UPDATE products SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1", [line.productId, line.quantity]);
      await client.query("INSERT INTO sale_items (sale_id, product_id, sku, name, quantity, unit_price, unit_cost, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [saleId, line.productId, line.sku, line.name, line.quantity, line.unitPrice, line.unitCost, line.lineTotal]);
    }
    const { rows } = await client.query("SELECT * FROM sales WHERE id = $1", [saleId]);
    await client.query("COMMIT");
    res.status(201).json(mapSale(rows[0], lines));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

async function buildSummary() {
  const [stats, lowRows, todayRows, profitRows, activityRows, dailyRows] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total_products, COALESCE(SUM(quantity), 0)::int AS units_in_stock, COUNT(*) FILTER (WHERE quantity <= reorder_level)::int AS low_stock_count FROM products"),
    pool.query("SELECT * FROM products WHERE quantity <= reorder_level ORDER BY quantity, name LIMIT 50"),
    pool.query("SELECT COALESCE(SUM(total), 0)::float8 AS total FROM sales WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'"),
    pool.query("SELECT COALESCE(SUM((i.unit_price - i.unit_cost) * i.quantity), 0)::float8 AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.created_at >= CURRENT_DATE AND s.created_at < CURRENT_DATE + INTERVAL '1 day'"),
    pool.query("SELECT s.id, s.created_at, i.name, i.quantity FROM sales s JOIN sale_items i ON i.sale_id = s.id ORDER BY s.created_at DESC, i.id LIMIT 8"),
    pool.query("SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(SUM(s.total), 0)::float8 AS total FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(day) LEFT JOIN sales s ON s.created_at >= d.day AND s.created_at < d.day + INTERVAL '1 day' GROUP BY d.day ORDER BY d.day")
  ]);
  return {
    totalProducts: stats.rows[0].total_products,
    unitsInStock: stats.rows[0].units_in_stock,
    todaysSales: todayRows.rows[0].total,
    grossProfit: profitRows.rows[0].total,
    lowStockCount: stats.rows[0].low_stock_count,
    lowStockProducts: lowRows.rows.map(mapProduct),
    recentActivity: activityRows.rows.map(row => ({ type: "Sale", name: row.name, quantity: row.quantity, status: "Recorded", date: row.created_at, id: row.id })),
    dailySales: dailyRows.rows.map(row => ({ date: row.date, total: row.total }))
  };
}
app.get("/api/dashboard/summary", asyncRoute(async (req, res) => {
  const summary = await buildSummary();
  if (req.user.role !== "administrator") delete summary.grossProfit;
  res.json(summary);
}));
app.get("/api/reports/summary", requireRole("administrator"), asyncRoute(async (_req, res) => res.json(await buildSummary())));

app.use(asyncRoute(async (req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path === "/" || req.path === "/index.html") return req.user ? res.redirect("/dashboard.html") : next();
  if (!req.path.endsWith(".html")) return next();
  const { rows } = await pool.query("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'administrator') AS admin_exists");
  const { admin_exists: adminExists } = rows[0];
  if (req.path === "/login.html") {
    if (req.user) return res.redirect("/dashboard.html");
    if (!adminExists) return res.redirect("/signup.html");
    return next();
  }
  if (req.path === "/signup.html") {
    return next();
  }
  if (!req.user) return res.redirect(adminExists ? "/login.html" : "/signup.html");
  if (req.path === "/pages/reports.html" && req.user.role !== "administrator") return res.redirect("/dashboard.html");
  next();
}));

app.use(express.static(require("path").join(__dirname, ".."), { setHeaders: res => res.setHeader("Cache-Control", "no-store") }));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("Request failed:", error.code || error.name || "Error");
  res.status(500).json({ error: "The server could not complete that request. Check the backend logs." });
});

module.exports = app;