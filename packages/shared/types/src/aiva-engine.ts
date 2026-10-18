/**
 * AIVA Shared Engine & Cross-Platform State Architecture
 *
 * Provides shared types, command routing, and lip-sync calculations
 * for Web, Windows Desktop (Electron), and Android Mobile.
 */

export type AivaFaceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'EXECUTING';

export type AivaPresenceState = 'DORMANT' | 'ACTIVE';

export type AivaVisemeKey = 'base' | 'slight' | 'mid' | 'wide' | 'o';

export type AivaDesktopOverlayMode = 'IDLE_OVERLAY' | 'INTERACTIVE_OVERLAY';

export type AivaOverlayLens =
  | 'tasks'
  | 'projects'
  | 'memory'
  | 'timeline'
  | 'files'
  | 'dialogue'
  | 'voice'
  | 'nexus'
  | null;

export interface AivaLipSyncState {
  audioLevel: number;
  activeViseme: AivaVisemeKey;
  jawOffset: number; // in pixels
  smoothedLevel: number;
  isSpeaking: boolean;
}

export interface AivaVisualState {
  presenceState: AivaPresenceState;
  isPresenceVisible: boolean;
  faceState: AivaFaceState;
  lipSync: AivaLipSyncState;
  isBlinking: boolean;
  activeOverlay: AivaOverlayLens;
  desktopMode: AivaDesktopOverlayMode;
}

export type AivaIntentType =
  | 'GENERAL_QUERY'
  | 'SUMMON_UI'
  | 'DISMISS_UI'
  | 'SYSTEM_CONTROL'
  | 'UNKNOWN';

export interface AivaParsedCommand {
  rawText: string;
  intent: AivaIntentType;
  targetOverlay: AivaOverlayLens;
  spokenResponse?: string;
  requiresUI: boolean;
}

/**
 * Shared Voice Command Parser & Intent Router
 * Determines if a user command requires a UI lens or should be answered purely via voice.
 */
export function parseAivaVoiceCommand(rawText: string): AivaParsedCommand {
  const text = rawText.toLowerCase().trim();

  // 1. Dismiss / Close Commands
  if (
    text.includes('close') ||
    text.includes('close this') ||
    text.includes('dismiss') ||
    text.includes('disappear') ||
    text.includes('go home') ||
    text.includes('go away') ||
    text.includes("that's all") ||
    text.includes('thats all') ||
    text.includes('hide') ||
    text.includes('exit')
  ) {
    return {
      rawText,
      intent: 'DISMISS_UI',
      targetOverlay: null,
      spokenResponse: 'Closing interface.',
      requiresUI: false,
    };
  }

  // 2. Tasks Horizon
  if (
    text.includes('task') ||
    text.includes('tasks') ||
    text.includes('todo') ||
    text.includes('action items') ||
    text.includes('show my tasks') ||
    text.includes('open my tasks') ||
    text.includes('what are my tasks') ||
    text.includes('show tasks') ||
    text.includes('open tasks')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'tasks',
      spokenResponse: 'Opening your task protocols.',
      requiresUI: true,
    };
  }

  // 3. Projects Horizon
  if (
    text.includes('project') ||
    text.includes('projects') ||
    text.includes('initiatives') ||
    text.includes('show my projects') ||
    text.includes('open projects') ||
    text.includes('open my projects') ||
    text.includes('what projects am i working on')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'projects',
      spokenResponse: 'Opening your initiative matrix.',
      requiresUI: true,
    };
  }

  // 4. Memory Horizon
  if (
    text.includes('memory') ||
    text.includes('memories') ||
    text.includes('remember') ||
    text.includes('recall') ||
    text.includes('show memory') ||
    text.includes('show my memory') ||
    text.includes('open memory') ||
    text.includes('what do you remember') ||
    text.includes('search my memory')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'memory',
      spokenResponse: 'Opening your memory archive.',
      requiresUI: true,
    };
  }

  // 5. Timeline / Calendar Horizon
  if (
    text.includes('timeline') ||
    text.includes('schedule') ||
    text.includes('calendar') ||
    text.includes('history') ||
    text.includes('show my timeline') ||
    text.includes('open timeline') ||
    text.includes('show my calendar') ||
    text.includes('what is on my calendar') ||
    text.includes('what do i have today')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'timeline',
      spokenResponse: 'Opening your timeline lens.',
      requiresUI: true,
    };
  }

  // 6. Data Storage / Files Horizon
  if (
    text.includes('file') ||
    text.includes('files') ||
    text.includes('documents') ||
    text.includes('storage') ||
    text.includes('show my files') ||
    text.includes('open files')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'files',
      spokenResponse: 'Opening data storage.',
      requiresUI: true,
    };
  }

  // 7. Dialogue Horizon
  if (
    text.includes('dialogue') ||
    text.includes('conversation') ||
    text.includes('show dialogue') ||
    text.includes('open dialogue')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'dialogue',
      spokenResponse: 'Opening dialogue interface.',
      requiresUI: true,
    };
  }

  // 8. Voice Chamber Horizon
  if (
    text.includes('voice chamber') ||
    text.includes('open voice chamber') ||
    text.includes('voice mode')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'voice',
      spokenResponse: 'Opening voice chamber.',
      requiresUI: true,
    };
  }

  // 9. Nexus Home Horizon
  if (
    text.includes('nexus') ||
    text.includes('system overview') ||
    text.includes('open nexus')
  ) {
    return {
      rawText,
      intent: 'SUMMON_UI',
      targetOverlay: 'nexus',
      spokenResponse: 'Opening Nexus overview.',
      requiresUI: true,
    };
  }

  // 10. General AI Query (Does NOT summon UI - answered purely via voice)
  return {
    rawText,
    intent: 'GENERAL_QUERY',
    targetOverlay: null,
    requiresUI: false,
  };
}

/**
 * Shared Lip-Sync Calculation Engine
 * Reusable across Web, Electron, and React Native
 */
export function computeAivaLipSync(
  audioLevel: number,
  speechPhase: number,
  isSpeaking: boolean,
  prevSmoothedLevel = 0
): AivaLipSyncState {
  if (!isSpeaking || audioLevel < 0.04) {
    return {
      audioLevel: 0,
      activeViseme: 'base',
      jawOffset: 0,
      smoothedLevel: 0,
      isSpeaking: false,
    };
  }

  // Smooth damping envelope
  const delta = audioLevel - prevSmoothedLevel;
  const smoothedLevel = Math.max(0, Math.min(1.0, prevSmoothedLevel + delta * 0.45));

  // Determine active viseme
  let activeViseme: AivaVisemeKey = 'base';
  if (smoothedLevel < 0.18) {
    activeViseme = 'slight';
  } else if (smoothedLevel < 0.48) {
    const phaseMod = Math.sin(speechPhase);
    activeViseme = phaseMod > 0.2 ? 'mid' : 'o';
  } else {
    activeViseme = 'wide';
  }

  // Mandible jaw translation: 0 to 3.5px
  const jawOffset = Math.min(3.5, smoothedLevel * 4.0);

  return {
    audioLevel,
    activeViseme,
    jawOffset,
    smoothedLevel,
    isSpeaking: true,
  };
}
