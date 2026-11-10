const root = document.body.dataset.root || "";
const page = document.body.dataset.page;
const money = value => `GH₵ ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateTime = value => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
let currentUser = null;
const showMessage = (message, kind = "error") => {
  const el = document.querySelector("#page-message"); if (!el) return;
  el.textContent = message; el.className = `message ${kind}`; el.hidden = false;
  window.clearTimeout(showMessage.timer); showMessage.timer = window.setTimeout(() => { el.hidden = true; }, 6500);
};
const loadError = error => showMessage(error.message || "Something went wrong.");
const todayElement = document.querySelector("#today");
if (todayElement) todayElement.textContent = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date());

async function loadDashboard() {
  const data = await apiRequest("/dashboard/summary");
  document.querySelector("#stat-products").textContent = data.totalProducts.toLocaleString();
  document.querySelector("#stat-units").textContent = data.unitsInStock.toLocaleString();
  document.querySelector("#stat-sales").textContent = money(data.todaysSales);
  document.querySelector("#stat-profit").textContent = currentUser.role === "administrator" ? `Gross profit ${money(data.grossProfit)}` : "Sales manager view";
  document.querySelector("#stat-low").textContent = data.lowStockCount.toLocaleString();
  document.querySelector("#activity-body").innerHTML = data.recentActivity.length ? data.recentActivity.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td><span class="status">${esc(item.type)}</span></td><td>${item.quantity}</td><td>${dateTime(item.date)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">No sales recorded yet.</td></tr>`;
  document.querySelector("#low-stock-list").innerHTML = data.lowStockProducts.length ? data.lowStockProducts.slice(0, 6).map(p => `<div class="attention-row"><span><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · reorder at ${p.reorderLevel}</small></span><span class="stock-pill low">${p.quantity} left</span></div>`).join("") : `<p class="empty-state">All products are above their reorder levels.</p>`;
}

let allProducts = [];
async function loadProducts() {
  allProducts = await apiRequest("/products");
  const category = document.querySelector("#category-filter");
  if (category) {
    const selected = category.value;
    category.innerHTML = `<option value="">All categories</option>${[...new Set(allProducts.map(p => p.category))].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}`;
    category.value = selected;
  }
  renderProducts();
}
function renderProducts() {
  const body = document.querySelector("#products-body"); if (!body) return;
  const query = document.querySelector("#product-search").value.trim().toLowerCase();
  const category = document.querySelector("#category-filter").value;
  const products = allProducts.filter(p => (!query || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query)) && (!category || p.category === category));
  body.innerHTML = products.map(p => `<tr><td><strong>${esc(p.name)}</strong></td><td class="sku">${esc(p.sku)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.quantity}</td><td><span class="stock-pill ${p.quantity === 0 ? "out" : p.quantity <= p.reorderLevel ? "low" : "healthy"}">${p.quantity === 0 ? "Out of stock" : p.quantity <= p.reorderLevel ? "Low stock" : "In stock"}</span></td><td class="row-actions">${currentUser?.role === "administrator" ? `<button class="text-button" data-edit="${esc(p.id)}">Edit</button><button class="text-button danger-text" data-delete="${esc(p.id)}">Delete</button>` : ""}</td></tr>`).join("");
  document.querySelector("#product-count").textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
  document.querySelector("#product-empty").hidden = products.length > 0;
}
function initProducts() {
  const dialog = document.querySelector("#product-dialog"); const form = document.querySelector("#product-form");
  if (currentUser.role !== "administrator") document.querySelector("#add-product").hidden = true;
  const resetDialog = product => {
    form.reset(); form.elements.id.value = product?.id || "";
    document.querySelector("#product-dialog-title").textContent = product ? "Edit product" : "Add a product";
    if (product) for (const key of ["name", "sku", "category", "price", "cost", "quantity", "reorderLevel"]) form.elements[key].value = product[key] ?? "";
    dialog.showModal();
  };
  document.querySelector("#add-product").addEventListener("click", () => resetDialog());
  dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  document.querySelector("#product-search").addEventListener("input", renderProducts);
  document.querySelector("#category-filter").addEventListener("change", renderProducts);
  document.querySelector("#products-body").addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]");
    if (edit) resetDialog(allProducts.find(p => p.id === edit.dataset.edit));
    if (remove) {
      const product = allProducts.find(p => p.id === remove.dataset.delete);
      if (!window.confirm(`Delete ${product.name}?`)) return;
      try { await apiRequest(`/products/${encodeURIComponent(product.id)}`, { method: "DELETE" }); await loadProducts(); showMessage("Product deleted.", "success"); }
      catch (error) { loadError(error); }
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form));
    const id = values.id; delete values.id;
    const payload = { ...values, price: Number(values.price), cost: Number(values.cost || 0), quantity: Number(values.quantity), reorderLevel: Number(values.reorderLevel) };
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      await apiRequest(id ? `/products/${encodeURIComponent(id)}` : "/products", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      dialog.close(); await loadProducts(); showMessage(id ? "Product updated." : "Product added.", "success");
    } catch (error) { loadError(error); } finally { button.disabled = false; }
  });
  loadProducts().catch(loadError);
}

