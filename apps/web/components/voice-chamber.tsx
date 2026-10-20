/**
 * AIVA Acoustic Voice Chamber
 * First-Class Autonomous Vocal Interface Mode
 *
 * Immersive acoustic environment with live speech transcription,
 * audio-reactive resonance geometry via AivaCore, and truthful state transitions.
 *
 * States: IDLE, LISTENING, PROCESSING, SPEAKING
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { aivaClient } from '@aiva/api-client';
import { AivaCore, AivaCoreState } from './aiva-core';
import { Mic, MicOff, X, ArrowRight } from 'lucide-react';

interface VoiceChamberProps {
  onExit?: () => void;
  onNavigateToDialogue?: (initialPrompt?: string) => void;
}

export function VoiceChamber({ onExit, onNavigateToDialogue }: VoiceChamberProps) {
  const [vocalState, setVocalState] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING'>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported by the browser
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setVocalState('LISTENING');
        setErrorMsg(null);
        setAudioLevel(0.6);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
        setAudioLevel(Math.min(1, 0.4 + currentTranscript.length * 0.05));
      };

      recognition.onerror = (event: any) => {
        setVocalState('IDLE');
        setAudioLevel(0);
        if (event.error !== 'no-speech') {
          setErrorMsg(`Voice perception: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setAudioLevel(0);
        // If we captured speech, process it
        if (transcript.trim()) {
          processVocalDirective(transcript.trim());
        } else {
          setVocalState('IDLE');
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [transcript]);

  // Handle Voice Directive execution
  const processVocalDirective = async (query: string) => {
    setVocalState('PROCESSING');
    try {
      const result = await aivaClient.chat(query);
      const responseText = result.response || 'Directive acknowledged.';
      setAssistantResponse(responseText);
      setVocalState('SPEAKING');

      // Speech Synthesis if available
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(responseText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onend = () => {
          setVocalState('IDLE');
        };
        utterance.onerror = () => {
          setVocalState('IDLE');
        };
        window.speechSynthesis.speak(utterance);
      } else {
        // Fallback timer if speech synthesis is not active
        setTimeout(() => setVocalState('IDLE'), 4000);
      }
    } catch (err: any) {
      setErrorMsg('Failed to process vocal directive.');
      setVocalState('IDLE');
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setAssistantResponse('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Recognition might already be running
        recognitionRef.current.stop();
        setTimeout(() => recognitionRef.current.start(), 200);
      }
    } else {
      // Browser doesn't support Web Speech API
      setErrorMsg('Speech perception requires a compatible browser (Chrome, Edge, Safari).');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // Map chamber state to core state
  const coreState: AivaCoreState =
    vocalState === 'LISTENING'
      ? 'LISTENING'
      : vocalState === 'PROCESSING'
      ? 'THINKING'
      : vocalState === 'SPEAKING'
      ? 'SPEAKING'
      : 'IDLE';

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex flex-col items-center justify-between p-6 rounded-3xl aiva-panel aiva-border overflow-hidden select-none">
      {/* Top Controls */}
      <div className="w-full flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
          <span className="font-telemetry text-xs font-bold tracking-widest text-on-surface uppercase">
            Acoustic Resonance Chamber
          </span>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToDialogue && transcript && (
            <button
              onClick={() => onNavigateToDialogue(transcript)}
              className="text-xs font-telemetry text-cyan-glow hover:underline flex items-center gap-1 uppercase tracking-wider"
            >
              <span>View in Dialogue</span>
              <ArrowRight size={13} />
            </button>
          )}

          {onExit && (
            <button
              onClick={onExit}
              className="p-2 text-on-dim hover:text-on-surface rounded-xl aiva-border hover:bg-white/5 transition-colors"
              aria-label="Exit Voice Chamber"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Central AIVA Nucleus Visualizer */}
      <div className="relative z-10 flex flex-col items-center my-auto">
        <AivaCore
          state={coreState}
          audioLevel={audioLevel}
          size="hero"
          statusText={
            vocalState === 'LISTENING'
              ? 'Perceiving acoustic frequencies...'
              : vocalState === 'PROCESSING'
              ? 'Synthesizing voice directive...'
              : vocalState === 'SPEAKING'
              ? 'Acoustic emission active'
              : 'Standby. Press to articulate directive.'
          }
        />

        {/* Real-time Audio Reactive Wave Bars */}
        {vocalState === 'LISTENING' && (
          <div className="flex items-center gap-1 mt-6 h-8">
            {[40, 75, 55, 90, 65, 80, 45, 95, 60, 70].map((h, i) => (
              <motion.div
                key={i}
                className="w-1 bg-cyan-glow rounded-full"
                animate={{
                  height: [8, (h * audioLevel) / 2 + 10, 8],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.4 + i * 0.05,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        )}

        {/* Transcript / Response Display */}
        <div className="mt-8 max-w-xl text-center px-4">
          <AnimatePresence mode="wait">
            {transcript && vocalState === 'LISTENING' && (
              <motion.p
                key="transcript"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-headline text-lg sm:text-xl text-cyan-glow font-medium leading-relaxed"
              >
                "{transcript}"
              </motion.p>
            )}

            {assistantResponse && vocalState === 'SPEAKING' && (
              <motion.div
                key="response"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-5 rounded-2xl aiva-panel-elevated aiva-border text-on-surface text-sm sm:text-base font-body leading-relaxed max-h-48 overflow-y-auto scrollbar-hide"
              >
                {assistantResponse}
              </motion.div>
            )}
          </AnimatePresence>

          {errorMsg && (
            <p className="mt-4 text-xs font-telemetry text-amber-solar">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* Bottom Vocal Activation Cluster */}
      <div className="w-full flex flex-col items-center gap-3 z-20 pb-4">
        {vocalState === 'LISTENING' ? (
          <button
            onClick={stopListening}
            className="px-6 py-3 rounded-full aiva-panel border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-telemetry uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <MicOff size={16} />
            <span>Terminate Perception</span>
          </button>
        ) : (
          <button
            onClick={startListening}
            className="px-8 py-3.5 rounded-full bg-cyan-glow text-obsidian-950 font-telemetry text-xs font-bold tracking-widest uppercase hover:bg-cyan-glow/90 shadow-aiva-cyan transition-all active:scale-95 flex items-center gap-2"
          >
            <Mic size={16} />
            <span>Articulate Directive</span>
          </button>
        )}

        <p className="text-[10px] font-telemetry text-on-dim">
          AIVA Vocal Interface: Integrated with Web Speech Perception
        </p>
      </div>
    </div>
  );
}
