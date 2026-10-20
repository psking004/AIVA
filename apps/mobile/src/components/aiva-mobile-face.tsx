/**
 * AIVA Mobile Holographic Face Component (React Native / Android)
 *
 * Implements the identical AIVA visual identity on mobile:
 * - Photorealistic CGI holographic female digital human presence
 * - Ethereal multi-spectral aura (cyan, electric blue, hyper-violet, soft pink)
 * - Dynamic speech lip-synchronization with closed resting lips during silence
 * - Natural human eyelid blinking cycles
 * - Performance optimized for mobile GPUs and battery conservation
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import {
  AivaFaceState,
  AivaVisemeKey,
  AivaPresenceState,
  computeAivaLipSync,
} from '@aiva/types';

export interface AivaMobileFaceProps {
  state?: AivaFaceState;
  presenceState?: AivaPresenceState;
  isVisible?: boolean;
  audioLevel?: number;
  size?: number;
  isSpeaking?: boolean;
}

const FACE_ASSETS: Record<AivaVisemeKey, any> = {
  base: require('../../assets/aiva_face_base.png'),
  slight: require('../../assets/aiva_face_mouth_slight.png'),
  mid: require('../../assets/aiva_face_mouth_mid.png'),
  wide: require('../../assets/aiva_face_mouth_wide.png'),
  o: require('../../assets/aiva_face_mouth_o.png'),
};

const EYELIDS_ASSET = require('../../assets/aiva_eyelids.png');

export function AivaMobileFace({
  state = 'IDLE',
  presenceState,
  isVisible,
  audioLevel = 0,
  size: explicitSize,
  isSpeaking = false,
}: AivaMobileFaceProps) {
  const { width: windowWidth } = useWindowDimensions();

  // Resolve presence visibility:
  // DORMANT = hidden (opacity: 0, scaled down, loops halted for battery conservation)
  // ACTIVE = visible (smooth fade-in and state animations)
  const isPresenceActive =
    isVisible !== undefined
      ? isVisible
      : presenceState
      ? presenceState === 'ACTIVE'
      : state !== 'IDLE';

  // Mobile-aware sizing: large commanding presence with breathing room
  const faceSize = useMemo(() => {
    if (explicitSize) return explicitSize;
    // Adapt to screen width (capped between 260 and 340)
    return Math.min(340, Math.max(260, windowWidth * 0.72));
  }, [explicitSize, windowWidth]);

  // Lip-sync state
  const [activeViseme, setActiveViseme] = useState<AivaVisemeKey>('base');
  const speechPhaseRef = useRef(0);
  const prevSmoothedRef = useRef(0);

  // Animation values
  const visibilityAnim = useRef(new Animated.Value(isPresenceActive ? 1 : 0)).current;
  const blinkAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const jawAnim = useRef(new Animated.Value(0)).current;
  const auraPulseAnim = useRef(new Animated.Value(1)).current;

  // Smooth presence fade/scale transition
  useEffect(() => {
    Animated.timing(visibilityAnim, {
      toValue: isPresenceActive ? 1 : 0,
      duration: isPresenceActive ? 250 : 350,
      useNativeDriver: true,
    }).start();
  }, [isPresenceActive, visibilityAnim]);

  // Natural eyelid blinking cycle (every 3.5 - 6.5s) - paused when dormant
  useEffect(() => {
    if (!isPresenceActive) {
      blinkAnim.setValue(0);
      return;
    }

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      const delay = 3200 + Math.random() * 3400;
      timer = setTimeout(() => {
        if (isCancelled) return;
        // Rapid 70ms eye closure
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }).start(() => {
          // Re-open
          setTimeout(() => {
            if (isCancelled) return;
            Animated.timing(blinkAnim, {
              toValue: 0,
              duration: 80,
              useNativeDriver: true,
            }).start(() => {
              scheduleBlink();
            });
          }, 40);
        });
      }, delay);
    };

    scheduleBlink();
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isPresenceActive, blinkAnim]);

  // Gentle floating breathing animation - paused when dormant to conserve battery
  useEffect(() => {
    if (!isPresenceActive) {
      floatAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -4,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPresenceActive, floatAnim]);

  // Aura pulse animation - paused when dormant
  useEffect(() => {
    if (!isPresenceActive) {
      auraPulseAnim.setValue(1);
      return;
    }

    const speed = state === 'SPEAKING' ? 1200 : state === 'IDLE' ? 4500 : 2200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraPulseAnim, {
          toValue: state === 'SPEAKING' ? 1.08 : 1.04,
          duration: speed / 2,
          useNativeDriver: true,
        }),
        Animated.timing(auraPulseAnim, {
          toValue: 1.0,
          duration: speed / 2,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPresenceActive, auraPulseAnim, state]);

  // Real-time lip-sync calculation
  useEffect(() => {
    speechPhaseRef.current += 0.28;
    const lipSync = computeAivaLipSync(
      audioLevel,
      speechPhaseRef.current,
      isSpeaking || state === 'SPEAKING',
      prevSmoothedRef.current
    );
    prevSmoothedRef.current = lipSync.smoothedLevel;

    setActiveViseme(lipSync.activeViseme);

    Animated.timing(jawAnim, {
      toValue: lipSync.jawOffset,
      duration: 60,
      useNativeDriver: true,
    }).start();
  }, [audioLevel, isSpeaking, state, jawAnim]);

  // Spectral theme colors based on state
  const colors = useMemo(() => {
    switch (state) {
      case 'LISTENING':
        return {
          glow: 'rgba(56, 189, 248, 0.35)',
          rim: '#38BDF8',
        };
      case 'THINKING':
        return {
          glow: 'rgba(129, 140, 248, 0.40)',
          rim: '#818CF8',
        };
      case 'SPEAKING':
        return {
          glow: 'rgba(244, 114, 182, 0.30)',
          rim: '#F472B6',
        };
      case 'EXECUTING':
        return {
          glow: 'rgba(52, 211, 153, 0.32)',
          rim: '#34D399',
        };
      case 'IDLE':
      default:
        return {
          glow: 'rgba(56, 189, 248, 0.18)',
          rim: '#38BDF8',
        };
    }
  }, [state]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: faceSize,
          height: faceSize,
          opacity: visibilityAnim,
          transform: [
            {
              scale: visibilityAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.93, 1.0],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      {/* 1. Volumetric Holographic Glow (Hardware Accelerated, Battery Safe) */}
      <Animated.View
        style={[
          styles.glowLayer,
          {
            width: faceSize * 1.15,
            height: faceSize * 1.15,
            backgroundColor: colors.glow,
            transform: [{ scale: auraPulseAnim }],
          },
        ]}
      />

      {/* 2. Floating Head Container */}
      <Animated.View
        style={[
          styles.faceWrapper,
          {
            width: faceSize,
            height: faceSize,
            transform: [{ translateY: floatAnim }],
          },
        ]}
      >
        {/* Base Holographic Face with Active Speech Viseme */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [{ translateY: jawAnim }],
            },
          ]}
        >
          <Image
            source={FACE_ASSETS[activeViseme]}
            style={styles.image}
            resizeMode="contain"
            fadeDuration={0}
          />
        </Animated.View>

        {/* Eyelids Blinking Overlay */}
        <Animated.Image
          source={EYELIDS_ASSET}
          style={[
            styles.image,
            StyleSheet.absoluteFillObject,
            {
              opacity: blinkAnim,
            },
          ]}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.85,
  },
  faceWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
