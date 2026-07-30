'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://profile-site-backend-63802277247.us-central1.run.app';

const STORAGE_KEY = 'ask-me-chat-history';

type Message = { role: 'user' | 'assistant'; text: string };

export default function AskMe() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const isFirstRender = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // corrupted or missing data — just start fresh
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      const data = await res.json();
      const text = res.ok
        ? data.answer
        : data.detail || 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Could not reach the assistant. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold mb-2">Ask me</h1>

      <div className="sticky top-0 z-10 bg-canvas flex items-start justify-between gap-4 mb-8 py-2">
        <p className="text-sage">
          Ask about Fang&apos;s resume, projects, or something a bit more fun.
        </p>
        {messages.length > 0 && (
          <button
            onClick={clearConversation}
            className="shrink-0 text-xs font-mono text-sage border border-hairline rounded-full px-3 py-1 hover:text-mint hover:border-mint transition-colors"
          >
            New conversation
          </button>
        )}
      </div>

      <div className="space-y-4 mb-6 min-h-[200px]">
        {messages.length === 0 && (
          <p className="text-sage text-sm italic">
            Try: &quot;What testing tools does she use?&quot; or &quot;Tell me something fun about her.&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-mint-soft text-ink'
                  : 'bg-canvas border border-hairline text-ink'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && <p className="text-sage text-sm font-mono">thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={1}
          className="flex-1 bg-canvas border border-hairline rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-mint"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-mint text-canvas px-4 py-2 rounded-lg text-sm font-mono disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
