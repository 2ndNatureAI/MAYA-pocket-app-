import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '../api';

export default function ChatWidget({ clientId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState('');
  const [classification, setClassification] = useState(null);
  const [afterHours, setAfterHours] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!input.trim() || !clientId) return;

    const userMessage = input.trim();
    setInput('');
    setError('');
    setLoading(true);

    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await sendMessage(clientId, userMessage, conversationId);

      // Set conversation ID on first message
      if (!conversationId) {
        setConversationId(response.conversationId);
      }

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.message,
          classification: response.classification,
          requiresReview: response.requiresHumanReview,
        },
      ]);

      setClassification(response.classification);
      setAfterHours(response.isAfterHours);

      // Show system message if flagged for review
      if (response.requiresHumanReview) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: '🔍 This message has been flagged for human review.',
          },
        ]);
      }
    } catch (err) {
      setError(err.message || 'Failed to send message');
      // Remove user message if request failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setConversationId(null);
    setClassification(null);
    setError('');
  }

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <h3>💬 MAYA Assistant</h3>
        {afterHours && <span className="after-hours-badge">🌙 After Hours</span>}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>👋 Hi! I'm MAYA, your business assistant.</p>
            <p>How can I help you today?</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-bubble">
              {msg.content}
              {msg.classification && (
                <span className="classification-badge">
                  📂 {msg.classification}
                </span>
              )}
              {msg.requiresReview && (
                <span className="review-badge">🔍 Review Pending</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message message-assistant">
            <div className="message-bubble typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="chat-error">❌ {error}</div>}

      <form onSubmit={handleSendMessage} className="chat-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading || !clientId}
          autoFocus
        />
        <button type="submit" disabled={loading || !clientId}>
          Send
        </button>
      </form>

      {messages.length > 0 && (
        <button onClick={handleClear} className="clear-btn">
          Clear Conversation
        </button>
      )}
    </div>
  );
}
