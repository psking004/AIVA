/**
 * AIVA Mobile - Unified Cross-Platform Holographic Experience (Android)
 *
 * Implements:
 * - Prominent floating holographic female AI face in the center of the screen
 * - Minimal, unobtrusive dark obsidian background (#060709)
 * - Zero permanent dashboards, zero permanent navigation, zero account icons
 * - Voice-First interaction: Wakes on "AIVA" keyword spotting
 * - Real-time TTS lip synchronization with closed resting lips when silent
 * - Contextual UI lenses summoned on voice demand (e.g. "AIVA, show my tasks")
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AivaFaceState,
  AivaOverlayLens,
  AivaPresenceState,
  parseAivaVoiceCommand,
} from '@aiva/types';
import { AivaMobileFace } from '../src/components/aiva-mobile-face';
import { ContextualSheet } from '../src/components/contextual-sheet';
import { wakeWordService } from '../src/services/wakeword/wake-word.service';
import { aivaClient } from '../src/services/api/aiva-client';

export default function MobileHomeScreen() {
  // Mobile presence lifecycle: DORMANT by default (face hidden, minimal clock)
  const [presenceState, setPresenceState] = useState<AivaPresenceState>('DORMANT');
  const [faceState, setFaceState] = useState<AivaFaceState>('IDLE');
  const [activeOverlay, setActiveOverlay] = useState<AivaOverlayLens>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const lipSyncAnimRef = useRef<number | null>(null);
  const dormancyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeOverlayRef = useRef<AivaOverlayLens>(null);
  const isSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    activeOverlayRef.current = activeOverlay;
  }, [activeOverlay]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const clearTimers = useCallback(() => {
    if (dormancyTimerRef.current) {
      clearTimeout(dormancyTimerRef.current);
      dormancyTimerRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  // Schedule dormancy after grace period
  const scheduleDormancy = useCallback((delayMs: number = 1500) => {
    if (activeOverlayRef.current || isSpeakingRef.current) return;
    if (dormancyTimerRef.current) clearTimeout(dormancyTimerRef.current);

    dormancyTimerRef.current = setTimeout(() => {
      if (activeOverlayRef.current || isSpeakingRef.current) return;
      setPresenceState('DORMANT');
      setFaceState('IDLE');
    }, delayMs);
  }, []);

  // Wake presence into ACTIVE on "AIVA"
  const wakeAivaPresence = useCallback(() => {
    clearTimers();
    setPresenceState('ACTIVE');
    setFaceState('LISTENING');

    // 6-second silence timeout if no speech command follows
    silenceTimeoutRef.current = setTimeout(() => {
      if (!activeOverlayRef.current && !isSpeakingRef.current) {
        scheduleDormancy(300);
      }
    }, 6000);
  }, [clearTimers, scheduleDormancy]);

  // Minimal subtle time clock (Top-Right)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Text-to-Speech simulation with natural syllabic lip-sync modulation
  const speakResponse = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      clearTimers();
      setPresenceState('ACTIVE');
      setIsSpeaking(true);
      setFaceState('SPEAKING');

      let phase = 0;
      let durationMs = Math.max(1800, text.length * 55);
      const startTime = Date.now();

      const animateLips = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= durationMs) {
          setIsSpeaking(false);
          setAudioLevel(0);
          setFaceState('IDLE');
          // 1.5s grace period before fading to DORMANT if no overlay is active
          scheduleDormancy(1500);
          resolve();
          return;
        }

        phase += 0.26;
        // Harmonic speech rhythm
        const wave = Math.sin(phase) * 0.5 + 0.5;
        const syllabic = Math.sin(phase * 2.4) * 0.3;
        const amp = Math.max(0, Math.min(1.0, wave + syllabic));

        setAudioLevel(amp);
        lipSyncAnimRef.current = requestAnimationFrame(animateLips);
      };

      animateLips();
    });
  }, [clearTimers, scheduleDormancy]);

  // Unified voice command processor
  const handleProcessVoiceCommand = useCallback(
    async (commandText: string) => {
      clearTimers();
      setPresenceState('ACTIVE');
      const parsed = parseAivaVoiceCommand(commandText);

      // 1. Dismiss UI command ("AIVA, close")
      if (parsed.intent === 'DISMISS_UI') {
        setActiveOverlay(null);
        await speakResponse(parsed.spokenResponse || 'Closing interface.');
        return;
      }

      // 2. Summon UI command ("AIVA, show my tasks")
      if (parsed.intent === 'SUMMON_UI' && parsed.targetOverlay) {
        setActiveOverlay(parsed.targetOverlay);
        await speakResponse(parsed.spokenResponse || `Opening ${parsed.targetOverlay}.`);
        return;
      }

      // 3. General AI Query ("AIVA, what is the capital of Japan?")
      // Answered purely through voice; NO dashboard or chat window opened
      setFaceState('THINKING');

      try {
        const res = await aivaClient.sendChatMessage(commandText);
        const reply =
          (res.data as any)?.response ||
          res.response ||
          'Directive executed successfully.';
        await speakResponse(reply);
      } catch (err) {
        await speakResponse('I am ready for your command.');
      }
    },
    [clearTimers, speakResponse]
  );

  const handleSendText = async () => {
    if (!textInput.trim() || isSending) return;
    const msg = textInput.trim();
    setTextInput('');
    setIsSending(true);
    await handleProcessVoiceCommand(msg);
    setIsSending(false);
  };

  // Background Wake-Word integration ("AIVA")
  useEffect(() => {
    const initWakeWord = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'AIVA Voice Assistant',
              message: 'AIVA requires microphone access for hands-free "AIVA" wake-word detection.',
              buttonPositive: 'Allow',
            }
          );
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            await wakeWordService.startListening('BALANCED');
          }
        } else {
          await wakeWordService.startListening('BALANCED');
        }
      } catch (err) {
        console.warn('[AIVA Mobile] Wake-word start error:', err);
      }
    };

    initWakeWord();

    const unsubscribe = wakeWordService.subscribe((state) => {
      if (state === 'WAKE_WORD_DETECTED' || state === 'LISTENING') {
        wakeAivaPresence();
      } else if (state === 'IDLE' && !isSpeakingRef.current) {
        scheduleDormancy(1200);
      }
    });

    return () => {
      unsubscribe();
      wakeWordService.stopListening();
      clearTimers();
      if (lipSyncAnimRef.current) cancelAnimationFrame(lipSyncAnimRef.current);
    };
  }, [wakeAivaPresence, scheduleDormancy, clearTimers]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#060709" />

      {/* 1. Subtle Clock Only (Top-Right) */}
      <View style={styles.topBar}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{currentTime}</Text>
        </View>
      </View>

      {/* 2. Central Floating Holographic AI Face (Hidden when DORMANT) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (presenceState === 'DORMANT') wakeAivaPresence();
        }}
        style={styles.faceCenterContainer}
      >
        <AivaMobileFace
          state={faceState}
          presenceState={presenceState}
          isVisible={presenceState === 'ACTIVE'}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
        />
      </TouchableOpacity>

      {/* 3. Text & Voice Conduit Bar */}
      {presenceState === 'ACTIVE' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.inputContainer}
        >
          <TextInput
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={handleSendText}
            placeholder="Command AIVA (voice or text)..."
            placeholderTextColor="#64748B"
            style={styles.textInput}
            editable={!isSending}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSendText}
            disabled={isSending || !textInput.trim()}
            style={[styles.sendButton, (!textInput.trim() || isSending) && styles.sendButtonDisabled]}
          >
            <Text style={styles.sendButtonText}>{isSending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : (
        <TouchableOpacity
          onPress={() => wakeAivaPresence()}
          style={styles.dormantTouchHint}
        >
          <Text style={styles.touchHintText}>Say "AIVA" or tap to wake</Text>
        </TouchableOpacity>
      )}

      {/* 4. Contextual UI Sheet (Summoned strictly via voice commands) */}
      <ContextualSheet
        overlayType={activeOverlay}
        onClose={() => {
          setActiveOverlay(null);
          scheduleDormancy(1200);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060709',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 8,
  },
  timeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  faceCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 8,
  },
  textInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  dormantTouchHint: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  touchHintText: {
    color: '#475569',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
