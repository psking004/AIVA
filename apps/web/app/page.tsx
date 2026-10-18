/** 
 * AIVA Desktop - Minimal Holographic Assistant Experience
 *
 * Product Paradigm:
 * - Desktop Wallpaper + Floating Photorealistic Holographic Face.
 * - Idle State: Zero permanent dashboards, zero cards, zero input boxes, zero status badges, zero text.
 * - Voice-First: Wakes on "AIVA". The face itself changes state. Overlays appear only when summoned.
 * - Dynamic Lip-Sync: Animates mouth/lips synchronously with spoken TTS output. Closed lips when silent.
 * - Preserves all existing components and backend integrations as contextual overlays.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { AivaFace } from '../components/aiva-face';
import { useAivaVoiceEngine } from '../hooks/use-aiva-voice';
import { ContextualOverlay } from '../components/desktop/contextual-overlay';

// Preserved Operational Lenses (summoned contextually on demand)
import { TaskProtocols } from '../components/tasks/task-protocols';
import { InitiativeMatrix } from '../components/projects/initiative-matrix';
import { MemoryArchive } from '../components/memory/memory-archive';
import { TimelineLens } from '../components/timeline/timeline-lens';
import { DataStorage } from '../components/files/data-storage';
import { DialogueLens } from '../components/dialogue-lens';
import { VoiceChamber } from '../components/voice-chamber';
import { NexusHome } from '../components/nexus-home';

import { aivaClient } from '@aiva/api-client';

export default function AivaDesktopPage() {
  console.log('[AIVA PIPELINE] AivaDesktopPage rendering on client');
  const {
    faceState,
    presenceState,
    isPresenceVisible,
    audioLevel,
    lipOpenness,
    audioLevelRef,
    statusHint,
    activeOverlay,
    setActiveOverlay,
    dismissOverlay,
  } = useAivaVoiceEngine();

  const [isElectron, setIsElectron] = useState(false);

  // Platform detection: attach transparent window classes if inside Electron
  useEffect(() => {
    const isDesktopApp =
      typeof window !== 'undefined' && Boolean((window as any).electronAPI);
    setIsElectron(isDesktopApp);

    console.log('[AIVA ELECTRON CONFIG]');
    console.log(`window location: ${typeof window !== 'undefined' ? window.location.href : 'undefined'}`);
    console.log(`API base URL: ${aivaClient.getBaseURL()}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Electron mode: ${isDesktopApp}`);
    console.log(`production/development mode: ${process.env.NODE_ENV || 'development'}`);

    if (isDesktopApp) {
      console.log('[RENDERER PAGE MOUNTED] Electron desktop mode active, electronAPI present');
      document.documentElement.classList.add('electron-app');
      document.body.classList.add('electron-app');
    } else {
      console.log('[RENDERER PAGE MOUNTED] Standard browser mode');
    }
  }, []);

  return (
    <div
      className={`relative min-h-screen w-screen overflow-hidden flex flex-col justify-between p-6 select-none ${
        isElectron ? 'bg-transparent' : 'bg-transparent'
      }`}
    >
      {/* 1. Header (Clean, zero clutter - no clock, no date, pure transparency) */}
      <header className="w-full flex items-center justify-end z-20 pointer-events-none h-6" />

      {/* 2. Central Floating Holographic AI Face (Voice-First, Non-Button) */}
      <main className="flex-1 flex flex-col items-center justify-center my-auto z-10 pointer-events-none">
        <div className="relative flex flex-col items-center">
          <AivaFace
            state={faceState}
            presenceState={presenceState}
            isVisible={isPresenceVisible}
            audioLevel={audioLevel}
            lipOpenness={lipOpenness}
            audioLevelRef={audioLevelRef}
            size="hero"
            statusHint={statusHint}
          />
        </div>
      </main>

      {/* 3. Empty Minimal Spacer (No text, no badges, no buttons) */}
      <div className="w-full h-4 pointer-events-none" />

      {/* 4. Contextual Overlays (Summoned strictly via Voice Command) */}
      {activeOverlay && (
        <ContextualOverlay overlayType={activeOverlay} onClose={dismissOverlay}>
          {activeOverlay === 'tasks' && <TaskProtocols fullScreen />}

          {activeOverlay === 'projects' && <InitiativeMatrix fullScreen />}

          {activeOverlay === 'memory' && <MemoryArchive fullScreen />}

          {activeOverlay === 'timeline' && <TimelineLens fullScreen />}

          {activeOverlay === 'files' && <DataStorage fullScreen />}

          {activeOverlay === 'dialogue' && (
            <div className="h-full">
              <DialogueLens onVoiceTrigger={() => setActiveOverlay('voice')} />
            </div>
          )}

          {activeOverlay === 'voice' && (
            <VoiceChamber
              onExit={dismissOverlay}
              onNavigateToDialogue={() => setActiveOverlay('dialogue')}
            />
          )}

          {activeOverlay === 'nexus' && (
            <NexusHome
              onLensSwitch={(lens) => setActiveOverlay(lens)}
              onVoiceTrigger={() => setActiveOverlay('voice')}
              onDirectiveSubmit={() => setActiveOverlay('dialogue')}
            />
          )}
        </ContextualOverlay>
      )}
    </div>
  );
}
