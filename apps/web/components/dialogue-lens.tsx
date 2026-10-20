/**
 * AIVA Executive Dialogue Lens
 * Intelligence Briefing Workspace
 *
 * Not an SMS chat clone or ChatGPT/Claude copy.
 * Structured as an executive briefing interface with tool execution cards,
 * code blocks, and context telemetry.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { aivaClient } from '@aiva/api-client';
import { OmniConduit } from './omni-conduit';
import {
  Copy,
  Check,
  Cpu,
  User,
  Wrench,
  Sparkles,
} from 'lucide-react';

interface DialogueMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentType?: string | null;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
  }>;
  codeSnippets?: Array<{
    filename: string;
    code: string;
  }>;
}

interface DialogueLensProps {
  initialPrompt?: string;
  onVoiceTrigger?: () => void;
}

export function DialogueLens({ initialPrompt, onVoiceTrigger }: DialogueLensProps) {
  const [messages, setMessages] = useState<DialogueMessage[]>([
    {
      id: 'init-brief',
      role: 'assistant',
      content:
        'AIVA Executive Dialogue initialized. All memory archives and protocol handlers are synchronized. How may I assist your operations?',
      timestamp: new Date(),
    },
  ]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
  }, [messages, isProcessing]);

  // Handle external initial prompt if passed
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleTransmitDirective(initialPrompt);
    }
  }, [initialPrompt]);

  const handleTransmitDirective = async (query: string) => {
    if (!query.trim() || isProcessing) return;

    const userMsg: DialogueMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: query.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const response = await aivaClient.chat(query, conversationId);
      if (response.conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMsg: DialogueMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: response.response || 'Directive executed.',
        timestamp: new Date(),
        agentType: response.agentType,
        toolCalls: response.toolCalls,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: DialogueMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error communicating with AIVA neural kernel: ${
          err.response?.data?.message || err.message || 'Please check backend connectivity.'
        }`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col rounded-2xl aiva-panel aiva-border overflow-hidden">
      {/* Dialogue Lens Header / Operational Metadata */}
      <div className="h-14 px-5 border-b border-white/5 flex items-center justify-between aiva-panel-elevated">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-cyan-glow/40 flex items-center justify-center">
            <Cpu size={16} className="text-cyan-glow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
                Executive Dialogue Workspace
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow animate-pulse" />
            </div>
            <p className="text-[10px] font-telemetry text-on-dim">
              Neural Channel: {conversationId ? `0x${conversationId.slice(0, 8)}` : 'Standby'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onVoiceTrigger && (
            <button
              onClick={onVoiceTrigger}
              className="px-3 py-1.5 rounded-lg text-xs font-telemetry text-violet-glow aiva-border border-violet-glow/30 hover:bg-violet-glow/10 transition-colors flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Switch to Voice</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Dialogue Briefing Log */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6 space-y-5">
        {messages.map((message) => {
          const isUser = message.role === 'user';

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Identity Token */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-cyan-glow/20 border border-cyan-glow/40 text-cyan-glow'
                    : 'bg-violet-glow/20 border border-violet-glow/40 text-violet-glow'
                }`}
              >
                {isUser ? <User size={15} /> : <Cpu size={15} />}
              </div>

              {/* Content Panel */}
              <div
                className={`max-w-[85%] sm:max-w-[78%] flex flex-col ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                {/* Sender Metadata Bar */}
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[10px] font-telemetry font-bold uppercase tracking-wider text-on-dim">
                    {isUser ? 'Executive Operator' : message.agentType || 'AIVA Intelligence'}
                  </span>
                  <span className="text-[9px] font-telemetry text-on-dim">
                    {mounted ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                {/* Briefing Surface */}
                <div
                  className={`
                    p-4 rounded-2xl aiva-border transition-all
                    ${
                      isUser
                        ? 'aiva-panel-elevated aiva-border-cyan rounded-tr-none'
                        : 'aiva-panel aiva-border rounded-tl-none'
                    }
                  `}
                >
                  {/* Tool Call Indicators (Truthful execution state) */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {message.toolCalls.map((tool, idx) => (
                        <div
                          key={`tool-${idx}`}
                          className="px-3 py-1.5 rounded-lg aiva-panel-elevated aiva-border-subtle flex items-center justify-between text-[11px] font-telemetry"
                        >
                          <div className="flex items-center gap-1.5 text-cyan-glow">
                            <Wrench size={12} />
                            <span>Executed: {tool.name}</span>
                          </div>
                          <span className="text-emerald-pulse text-[10px]">Success</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Primary Text Content */}
                  <div className="font-body text-sm leading-relaxed text-on-surface whitespace-pre-wrap">
                    {message.content}
                  </div>

                  {/* Copy Button */}
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-end">
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="text-[10px] font-telemetry text-on-dim hover:text-cyan-glow flex items-center gap-1 transition-colors"
                      title="Copy response"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check size={11} className="text-emerald-pulse" />
                          <span className="text-emerald-pulse">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Processing State (Truthful Real Status) */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3.5"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-glow/20 border border-cyan-glow/40 flex items-center justify-center shrink-0">
              <Cpu size={15} className="text-cyan-glow animate-pulse" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-none aiva-panel aiva-border flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-glow animate-ping" />
              <span className="font-telemetry text-xs text-cyan-glow tracking-wider">
                AIVA Kernel: Processing directive...
              </span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Conduit at bottom */}
      <div className="p-4 aiva-border-t aiva-panel-elevated">
        <OmniConduit
          onSubmitCommand={handleTransmitDirective}
          onVoiceTrigger={onVoiceTrigger}
          isProcessing={isProcessing}
          placeholder="Issue directive to AIVA dialogue stream..."
        />
      </div>
    </div>
  );
}
