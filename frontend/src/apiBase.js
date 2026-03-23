/**
 * Backend URL for fetch calls. Set in Vercel: VITE_API_BASE_URL = https://your-api.example.com
 * (no trailing slash). Defaults to local FastAPI for development.
 */
const raw = import.meta.env.VITE_API_BASE_URL;
export const API_BASE =
  typeof raw === "string" && raw.trim() !== ""
    ? raw.replace(/\/$/, "")
    : "http://localhost:8000";
