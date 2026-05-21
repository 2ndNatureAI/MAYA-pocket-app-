import { useState, useEffect } from 'react';
import {
  adminLogin,
  getPendingReviews,
  updateReviewStatus,
  exportLogs,
  clearAuthToken,
} from '../api';

export default function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [reviews, setReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      loadReviews();
      // Refresh reviews every 30 seconds
      const interval = setInterval(loadReviews, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      await adminLogin(username, password);
      setIsLoggedIn(true);
      setUsername('');
      setPassword('');
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadReviews() {
    try {
      const data = await getPendingReviews();
      setReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  }

  async function handleReviewAction(reviewId, status) {
    try {
      await updateReviewStatus(reviewId, status, reviewNotes);
      setReviews(reviews.filter((r) => r.id !== reviewId));
      setSelectedReview(null);
      setReviewNotes('');
    } catch (err) {
      alert('Error: ' + (err.message || 'Failed to update review'));
    }
  }

  async function handleExportLogs() {
    setExporting(true);
    try {
      const csv = await exportLogs(null, null, null, 'csv');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `maya-logs-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Error: ' + (err.message || 'Failed to export logs'));
    } finally {
      setExporting(false);
    }
  }

  function handleLogout() {
    clearAuthToken();
    setIsLoggedIn(false);
    setReviews([]);
    setSelectedReview(null);
  }

  if (!isLoggedIn) {
    return (
      <div className="admin-login-panel">
        <h2>🔐 Admin Login</h2>
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        {loginError && <p className="error">❌ {loginError}</p>}
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>👨‍💼 Admin Dashboard</h2>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <div className="admin-section">
        <h3>📋 Pending Reviews ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <p>✅ No pending reviews</p>
        ) : (
          <ul className="review-list">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="review-item"
                onClick={() => setSelectedReview(review)}
              >
                <div className="review-meta">
                  <strong>ID: {review.conversation_id.substring(0, 8)}...</strong>
                  <span className="review-reason">{review.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {selectedReview && (
          <div className="review-detail">
            <h4>Review Details</h4>
            <div className="detail-content">
              <p>
                <strong>Reason:</strong> {selectedReview.reason}
              </p>
              <p>
                <strong>Created:</strong> {new Date(selectedReview.created_at).toLocaleString()}
              </p>
              <textarea
                placeholder="Add review notes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
              <div className="detail-actions">
                <button
                  onClick={() => handleReviewAction(selectedReview.id, 'approved')}
                  className="btn-approve"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => handleReviewAction(selectedReview.id, 'rejected')}
                  className="btn-reject"
                >
                  ❌ Reject
                </button>
                <button
                  onClick={() => setSelectedReview(null)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h3>📊 Export Data</h3>
        <p>Download all conversations and activity logs as CSV</p>
        <button
          onClick={handleExportLogs}
          className="export-btn"
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : '📥 Export Logs as CSV'}
        </button>
      </div>
    </div>
  );
}
