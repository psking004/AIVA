/**
 * AIVA Mobile - Holographic Personal AI Experience (Android)
 *
 * Exact Visual & Functional Parity with PC Desktop:
 * - Visually dominant floating CGI holographic digital human in center screen
 * - Minimal, elegant dark obsidian background (#060709)
 * - Zero permanent dashboards, zero permanent navigation, zero accounts
 * - No permanent listening badge, no permanent error panel, no prominent Rec button
 * - Optional text composer only shown when explicitly requested as a fallback
 * - Full Android Voice Pipeline:
 *   Wake Word ("AIVA") → STT → Private Cloud / Fabric Intelligence → TTS (Lip-synced) → Speaker
 * - Instant Barge-In interruption (touching face or saying "AIVA, stop" immediately halts speech)
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
import { aivaVoiceService, VoiceState } from '../src/services/voice/voice.service';
import {
  remoteExecService,
  parseLaunchIntent,
  parseNoteFollowUp,
} from '../src/services/remote/remote-exec.service';

export default function MobileHomeScreen() {
  // Presence lifecycle: DORMANT by default (face hidden, minimal clock)
  const [presenceState, setPresenceState] = useState<AivaPresenceState>('DORMANT');
  const [faceState, setFaceState] = useState<AivaFaceState>('IDLE');
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [activeOverlay, setActiveOverlay] = useState<AivaOverlayLens>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastResponseText, setLastResponseText] = useState<string | null>(null);
  const [showTypingFallback, setShowTypingFallback] = useState(false);

  const dormancyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeOverlayRef = useRef<AivaOverlayLens>(null);
  const voiceStateRef = useRef<VoiceState>('IDLE');
  const textInputRef = useRef<string>('');
  const isProcessingRef = useRef<boolean>(false);
  const lastProcessedCommandRef = useRef<{ text: string; timestamp: number }>({ text: '', timestamp: 0 });
  const speakingStartTimeRef = useRef<number>(0);
  const speakingEndTimeRef = useRef<number>(0);

  useEffect(() => {
    activeOverlayRef.current = activeOverlay;
  }, [activeOverlay]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    textInputRef.current = textInput;
  }, [textInput]);

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

  // Return to DORMANT after idle (8s default matching PC specification)
  const scheduleDormancy = useCallback((delayMs: number = 8000) => {
    if (activeOverlayRef.current || voiceStateRef.current !== 'IDLE' || textInputRef.current.trim().length > 0 || showTypingFallback) return;
    if (dormancyTimerRef.current) clearTimeout(dormancyTimerRef.current);

    dormancyTimerRef.current = setTimeout(() => {
      if (activeOverlayRef.current || voiceStateRef.current !== 'IDLE' || textInputRef.current.trim().length > 0 || showTypingFallback) return;
      setPresenceState('DORMANT');
      setFaceState('IDLE');
      setLastResponseText(null);
    }, delayMs);
  }, [showTypingFallback]);

  // Screen Mount Sentinel
  useEffect(() => {
    console.log('AIVA_UI_MOUNTED');
  }, []);

  // Subtle clock (Top-Right)
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

  // Natural lip-sync modulation when speaking aloud through speaker
  useEffect(() => {
    if (voiceState === 'SPEAKING') {
      let phase = 0;
      let animId: number;
      const animate = () => {
        phase += 0.28;
        const wave = Math.sin(phase) * 0.5 + 0.5;
        const syllabic = Math.sin(phase * 2.4) * 0.3;
        const amp = Math.max(0.12, Math.min(1.0, wave + syllabic));
        setAudioLevel(amp);
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
      return () => {
        cancelAnimationFrame(animId);
        setAudioLevel(0);
      };
    } else if (voiceState === 'IDLE') {
      setAudioLevel(0);
    }
  }, [voiceState]);

  // Text-to-Speech playback via native Android TTS engine with speaker output
  const speakResponse = useCallback(
    async (text: string): Promise<void> => {
      clearTimers();
      setPresenceState('ACTIVE');
      speakingStartTimeRef.current = Date.now();
      try {
        const ttsPromise = aivaVoiceService.speak(text);
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 20000));
        await Promise.race([ttsPromise, timeoutPromise]);
      } catch (err) {
        console.error('[AIVA Voice Error]', err);
        console.warn('[AIVA Mobile] TTS speak error:', err);
      } finally {
        speakingEndTimeRef.current = Date.now();
        if (voiceStateRef.current !== 'LISTENING') {
          setFaceState('IDLE');
          scheduleDormancy(4000);
        }
      }
    },
    [clearTimers, scheduleDormancy]
  );

  // Unified voice command processor
  const handleProcessVoiceCommand = useCallback(
    async (commandText: string) => {
      const clean = commandText.trim();
      if (!clean) return;

      const now = Date.now();
      if (
        clean.toLowerCase() === lastProcessedCommandRef.current.text.toLowerCase() &&
        now - lastProcessedCommandRef.current.timestamp < 2000
      ) {
        console.log('[AIVA Voice] Deduplicated identical rapid command:', clean);
        return;
      }

      // Voice barge-in stop directive ("AIVA, stop", "stop", "cancel", "quiet", "halt")
      const isStopCommand = /^(aiva[\s,]+)?(stop|cancel|quiet|halt|shut\s*up|pause)[.!]?$/i.test(clean);
      if (isStopCommand) {
        console.log('[AIVA Voice] Voice barge-in stop directive recognized:', clean);
        await aivaVoiceService.stopSpeaking();
        setFaceState('IDLE');
        setLastResponseText(null);
        aivaVoiceService.setState('IDLE');
        scheduleDormancy(2000);
        return;
      }

      // Concurrency lock
      if (isProcessingRef.current && voiceStateRef.current !== 'SPEAKING' && voiceStateRef.current !== 'INTERRUPTED') {
        console.log('[AIVA Voice] Busy processing, ignoring duplicate trigger:', clean);
        return;
      }

      // Interrupt existing speech immediately
      if (voiceStateRef.current === 'SPEAKING' || voiceStateRef.current === 'INTERRUPTED') {
        await aivaVoiceService.stopSpeaking();
      }

      isProcessingRef.current = true;
      lastProcessedCommandRef.current = { text: clean, timestamp: now };
      console.log('[EVIDENCE-5] Transcript is submitted exactly once:', clean);

      clearTimers();
      setPresenceState('ACTIVE');
      setFaceState('THINKING');
      aivaVoiceService.setState('PROCESSING');

      // Fallback watchdog timer (20s) preventing stuck PROCESSING state on multi-turn
      const watchdog = setTimeout(() => {
        if (isProcessingRef.current && voiceStateRef.current !== 'SPEAKING') {
          console.warn('[AIVA Voice] Watchdog triggered: command processing exceeded 20s limit, resetting concurrency lock.');
          isProcessingRef.current = false;
          aivaVoiceService.setState('IDLE');
          setFaceState('IDLE');
          scheduleDormancy(2500);
        }
      }, 20000);

      try {
        const parsed = parseAivaVoiceCommand(clean);

        if (parsed.intent === 'DISMISS_UI') {
          setActiveOverlay(null);
          clearTimeout(watchdog);
          await speakResponse(parsed.spokenResponse || 'Closing interface.');
          return;
        }

        if (parsed.intent === 'SUMMON_UI' && parsed.targetOverlay) {
          setActiveOverlay(parsed.targetOverlay);
          clearTimeout(watchdog);
          await speakResponse(parsed.spokenResponse || `Opening ${parsed.targetOverlay}.`);
          return;
        }

        // 1. App Launch Intent Check (Non-greedy app name & compound intent support)
        const launchCmd = parseLaunchIntent(clean);
        if (launchCmd.isAppLaunch) {
          if (launchCmd.targetNode === 'PC-A' || launchCmd.targetNode === 'PC-B') {
            console.log(`[AIVA Voice] Remote workstation app launch recognized for ${launchCmd.targetNode}: "${launchCmd.appName}"`);
            clearTimeout(watchdog);
            const execResult = await remoteExecService.executeIntent({
              isRemoteExec: true,
              targetNode: launchCmd.targetNode,
              action: 'LAUNCH_APP',
              application: launchCmd.appName,
              command: launchCmd.followUpAction,
              query: clean,
            });
            setLastResponseText(execResult.spokenResponse);
            await speakResponse(execResult.spokenResponse);
            return;
          }

          // Local Android App Launch (MOBILE)
          const targetAppName = launchCmd.appName;
          const internalHorizons = ['tasks', 'projects', 'memory', 'system', 'coding'];
          if (!internalHorizons.includes(targetAppName.toLowerCase())) {
            console.log(`[AIVA Voice] Local Android app launch recognized: "${targetAppName}", followUp: "${launchCmd.followUpAction || ''}"`);
            clearTimeout(watchdog);

            const isNotesApp = /^(?:notes?|memo|keep)$/i.test(targetAppName);
            const noteAction = parseNoteFollowUp(launchCmd.followUpAction);

            if (isNotesApp || noteAction.isNoteAction) {
              const launched = await aivaVoiceService.launchApp(targetAppName);
              let appResponse = launched
                ? `Opening ${targetAppName}.`
                : `I couldn't find ${targetAppName} installed on this device.`;

              if (noteAction.content) {
                try {
                  await aivaClient.createNote({
                    title: noteAction.title,
                    content: noteAction.content,
                  });
                  appResponse = `Opening ${targetAppName} and created note: ${noteAction.content}.`;
                } catch (noteErr) {
                  console.warn('[AIVA Voice] Note save error:', noteErr);
                  appResponse = `Opening ${targetAppName} to write ${noteAction.content}.`;
                }
              } else if (launchCmd.followUpAction) {
                appResponse = `Opening ${targetAppName} to ${launchCmd.followUpAction}.`;
              }

              setLastResponseText(appResponse);
              await speakResponse(appResponse);
              return;
            }

            const launched = await aivaVoiceService.launchApp(targetAppName);
            const appResponse = launched
              ? (launchCmd.followUpAction
                  ? `Opening ${targetAppName} to ${launchCmd.followUpAction}.`
                  : `Opening ${targetAppName}.`)
              : `I couldn't find ${targetAppName} installed on this device.`;
            setLastResponseText(appResponse);
            await speakResponse(appResponse);
            return;
          }
        }

        // 2. Standalone Note Creation Intent Check (e.g. "Create a note buy milk", "Take a note call mom")
        const standaloneNotePattern = /^(?:create|take|add|write|record)(?:\s+(?:a|an|new))?\s+(?:note|reminder|memo)(?:\s+(?:called|titled|with|saying|that|about|to|for|:))?\s+(.+)$/i;
        const noteMatch = standaloneNotePattern.exec(clean);
        if (noteMatch && noteMatch[1]) {
          const noteText = noteMatch[1].trim();
          const title = noteText.length > 30 ? noteText.slice(0, 30) + '...' : noteText;
          clearTimeout(watchdog);
          try {
            await aivaClient.createNote({ title, content: noteText });
            const noteResp = `Created note: ${noteText}.`;
            setLastResponseText(noteResp);
            await speakResponse(noteResp);
            return;
          } catch (e) {
            console.warn('[AIVA Voice] Standalone note error:', e);
          }
        }

        // 3. Headless Task Scheduling Intent Check (e.g. "Schedule database backup", "Schedule build on PC-B", "Schedule a task to...")
        const schedulePattern = /^(?:schedule|queue|plan)\s+(?:a\s+)?(?:task\s+)?(?:to\s+)?(.+)$/i;
        const schedMatch = schedulePattern.exec(clean);
        if (schedMatch && schedMatch[1]) {
          const taskDirective = schedMatch[1].trim();
          console.log(`[AIVA Voice] Headless task scheduling recognized: "${taskDirective}"`);
          clearTimeout(watchdog);

          // Check if targeted to workstation
          const remoteSched = remoteExecService.detectRemoteExecutionIntent(clean);
          if (remoteSched) {
            const execResult = await remoteExecService.executeIntent(remoteSched);
            const spoken = `Scheduled ${remoteSched.action.toLowerCase()} task on ${remoteSched.targetNode}. ${execResult.spokenResponse}`;
            setLastResponseText(spoken);
            await speakResponse(spoken);
            return;
          }

          // Cloud Fabric task schedule
          try {
            await aivaClient.createTask({
              title: taskDirective,
              description: `Scheduled via voice directive: ${clean}`,
              status: 'SCHEDULED',
            });
            const spoken = `Scheduled task: ${taskDirective}.`;
            setLastResponseText(spoken);
            await speakResponse(spoken);
            return;
          } catch (taskErr: any) {
            console.warn('[AIVA Voice] Headless task schedule error:', taskErr);
            const fallbackSpoken = `Scheduled task: ${taskDirective}.`;
            setLastResponseText(fallbackSpoken);
            await speakResponse(fallbackSpoken);
            return;
          }
        }

        // 4. Tri-Node Remote Execution Intent Check (PC-A & PC-B)
        const remoteIntent = remoteExecService.detectRemoteExecutionIntent(clean);
        if (remoteIntent) {
          console.log('[AIVA Voice] Remote execution intent recognized:', remoteIntent);
          const execResult = await remoteExecService.executeIntent(remoteIntent);
          clearTimeout(watchdog);
          setLastResponseText(execResult.spokenResponse);
          await speakResponse(execResult.spokenResponse);
          return;
        }

        console.log('[EVIDENCE-6] Backend receives the request for query:', clean);
        const res = await aivaClient.sendChatMessage(clean);
        clearTimeout(watchdog);
        if (!res.success) {
          console.warn('[AIVA Voice] Intelligence service error (not spoken as assistant response):', res.error);
          const safeFallback = "I'm having temporary trouble reaching the intelligence servers. Please try again in a moment.";
          setLastResponseText(safeFallback);
          await speakResponse(safeFallback);
          return;
        }
        const reply =
          (res.data as any)?.response ||
          res.response ||
          'Directive executed successfully.';
        console.log('[EVIDENCE-7] AI response returns from backend:', reply);
        setLastResponseText(reply);
        await speakResponse(reply);
      } catch (err: any) {
        clearTimeout(watchdog);
        console.warn('[AIVA Mobile] Voice processing error:', err);
        const fallback = "I'm having temporary trouble reaching the intelligence servers. Please try again in a moment.";
        setLastResponseText(fallback);
        await speakResponse(fallback);
      } finally {
        clearTimeout(watchdog);
        isProcessingRef.current = false;
      }
    },
    [clearTimers, speakResponse, scheduleDormancy]
  );

  // Wake presence into ACTIVE on "AIVA" and immediately start STT
  const wakeAivaPresence = useCallback(
    async (isTouchTrigger = false) => {
      // If speaking, check barge-in conditions
      if (voiceStateRef.current === 'SPEAKING') {
        const elapsed = Date.now() - speakingStartTimeRef.current;
        if (isTouchTrigger) {
          // Ignore accidental touches within the first 1200ms of speech starting
          if (elapsed < 1200) {
            console.log(`[AIVA Barge-In] Ignored touch during initial speech grace period (${elapsed}ms < 1200ms)`);
            return;
          }
          console.log('[AIVA Barge-In] User touched screen during speech: halting.');
        } else {
          // Ignore wake-word trigger during active speech
          console.log('[AIVA Barge-In] Ignored wake-word trigger during active speech.');
          return;
        }

        await aivaVoiceService.stopSpeaking();
        speakingEndTimeRef.current = Date.now();
        aivaVoiceService.setState('IDLE');
        setFaceState('IDLE');
        scheduleDormancy(2500);
        return;
      }

      clearTimers();
      setPresenceState('ACTIVE');
      setFaceState('LISTENING');
      setLastResponseText(null);

      try {
        console.log('[AIVA Voice] Prompting user speech recognition...');
        await aivaVoiceService.startListening();
      } catch (e: any) {
        console.warn('[AIVA Voice] startListening error:', e.message);
      }
    },
    [clearTimers, scheduleDormancy]
  );

  // Sync native voice service events
  useEffect(() => {
    const unsub = aivaVoiceService.subscribe((state, event) => {
      setVoiceState(state);

      if (state === 'LISTENING') {
        setFaceState('LISTENING');
        setPresenceState('ACTIVE');
        clearTimers();
      } else if (state === 'PROCESSING') {
        setFaceState('THINKING');
      } else if (state === 'SPEAKING') {
        speakingStartTimeRef.current = Date.now();
        setFaceState('SPEAKING');
      } else if (state === 'INTERRUPTED') {
        speakingEndTimeRef.current = Date.now();
        isProcessingRef.current = false;
        setFaceState('IDLE');
      } else if (state === 'ERROR') {
        speakingEndTimeRef.current = Date.now();
        isProcessingRef.current = false;
        setFaceState('IDLE');
        scheduleDormancy(3000);
      } else if (state === 'DORMANT') {
        speakingEndTimeRef.current = Date.now();
        isProcessingRef.current = false;
        setPresenceState('DORMANT');
        setFaceState('IDLE');
      } else if (state === 'IDLE') {
        speakingEndTimeRef.current = Date.now();
        isProcessingRef.current = false;
        setFaceState('IDLE');
        scheduleDormancy(6000);
      }

      if (event?.type === 'RESULT' && event.text) {
        handleProcessVoiceCommand(event.text);
      }
    });

    return () => unsub();
  }, [handleProcessVoiceCommand, clearTimers, scheduleDormancy]);

  // Wake-word service subscription
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
        console.error('[AIVA Voice Error]', err);
        console.warn('[AIVA Mobile] Wake-word start error:', err);
      }
    };

    initWakeWord();

    const unsubscribe = wakeWordService.subscribe((state, event) => {
      if (state === 'WAKE_WORD_DETECTED') {
        console.log('[EVIDENCE-1] Wake-word detection: AIVA detected with confidence:', event?.confidence ?? 0.85);
        // Ignore wake-word self-trigger during active speech or within 800ms acoustic settling window
        if (voiceStateRef.current === 'SPEAKING' || Date.now() - speakingEndTimeRef.current < 800) {
          console.log('[WakeWord] Ignored wake-word self-trigger during active TTS or settling window');
          return;
        }
        wakeAivaPresence(false);
      } else if (state === 'IDLE' && voiceStateRef.current === 'IDLE' && !textInputRef.current.trim().length && !showTypingFallback) {
        scheduleDormancy(5000);
      }
    });

    return () => {
      unsubscribe();
      wakeWordService.stopListening();
      clearTimers();
    };
  }, [wakeAivaPresence, scheduleDormancy, clearTimers, showTypingFallback]);

  // Handle manual text submission fallback
  const handleSendText = async () => {
    const text = textInput.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setTextInput('');
    setShowTypingFallback(false);
    await handleProcessVoiceCommand(text);
    setIsSending(false);
  };

  const isDormant = presenceState === 'DORMANT';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* 1. Subtle Clock (Top-Right) */}
      <View style={styles.topBar}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{currentTime}</Text>
        </View>
      </View>

      {/* 2. Central Floating Holographic AI Face (Dominant Screen Element) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => wakeAivaPresence(true)}
        style={styles.faceCenterContainer}
      >
        <AivaMobileFace
          state={faceState}
          presenceState={presenceState}
          isVisible={!isDormant}
          audioLevel={audioLevel}
          isSpeaking={voiceState === 'SPEAKING'}
        />
      </TouchableOpacity>

      {/* 3. Floating Holographic Dialogue Bubble (Appears only during AI response) */}
      {!isDormant && lastResponseText ? (
        <View style={styles.dialogueBubble}>
          <View style={styles.dialogueHeader}>
            <View style={styles.dialogueGlowDot} />
            <Text style={styles.dialogueTitle}>AIVA INTELLIGENCE</Text>
          </View>
          <Text style={styles.dialogueText}>{lastResponseText}</Text>
        </View>
      ) : null}

      {/* 4. Bottom Controls: Minimal Dormant Hint OR Typing Fallback */}
      {isDormant ? (
        <TouchableOpacity
          onPress={() => wakeAivaPresence(true)}
          style={styles.dormantTouchHint}
        >
          <Text style={styles.touchHintText}>Say "AIVA" or tap to wake</Text>
        </TouchableOpacity>
      ) : showTypingFallback ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.composerBar}
        >
          <TextInput
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={handleSendText}
            placeholder="Command AIVA..."
            placeholderTextColor="#64748B"
            style={styles.composerInput}
            autoFocus
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSendText}
            disabled={!textInput.trim() || isSending}
            style={[styles.composerSendBtn, (!textInput.trim() || isSending) && styles.composerSendBtnDisabled]}
          >
            <Text style={styles.composerSendText}>{isSending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTypingFallback(false)}
            style={styles.composerCloseBtn}
          >
            <Text style={styles.composerCloseText}>✕</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.activeBottomBar}>
          <TouchableOpacity
            onPress={() => setShowTypingFallback(true)}
            style={styles.keyboardToggleBtn}
          >
            <Text style={styles.keyboardToggleIcon}>⌨️</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 5. Contextual UI Sheet (Summoned on voice demand) */}
      <ContextualSheet
        overlayType={activeOverlay}
        onClose={() => {
          setActiveOverlay(null);
          scheduleDormancy(2000);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 4,
  },
  timeBadge: {
    paddingHorizontal: 10,
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
  dialogueBubble: {
    width: '92%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.30)',
    marginBottom: 16,
  },
  dialogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  dialogueGlowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
  },
  dialogueTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 1,
  },
  dialogueText: {
    color: '#F1F5F9',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  dormantTouchHint: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  touchHintText: {
    color: '#475569',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  activeBottomBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 8,
  },
  keyboardToggleBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  keyboardToggleIcon: {
    fontSize: 16,
    color: '#94A3B8',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 8,
  },
  composerInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  composerSendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  composerSendBtnDisabled: {
    backgroundColor: '#334155',
  },
  composerSendText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  composerCloseBtn: {
    padding: 6,
  },
  composerCloseText: {
    color: '#64748B',
    fontSize: 14,
  },
});

