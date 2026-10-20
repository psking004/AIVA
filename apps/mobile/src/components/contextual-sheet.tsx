/**
 * AIVA Mobile Contextual Sheet Component
 *
 * Summoned ONLY when a user issues an explicit UI voice command
 * (e.g., "AIVA, show my tasks"). Disappears smoothly on "AIVA, close".
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AivaOverlayLens } from '@aiva/types';

interface ContextualSheetProps {
  overlayType: AivaOverlayLens;
  onClose: () => void;
}

export function ContextualSheet({ overlayType, onClose }: ContextualSheetProps) {
  if (!overlayType) return null;

  const titles: Record<string, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
    tasks: { title: 'Task Protocols', subtitle: 'Autonomous Execution Queue', icon: 'checkbox-outline' },
    projects: { title: 'Initiative Matrix', subtitle: 'Strategic Active Projects', icon: 'briefcase-outline' },
    memory: { title: 'Memory Archive', subtitle: 'Cognitive Context Storage', icon: 'bookmark-outline' },
    timeline: { title: 'Temporal Lens', subtitle: 'Chronological Operations', icon: 'calendar-outline' },
    files: { title: 'Data Storage', subtitle: 'Encrypted Document Repository', icon: 'folder-outline' },
    dialogue: { title: 'Executive Dialogue', subtitle: 'Direct Intelligence Conduit', icon: 'chatbubbles-outline' },
    voice: { title: 'Voice Chamber', subtitle: 'Acoustic Resonance Mode', icon: 'mic-outline' },
    nexus: { title: 'Nexus Horizon', subtitle: 'Operating System Hub', icon: 'planet-outline' },
  };

  const meta = titles[overlayType] || {
    title: overlayType.toUpperCase(),
    subtitle: 'Contextual Horizon',
    icon: 'apps-outline',
  };

  return (
    <Modal
      visible={Boolean(overlayType)}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlayBackdrop}>
        <View style={styles.sheetContainer}>
          {/* Top Handle / Drag indicator */}
          <View style={styles.handleBar} />

          {/* Sheet Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBadge}>
                <Ionicons name={meta.icon} size={20} color="#38BDF8" />
              </View>
              <View>
                <Text style={styles.title}>{meta.title}</Text>
                <Text style={styles.subtitle}>{meta.subtitle}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close contextual interface"
            >
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Dynamic Content Body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {overlayType === 'tasks' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Active Directives</Text>
                <View style={styles.taskItem}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#38BDF8" />
                  <Text style={styles.taskText}>Verify cross-platform holographic AIVA face</Text>
                </View>
                <View style={styles.taskItem}>
                  <Ionicons name="ellipse-outline" size={18} color="#818CF8" />
                  <Text style={styles.taskText}>Synchronize real-time TTS lip sync engine</Text>
                </View>
                <View style={styles.taskItem}>
                  <Ionicons name="ellipse-outline" size={18} color="#94A3B8" />
                  <Text style={styles.taskText}>Deploy desktop click-through overlay architecture</Text>
                </View>
              </View>
            )}

            {overlayType === 'projects' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Strategic Initiatives</Text>
                <Text style={styles.bodyText}>• AIVA OS v2.0 - Unified Multi-Platform Personal AI</Text>
                <Text style={styles.bodyText}>• Autonomous Cognitive Architecture & Neural Memory</Text>
                <Text style={styles.bodyText}>• Private Local-First Desktop & Mobile Presence</Text>
              </View>
            )}

            {overlayType === 'memory' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Long-term Context & Facts</Text>
                <Text style={styles.bodyText}>• User profile: Private Personal AI Operating System</Text>
                <Text style={styles.bodyText}>• Aesthetic: Holographic female presence, calm, intelligent</Text>
                <Text style={styles.bodyText}>• Activation: Voice-first ("AIVA")</Text>
              </View>
            )}

            {overlayType === 'timeline' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Temporal Operations</Text>
                <Text style={styles.bodyText}>Today: System calibration & cross-platform validation</Text>
                <Text style={styles.bodyText}>Always active: Background keyword spotter</Text>
              </View>
            )}

            {overlayType === 'files' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Document Storage</Text>
                <Text style={styles.bodyText}>📁 system-protocols.json</Text>
                <Text style={styles.bodyText}>📁 visual-identity-spec.md</Text>
                <Text style={styles.bodyText}>📁 cognitive-matrix.bin</Text>
              </View>
            )}

            {overlayType === 'dialogue' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Dialogue Stream</Text>
                <Text style={styles.bodyText}>AIVA: Ready for instructions.</Text>
                <Text style={styles.bodyText}>Speak "AIVA" followed by your command.</Text>
              </View>
            )}

            {overlayType === 'voice' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Voice Acoustic Stream</Text>
                <Text style={styles.bodyText}>High-fidelity audio stream active.</Text>
                <Text style={styles.bodyText}>Speech-to-text: Real-time neural processing.</Text>
              </View>
            )}

            {overlayType === 'nexus' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Nexus Operational Status</Text>
                <Text style={styles.bodyText}>Core Engine: Optimal</Text>
                <Text style={styles.bodyText}>Platform: Android Mobile Client</Text>
                <Text style={styles.bodyText}>Status: Idle / Awaiting Voice Summon</Text>
              </View>
            )}

            <Text style={styles.dismissHint}>
              Say "AIVA, close" or tap close to dismiss
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0C0E14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxHeight: '85%',
    paddingBottom: 24,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  taskText: {
    fontSize: 14,
    color: '#E2E8F0',
    flex: 1,
  },
  bodyText: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  dismissHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748B',
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
