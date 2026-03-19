/**
 * ChatInterface - AIVA chat interface component
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Paperclip, Mic } from 'lucide-react';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  fullScreen?: boolean;
}

export function ChatInterface({ fullScreen }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm AIVA, your personal AI assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
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
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getAIResponse(input),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const getAIResponse = (message: string): string => {
    // In production, this would call the AIVA API
    const lower = message.toLowerCase();
    if (lower.includes('task')) {
      return "I can help you manage tasks. Would you like me to create a new task, show your pending tasks, or help prioritize them?";
    }
    if (lower.includes('email')) {
      return "Let me check your emails. I can summarize your unread messages or extract tasks from them.";
    }
    if (lower.includes('calendar') || lower.includes('event')) {
      return "I can help with your calendar. Would you like to schedule a meeting, check your availability, or view upcoming events?";
    }
    if (lower.includes('note')) {
      return "I'll help you with notes. Would you like to create a new note, search existing ones, or organize them into folders?";
    }
    return "I understand. I'm here to help you manage your tasks, notes, emails, calendar, and automate your workflows. What would you like to do?";
  };

  return (
    <div
      className={`
        flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800
        ${fullScreen ? 'h-full' : 'h-[600px]'}
      `}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-500" />
        <span className="font-medium">AIVA Assistant</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${message.role === 'user' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
              `}
            >
              {message.role === 'user' ? (
                <User className="w-5 h-5 text-white" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </div>
            <div
              className={`
                max-w-[80%] p-3 rounded-2xl
                ${message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-tr-sm'
                  : 'bg-gray-100 dark:bg-gray-800 rounded-tl-sm'
                }
              `}
            >
              <p className="text-sm">{message.content}</p>
              <p
                className="text-xs opacity-60 mt-1"
                suppressHydrationWarning
              >
                {mounted ? message.timestamp.toLocaleTimeString() : ''}
              </p>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 dark:border-gray-800"
      >
        <div className="flex gap-2">
          <button
            type="button"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AIVA anything..."
            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          />
          <button
            type="button"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
}
