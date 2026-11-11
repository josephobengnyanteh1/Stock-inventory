const authMessage = document.querySelector("#auth-message");
function showAuthMessage(message) { authMessage.textContent = message; authMessage.hidden = false; }
function clearAuthMessage() { authMessage.hidden = true; }
function normalizeContactInput(contact, countrySelector) {
  const value = String(contact || "").trim();
  if (value.includes("@") || value.startsWith("+")) return value;
  const countryCode = (countrySelector ? document.querySelector(countrySelector).value : "+233").replace(/\D/g, "");
  const phoneDigits = value.replace(/\D/g, "");
  return `+${phoneDigits.startsWith(countryCode) ? phoneDigits : countryCode + phoneDigits.replace(/^0+/, "")}`;
}

async function initLogin() {
  const status = await apiRequest("/auth/status");
  if (status.setupRequired) { window.location.replace("/signup.html"); return; }
  if (status.user) { window.location.replace("/dashboard.html"); return; }
  document.querySelector("#login-form").addEventListener("submit", async event => {
    event.preventDefault(); clearAuthMessage();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.contact = normalizeContactInput(data.contact, "#login-country");
    const button = event.currentTarget.querySelector("button"); button.disabled = true;
    try { await apiRequest("/auth/login", { method: "POST", body: JSON.stringify(data) }); window.location.replace("/dashboard.html"); }
    catch (error) { showAuthMessage(error.message); }
    finally { button.disabled = false; }
  });
}

async function initSignup() {
  const status = await apiRequest("/auth/status");
  const form = document.querySelector("#signup-form");
  if (!status.setupRequired && status.user && !status.managerRegistrationOpen) {
    document.querySelector("#signup-eyebrow").textContent = "ACCOUNT REGISTRATION";
    document.querySelector("#signup-title").textContent = "Registration is managed by your administrator";
    document.querySelector("#signup-copy").textContent = "Ask your shop administrator to create your account, or log in if you already have one.";
    form.hidden = true;
    document.querySelector("#auth-message").hidden = true;
    return;
  }
  form.hidden = false;
  const roleField = document.querySelector("#signup-role");
  const shopField = document.querySelector("#shop-name");
  const requestedRole = new URLSearchParams(window.location.search).get("role");
  const publicSignup = !status.setupRequired && !status.user;
  const role = publicSignup || status.setupRequired ? "administrator" : requestedRole === "administrator" ? "administrator" : "sales_manager";
  const isManager = role === "sales_manager";
  if (publicSignup) {
    document.querySelector("#signup-eyebrow").textContent = "CREATE YOUR ACCOUNT";
    document.querySelector("#signup-title").textContent = "Sign up as an administrator";
    document.querySelector("#signup-copy").textContent = "Enter this store’s registered shop name to create an administrator account.";
    document.querySelector('#signup-form button[type="submit"]').textContent = "Create administrator account";
    roleField.value = "";
    roleField.querySelector('[value="sales_manager"]').disabled = true;
  } else if (isManager) {
    document.querySelector("#signup-eyebrow").textContent = "TEAM ACCOUNT";
    document.querySelector("#signup-title").textContent = "Register a sales manager";
    document.querySelector("#signup-copy").textContent = "Add another sales manager to your shop team.";
    document.querySelector('#signup-form button[type="submit"]').textContent = "Register sales manager";
    roleField.value = "sales_manager";
    roleField.querySelector('[value="administrator"]').disabled = true;
  } else if (!status.setupRequired) {
    document.querySelector("#signup-eyebrow").textContent = "TEAM ACCOUNT";
    document.querySelector("#signup-title").textContent = "Register an administrator";
    document.querySelector("#signup-copy").textContent = "Add an administrator account to your shop team.";
    document.querySelector('#signup-form button[type="submit"]').textContent = "Register administrator";
    roleField.value = "administrator";
    roleField.querySelector('[value="sales_manager"]').disabled = true;
  } else {
    roleField.value = "";
    roleField.querySelector('[value="sales_manager"]').disabled = true;
  }
  if (!status.setupRequired && !publicSignup) {
    shopField.value = status.shopName;
    shopField.readOnly = Boolean(status.shopName);
  } else if (publicSignup) {
    shopField.value = "";
    shopField.readOnly = false;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); clearAuthMessage();
    const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirmPassword) { showAuthMessage("The passwords do not match."); return; }
    data.contact = normalizeContactInput(data.contact);
    delete data.confirmPassword;
    delete data.terms;
    const button = form.querySelector("button"); button.disabled = true;
    try { 
      const response = await apiRequest("/auth/signup", { method: "POST", body: JSON.stringify(data) }); 
      if (response.requiresVerification) {
        form.hidden = true;
        document.querySelector("#signup-title").textContent = "Check your email";
        document.querySelector("#signup-copy").textContent = "We’ve sent a verification code to your email address. Enter it on the verification screen to activate your account.";
        showAuthMessage(response.message || "Account created successfully. Please check your email.");
      } else {
        window.location.replace("/dashboard.html"); 
      }
    }
    catch (error) { showAuthMessage(error.message); }
    finally { button.disabled = false; }
  });
}

const authPage = window.location.pathname.endsWith("signup.html") ? initSignup : initLogin;
authPage().catch(error => showAuthMessage(error.message));