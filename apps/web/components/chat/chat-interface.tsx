/**
 * AIVA Neural Chat Interface
 * Futuristic chat with glass panels, neon glows, and AI visualization
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { aivaClient } from '@aiva/api-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  code?: {
    filename: string;
    content: string;
  };
  actions?: {
    label: string;
    icon: string;
    action: () => void;
  }[];
}

interface ChatInterfaceProps {
  fullScreen?: boolean;
}

export function ChatInterface({ fullScreen }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Neural interface initialized. I'm AIVA, your intelligence assistant. How may I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aivaClient.chat(query, conversationId);
      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || 'Action completed.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error connecting to AIVA neural core: ${err.response?.data?.message || err.message || 'Check backend connection.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`
        flex flex-col glass-panel-dark rounded-2xl border border-white/10
        ${fullScreen ? 'h-full' : 'h-[600px]'}
      `}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/40">
          <span className="material-symbols-outlined text-blue-400 text-sm">psychology</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-headline text-sm font-bold text-blue-400">AIVA Neural Chat</span>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-zinc-500 text-sm">history</span>
          </button>
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-zinc-500 text-sm">settings</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6 space-y-6">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${message.role === 'user'
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                  : 'bg-blue-500/20 border border-blue-500/40'
                }
              `}
            >
              {message.role === 'user' ? (
                <span className="material-symbols-outlined text-white text-sm">person</span>
              ) : (
                <span className="material-symbols-outlined text-blue-400 text-sm">psychology</span>
              )}
            </div>

            {/* Message Content */}
            <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
              {/* Sender Info */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
                  {message.role === 'user' ? 'User' : 'AIVA Intelligence'}
                </span>
                <span className="text-[9px] text-zinc-600">
                  {mounted ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>

              {/* Bubble */}
              <div
                className={`
                  px-5 py-3.5 rounded-2xl border
                  ${message.role === 'user'
                    ? 'glass-panel rounded-tr-none border-white/10'
                    : 'glass-panel rounded-tl-none border-blue-500/20 neon-glow relative'
                  }
                `}
              >
                {/* Gradient overlay for AI messages */}
                {message.role === 'assistant' && (
                  <div className="absolute -inset-[1px] rounded-2xl rounded-tl-none bg-gradient-to-r from-blue-500/10 to-transparent opacity-50 pointer-events-none" />
                )}

                <p className="font-body text-sm leading-relaxed text-on-surface relative">
                  {message.content}
                </p>

                {/* Code Block */}
                {message.code && (
                  <div className="mt-4 bg-[#0a0a0a] rounded-lg border border-white/5 p-4 font-code-sm text-sm overflow-x-auto">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/5">
                      <span className="text-zinc-500 text-[10px] uppercase font-bold">{message.code.filename}</span>
                      <button className="text-blue-500 text-[10px] uppercase font-bold hover:text-blue-300 transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">content_copy</span>
                        Copy
                      </button>
                    </div>
                    <pre className="text-zinc-300">
                      <code>{message.code.content}</code>
                    </pre>
                  </div>
                )}

                {/* Action Buttons */}
                {message.actions && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {message.actions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={action.action}
                        className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30
                                   text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold
                                   flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-sm">{action.icon}</span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Loading State */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-400 text-sm animate-spin">progress_activity</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-tighter text-blue-400 mb-1">
                AIVA is calculating...
              </span>
              <div className="glass-panel px-4 py-3 rounded-2xl rounded-tl-none border-blue-500/20">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5">
        <form onSubmit={handleSubmit}>
          <div className="glass-panel p-1.5 rounded-2xl border border-white/10 flex items-center gap-1 focus-within:border-blue-500/50 transition-colors">
            <button
              type="button"
              className="p-3 text-zinc-500 hover:text-blue-400 transition-colors rounded-xl hover:bg-white/5"
            >
              <span className="material-symbols-outlined">add_circle</span>
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Issue neural command..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface font-body placeholder:text-zinc-600 py-2 px-2"
            />

            <div className="flex items-center gap-1 pr-1">
              <button
                type="button"
                className="p-2 text-zinc-500 hover:text-blue-400 transition-colors rounded-xl hover:bg-white/5"
              >
                <span className="material-symbols-outlined">mic</span>
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed
                           rounded-xl flex items-center justify-center text-zinc-950
                           transition-all active:scale-90 neon-glow"
              >
                <span className="material-symbols-outlined font-bold">arrow_upward</span>
              </button>
            </div>
          </div>
        </form>

        {/* Protocol Indicators */}
        <div className="mt-3 flex justify-center gap-6">
          <div className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity cursor-help">
            <span className="material-symbols-outlined text-[10px] text-zinc-500">security</span>
            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-500">Encrypted v3</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity cursor-help">
            <span className="material-symbols-outlined text-[10px] text-zinc-500">hub</span>
            <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-500">Edge: 0x7F</span>
          </div>
        </div>
      </div>
    </div>
  );
}
