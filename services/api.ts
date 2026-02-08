
const API_BASE = "http://localhost:8000";

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  async post(endpoint: string, data: any) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(errorData.detail || "Request failed");
    }
    return response.json();
  },

  async login(formData: URLSearchParams) {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      body: formData,
      // No explicit Content-Type needed as fetch handles URLSearchParams automatically
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Invalid credentials" }));
        throw new Error(errorData.detail || "Login failed");
    }
    return response.json();
  },

  async get(endpoint: string) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: getHeaders()
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Fetch failed" }));
        throw new Error(errorData.detail || "Request failed");
    }
    return response.json();
  },

  async upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: formData
    });
    if (!response.ok) throw new Error("Upload failed");
    return response.json();
  }
};
