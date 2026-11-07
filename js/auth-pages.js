const authMessage = document.querySelector("#auth-message");
function showAuthMessage(message) { authMessage.textContent = message; authMessage.hidden = false; }
function clearAuthMessage() { authMessage.hidden = true; }

async function initLogin() {
  const status = await apiRequest("/auth/status");
  if (status.setupRequired) { window.location.replace("/signup.html"); return; }
  if (status.user) { window.location.replace("/"); return; }
  document.querySelector("#login-form").addEventListener("submit", async event => {
    event.preventDefault(); clearAuthMessage();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.currentTarget.querySelector("button"); button.disabled = true;
    try { await apiRequest("/auth/login", { method: "POST", body: JSON.stringify(data) }); window.location.replace("/"); }
    catch (error) { showAuthMessage(error.message); }
    finally { button.disabled = false; }
  });
}

async function initSignup() {
  const status = await apiRequest("/auth/status");
  if (!status.setupRequired && !status.managerRegistrationOpen) { window.location.replace(status.user ? "/" : "/login.html"); return; }
  const isManager = !status.setupRequired;
  const roleField = document.querySelector("#signup-role");
  const shopField = document.querySelector("#shop-name");
  if (isManager) {
    document.querySelector("#signup-eyebrow").textContent = "TEAM ACCOUNT";
    document.querySelector("#signup-title").textContent = "Register the sales manager";
    document.querySelector("#signup-copy").textContent = "Add a sales manager to your shop team.";
    document.querySelector('#signup-form button[type="submit"]').textContent = "Register sales manager";
    roleField.value = "sales_manager";
    roleField.querySelector('[value="administrator"]').disabled = true;
    shopField.value = status.shopName;
    shopField.readOnly = Boolean(status.shopName);
  } else {
    roleField.value = "administrator";
    roleField.querySelector('[value="sales_manager"]').disabled = true;
  }
  document.querySelector("#signup-form").addEventListener("submit", async event => {
    event.preventDefault(); clearAuthMessage();
    const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirmPassword) { showAuthMessage("The passwords do not match."); return; }
    delete data.confirmPassword;
    const button = form.querySelector("button"); button.disabled = true;
    try { await apiRequest("/auth/signup", { method: "POST", body: JSON.stringify(data) }); window.location.replace("/"); }
    catch (error) { showAuthMessage(error.message); }
    finally { button.disabled = false; }
  });
}

const authPage = window.location.pathname.endsWith("signup.html") ? initSignup : initLogin;
authPage().catch(error => showAuthMessage(error.message));
