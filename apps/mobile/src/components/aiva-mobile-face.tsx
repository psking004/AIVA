/**
 * AIVA Mobile Holographic Face Component (React Native / Android)
 *
 * Exact Visual Parity with PC Desktop Holographic Interface:
 * - Identical CGI holographic female digital human composite (512x512 coordinate system)
 * - 3D Luminous Orbital Energy Rings (Tilted Cyan-Violet and Pink-Electric Blue)
 * - Orbital energy particle nodes and floating ethereal particle embers
 * - Natural human eyelid blinking cycles (every 3.5 - 6.5s)
 * - Real-time syllabic lip-synchronization with closed resting lips when silent
 * - ZERO unwanted teal circular discs: transparent, floating, ethereal presence
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
  useWindowDimensions,
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

  const isPresenceActive =
    isVisible !== undefined
      ? isVisible
      : presenceState
      ? presenceState === 'ACTIVE'
      : state !== 'IDLE';

  // Face sizing: Dominant floating holographic presence matching PC proportions
  const faceSize = useMemo(() => {
    if (explicitSize) return explicitSize;
    return Math.min(320, Math.max(260, windowWidth * 0.74));
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
  const ring1Rotation = useRef(new Animated.Value(0)).current;
  const ring2Rotation = useRef(new Animated.Value(0)).current;
  const emberPulse = useRef(new Animated.Value(0.7)).current;

  // Smooth presence fade & scale transition
  useEffect(() => {
    Animated.timing(visibilityAnim, {
      toValue: isPresenceActive ? 1 : 0,
      duration: isPresenceActive ? 300 : 400,
      useNativeDriver: true,
    }).start();
  }, [isPresenceActive, visibilityAnim]);

  // Natural eyelid blinking cycle (every 3.5 - 6.5s)
  useEffect(() => {
    if (!isPresenceActive) {
      blinkAnim.setValue(0);
      return;
    }

    let blinkTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const scheduleNextBlink = () => {
      const delay = Math.random() * 3000 + 3500;
      blinkTimeout = setTimeout(() => {
        if (!isMounted) return;
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 85,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 0,
            duration: 95,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (isMounted) scheduleNextBlink();
        });
      }, delay);
    };

    scheduleNextBlink();
    return () => {
      isMounted = false;
      clearTimeout(blinkTimeout);
    };
  }, [isPresenceActive, blinkAnim]);

  // Continuous gentle vertical float oscillation (breathing movement)
  useEffect(() => {
    if (!isPresenceActive) {
      floatAnim.setValue(0);
      return;
    }

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -7,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, [isPresenceActive, floatAnim]);

  // 3D Orbital Rings Continuous Rotation
  useEffect(() => {
    if (!isPresenceActive) return;

    const ring1Loop = Animated.loop(
      Animated.timing(ring1Rotation, {
        toValue: 1,
        duration: state === 'THINKING' ? 6000 : 16000,
        useNativeDriver: true,
      })
    );

    const ring2Loop = Animated.loop(
      Animated.timing(ring2Rotation, {
        toValue: 1,
        duration: state === 'THINKING' ? 8000 : 22000,
        useNativeDriver: true,
      })
    );

    const emberLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(emberPulse, {
          toValue: 1.0,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(emberPulse, {
          toValue: 0.5,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    ring1Loop.start();
    ring2Loop.start();
    emberLoop.start();

    return () => {
      ring1Loop.stop();
      ring2Loop.stop();
      emberLoop.stop();
    };
  }, [isPresenceActive, state, ring1Rotation, ring2Rotation, emberPulse]);

  // Syllabic lip-sync modulation when speaking aloud
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

  // Ring rotation interpolations
  const spinRing1 = ring1Rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinRing2 = ring2Rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const ring1Scale = faceSize * 1.14;
  const ring2Scale = faceSize * 1.22;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: faceSize * 1.3,
          height: faceSize * 1.3,
          opacity: visibilityAnim,
          transform: [
            {
              scale: visibilityAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.92, 1.0],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      {/* 1. Orbital Energy Ring 1 (Tilted ~25° Cyan-Violet) */}
      <Animated.View
        style={[
          styles.orbitalRing1,
          {
            width: ring1Scale,
            height: ring1Scale,
            transform: [
              { translateY: floatAnim },
              { rotateZ: '25deg' },
              { rotate: spinRing1 },
            ],
          },
        ]}
      >
        <View style={styles.ring1EnergyNodeTop} />
        <View style={styles.ring1EnergyNodeBottom} />
      </Animated.View>

      {/* 2. Orbital Energy Ring 2 (Tilted ~-38° Magenta-Electric Blue) */}
      <Animated.View
        style={[
          styles.orbitalRing2,
          {
            width: ring2Scale,
            height: ring2Scale,
            transform: [
              { translateY: floatAnim },
              { rotateZ: '-38deg' },
              { rotate: spinRing2 },
            ],
          },
        ]}
      >
        <View style={styles.ring2EnergyNodeRight} />
        <View style={styles.ring2EnergyNodeLeft} />
      </Animated.View>

      {/* 3. Floating Ethereal Particle Embers */}
      <Animated.View
        style={[
          styles.emberLayer,
          {
            width: faceSize,
            height: faceSize,
            opacity: emberPulse,
            transform: [{ translateY: floatAnim }],
          },
        ]}
      >
        <View style={[styles.ember, { top: '14%', left: '12%', backgroundColor: '#38BDF8' }]} />
        <View style={[styles.ember, { top: '28%', right: '8%', backgroundColor: '#F472B6', width: 4, height: 4 }]} />
        <View style={[styles.ember, { bottom: '22%', left: '10%', backgroundColor: '#818CF8' }]} />
        <View style={[styles.ember, { bottom: '16%', right: '18%', backgroundColor: '#38BDF8', width: 3, height: 3 }]} />
      </Animated.View>

      {/* 4. Main Holographic Face Composite (Floating breathing movement) */}
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
        {/* Base Holographic Face with Active Speech Viseme (closed resting lips when silent) */}
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

        {/* Eyelids Blinking Layer Overlay (Identical coordinate alignment) */}
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
  faceWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  orbitalRing1: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    zIndex: 2,
  },
  ring1EnergyNodeTop: {
    position: 'absolute',
    top: -3,
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
    elevation: 4,
  },
  ring1EnergyNodeBottom: {
    position: 'absolute',
    bottom: -3,
    left: '25%',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#818CF8',
    elevation: 3,
  },
  orbitalRing2: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.30)',
    zIndex: 3,
  },
  ring2EnergyNodeRight: {
    position: 'absolute',
    top: '35%',
    right: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F472B6',
    elevation: 4,
  },
  ring2EnergyNodeLeft: {
    position: 'absolute',
    bottom: '25%',
    left: -3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#38BDF8',
    elevation: 3,
  },
  emberLayer: {
    position: 'absolute',
    zIndex: 5,
  },
  ember: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    elevation: 3,
  },
});
