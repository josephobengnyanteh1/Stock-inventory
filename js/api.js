// Local development API. Start the Express backend with `npm run dev`.
const API_BASE_URL = `${window.location.origin === "null" ? "http://localhost:3000" : window.location.origin}/api`;

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
  } catch {
    throw new Error("Can't reach the inventory server. Start the backend with npm run dev and reload this page.");
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}
