// Shared API helper. Update this URL if your backend uses another port.
// The backend developer should enable CORS for the frontend development origin.
const API_BASE_URL = "http://localhost:3000/api";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Example:
// const products = await apiRequest("/products");
