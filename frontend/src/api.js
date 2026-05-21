// API client for frontend
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
  localStorage.setItem('maya_auth_token', token);
}

export function getAuthToken() {
  if (authToken) return authToken;
  authToken = localStorage.getItem('maya_auth_token');
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('maya_auth_token');
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// ============= ADMIN API =============
export async function adminLogin(username, password) {
  const res = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }

  const { token } = await res.json();
  setAuthToken(token);
  return token;
}

// ============= CHAT API =============
export async function sendMessage(clientId, message, conversationId) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      clientId,
      message,
      conversationId,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Chat failed');
  }

  return res.json();
}

// ============= REVIEW API =============
export async function getPendingReviews() {
  const res = await fetch(`${API_URL}/api/reviews`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to load reviews');
  }

  return res.json();
}

export async function updateReviewStatus(reviewId, status, notes) {
  const res = await fetch(`${API_URL}/api/reviews/${reviewId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status, notes }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update review');
  }

  return res.json();
}

// ============= LOGS API =============
export async function exportLogs(clientId, startDate, endDate, format = 'json') {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  params.append('format', format);

  const res = await fetch(`${API_URL}/api/logs/export?${params}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to export logs');
  }

  if (format === 'csv') {
    return res.text();
  }
  return res.json();
}

// ============= HEALTH CHECK =============
export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) {
    throw new Error('Health check failed');
  }
  return res.json();
}
