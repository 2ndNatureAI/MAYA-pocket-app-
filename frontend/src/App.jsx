import { useState, useEffect } from 'react';
import { checkHealth } from '../api';
import ChatWidget from './components/ChatWidget';
import AdminPanel from './components/AdminPanel';
import './App.css';

function App() {
  const [clientId, setClientId] = useState(
    localStorage.getItem('maya_client_id') || null
  );
  const [showAdmin, setShowAdmin] = useState(false);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initializeApp() {
      try {
        const healthData = await checkHealth();
        setHealth(healthData);
      } catch (err) {
        console.error('Health check failed:', err);
        setError('Backend unavailable. Check your environment variables.');
      } finally {
        setLoading(false);
      }
    }

    initializeApp();
  }, []);

  function handleSetClientId(id) {
    setClientId(id);
    localStorage.setItem('maya_client_id', id);
  }

  function handleToggleAdmin() {
    setShowAdmin(!showAdmin);
  }

  if (loading) {
    return (
      <div className="app loading">
        <div className="loader">🚀 Loading MAYA...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🤖 MAYA Pocket Desk</h1>
          <div className="header-info">
            {error ? (
              <span className="status-badge error">⚠️ {error}</span>
            ) : health ? (
              <>
                <span className="status-badge">
                  {health.openai?.status === 'ok' ? '⚡ OpenAI Ready' : '🔄 Mock Mode'}
                </span>
                <span className="status-badge">
                  {health.status === 'ok' ? '✅ Online' : '⚠️ Offline'}
                </span>
              </>
            ) : null}
          </div>
          <button
            onClick={handleToggleAdmin}
            className="admin-toggle-btn"
            title="Admin Panel"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className="app-main">
        {showAdmin ? (
          <AdminPanel />
        ) : clientId ? (
          <ChatWidget clientId={clientId} />
        ) : (
          <div className="client-select">
            <h2>👋 Welcome to MAYA</h2>
            <p>Enter your client ID to get started</p>
            <div className="client-form">
              <input
                type="text"
                placeholder="Paste your UUID here..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    handleSetClientId(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
              />
              <p className="hint">💡 Admin? Click ⚙️ to access the admin panel</p>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>MAYA © 2025 | Secure Business Assistant</p>
      </footer>
    </div>
  );
}

export default App;