let cart = new Map();
function renderSaleProducts() {
  const query = document.querySelector("#sale-search").value.trim().toLowerCase();
  const found = allProducts.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(query));
  document.querySelector("#sale-products").innerHTML = found.length ? found.map(p => `<button type="button" class="sale-product ${p.quantity === 0 ? "unavailable" : ""}" data-add="${esc(p.id)}" ${p.quantity === 0 ? "disabled" : ""}><span class="product-mark">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="sale-product-info"><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${p.quantity} in stock</small></span><span class="sale-product-price">${money(p.price)}</span><span class="add-mark">＋</span></button>`).join("") : `<p class="empty-state">No products found. Add products before making a sale.</p>`;
}
function renderCart() {
  const entries = [...cart.values()]; const units = entries.reduce((n, item) => n + item.quantity, 0);
  document.querySelector("#cart-count").textContent = units ? `${units} item${units === 1 ? "" : "s"}` : "No items added";
  document.querySelector("#cart-items").innerHTML = entries.length ? entries.map(item => `<div class="cart-row"><div class="cart-title"><strong>${esc(item.name)}</strong><small>${money(item.price)} each</small></div><div class="quantity-stepper"><button type="button" data-step="-1" data-id="${esc(item.id)}" aria-label="Remove one">−</button><span>${item.quantity}</span><button type="button" data-step="1" data-id="${esc(item.id)}" aria-label="Add one" ${item.quantity >= item.stock ? "disabled" : ""}>＋</button></div><strong class="cart-line-total">${money(item.price * item.quantity)}</strong><button type="button" class="remove-item" data-remove="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">×</button></div>`).join("") : `<p class="empty-state">Choose a product to begin.</p>`;
  document.querySelector("#cart-total").textContent = money(entries.reduce((n,item) => n + item.price * item.quantity, 0));
  document.querySelector("#complete-sale").disabled = !entries.length;
}
async function loadSales() {
  const sales = await apiRequest("/sales"); const body = document.querySelector("#sales-body");
  body.innerHTML = sales.length ? sales.slice(0, 10).map(s => `<tr><td class="sku">${esc(s.id)}</td><td>${dateTime(s.createdAt)}</td><td>${s.items.reduce((n,i) => n + i.quantity, 0)}</td><td>${esc(s.paymentMethod)}</td><td><strong>${money(s.total)}</strong></td></tr>`).join("") : `<tr><td colspan="5" class="empty-state">No sales have been recorded yet.</td></tr>`;
}
function initSales() {
  const cartRoot = document.querySelector("#cart-items");
  document.querySelector("#sale-search").addEventListener("input", renderSaleProducts);
  document.querySelector("#sale-products").addEventListener("click", event => {
    const button = event.target.closest("[data-add]"); if (!button) return;
    const product = allProducts.find(p => p.id === button.dataset.add); const existing = cart.get(product.id);
    cart.set(product.id, { id: product.id, name: product.name, price: product.price, stock: product.quantity, quantity: Math.min(product.quantity, (existing?.quantity || 0) + 1) }); renderCart();
  });
  cartRoot.addEventListener("click", event => {
    const step = event.target.closest("[data-step]"); const remove = event.target.closest("[data-remove]");
    if (remove) cart.delete(remove.dataset.remove);
    if (step) { const item = cart.get(step.dataset.id); item.quantity = Math.min(item.stock, item.quantity + Number(step.dataset.step)); if (item.quantity < 1) cart.delete(item.id); }
    renderCart();
  });
  document.querySelector("#clear-cart").addEventListener("click", () => { cart.clear(); renderCart(); });
  document.querySelector("#complete-sale").addEventListener("click", async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      await apiRequest("/sales", { method: "POST", body: JSON.stringify({ items: [...cart.values()].map(item => ({ productId: item.id, quantity: item.quantity })), paymentMethod: document.querySelector("#payment-method").value }) });
      cart.clear(); renderCart(); await Promise.all([loadProducts(), loadSales()]); showMessage("Sale completed and stock updated.", "success");
    } catch (error) { loadError(error); } finally { button.disabled = cart.size === 0; }
  });
  Promise.all([loadProducts().then(renderSaleProducts), loadSales()]).catch(loadError);
}

async function loadReports() {
  const data = await apiRequest("/reports/summary");
  document.querySelector("#report-today").textContent = money(data.todaysSales);
  document.querySelector("#report-profit").textContent = money(data.grossProfit);
  document.querySelector("#report-products").textContent = data.totalProducts.toLocaleString();
  document.querySelector("#report-low").textContent = data.lowStockCount.toLocaleString();
  const max = Math.max(1, ...data.dailySales.map(day => day.total));
  document.querySelector("#sales-chart").innerHTML = data.dailySales.map(day => `<div class="chart-column"><span class="bar-value">${money(day.total)}</span><div class="bar-track"><div class="bar-fill" style="height:${Math.max(day.total ? 7 : 0, day.total / max * 100)}%"></div></div><span class="bar-label">${new Intl.DateTimeFormat("en-GH", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</span></div>`).join("");
  document.querySelector("#reorder-body").innerHTML = data.lowStockProducts.length ? data.lowStockProducts.map(p => `<tr><td><strong>${esc(p.name)}</strong></td><td class="sku">${esc(p.sku)}</td><td>${p.quantity}</td><td>${p.reorderLevel}</td><td><span class="stock-pill ${p.quantity === 0 ? "out" : "low"}">${p.quantity === 0 ? "Out of stock" : "Reorder soon"}</span></td></tr>`).join("") : `<tr><td colspan="5" class="empty-state">No products need reordering.</td></tr>`;
}

async function bootApp() {
  try { currentUser = await apiRequest("/auth/me"); }
  catch { window.location.replace(`${root}login.html`); return; }
  if (page === "reports" && currentUser.role !== "administrator") { window.location.replace(`${root}dashboard.html`); return; }

  const profile = document.querySelector(".sidebar-bottom");
  if (profile) {
    profile.querySelector("strong").textContent = currentUser.name;
    profile.querySelector("small").textContent = currentUser.role === "administrator" ? "Administrator" : "Sales manager";
    profile.querySelector(".avatar").textContent = currentUser.name.slice(0, 1).toUpperCase();
  }
  const shopLabel = document.querySelector(".sidebar-caption");
  if (shopLabel && currentUser.shopName) shopLabel.textContent = currentUser.shopName;
  if (currentUser.role !== "administrator") document.querySelector('.side-nav a[href$="reports.html"]')?.remove();

  const topbar = document.querySelector(".topbar");
  const controls = document.createElement("div"); controls.className = "auth-controls";
  const status = await apiRequest("/auth/status");
  if (status.managerRegistrationOpen) {
    const managerLink = document.createElement("a"); managerLink.className = "button button-light"; managerLink.href = `${root}signup.html?role=sales_manager`; managerLink.textContent = "＋ Register sales manager"; controls.append(managerLink);
    const adminLink = document.createElement("a"); adminLink.className = "button button-light"; adminLink.href = `${root}signup.html?role=administrator`; adminLink.textContent = "＋ Register administrator"; controls.append(adminLink);
  }
  const identity = document.createElement("span"); identity.className = "signed-in-user"; identity.innerHTML = `<strong>${esc(currentUser.name)}</strong><small>${currentUser.role === "administrator" ? "Administrator" : "Sales manager"}</small>`;
  const logout = document.createElement("button"); logout.type = "button"; logout.className = "button button-light"; logout.textContent = "Log out";
  logout.addEventListener("click", async () => { try { await apiRequest("/auth/logout", { method: "POST" }); } finally { window.location.replace(`${root}login.html`); } });
  controls.append(identity, logout); topbar.append(controls);

  ({ dashboard: () => loadDashboard().catch(loadError), products: initProducts, sales: initSales, reports: () => loadReports().catch(loadError) })[page]?.();
}
bootApp().catch(loadError);
