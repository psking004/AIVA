/**
 * AIVA Mobile App - Home Screen
 *
 * Integrated with:
 * - Low-power "AIVA" wake-word indicator & control banner
 * - Battery mode switcher (Performance, Balanced, Battery Saver, Ultra Low Power)
 * - Real-time listening & voice interaction state
 */

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { wakeWordService, BatteryMode, VoiceState } from '../src/services/wakeword/wake-word.service';

export default function HomeScreen() {
  const [greeting, setGreeting] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('LISTENING');
  const [batteryMode, setBatteryMode] = useState<BatteryMode>('BALANCED');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Start background wake-word listening on mount
    wakeWordService.startListening('BALANCED');

    const unsubscribe = wakeWordService.subscribe((state, event) => {
      setVoiceState(state);
      if (state === 'WAKE_WORD_DETECTED') {
        setLastTranscript('Wake word "AIVA" detected. Listening for command...');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCycleBatteryMode = () => {
    const modes: BatteryMode[] = ['BALANCED', 'PERFORMANCE', 'BATTERY_SAVER', 'ULTRA_LOW_POWER'];
    const currentIndex = modes.indexOf(batteryMode);
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    setBatteryMode(nextMode);
    wakeWordService.setBatteryMode(nextMode);
  };

  const menuItems = [
    { id: 'chat', icon: 'chatbubbles', label: 'Chat', color: '#3B82F6' },
    { id: 'tasks', icon: 'checkbox', label: 'Tasks', color: '#10B981' },
    { id: 'notes', icon: 'document', label: 'Notes', color: '#F59E0B' },
    { id: 'calendar', icon: 'calendar', label: 'Calendar', color: '#EF4444' },
    { id: 'files', icon: 'folder', label: 'Files', color: '#8B5CF6' },
    { id: 'automation', icon: 'flash', label: 'Automation', color: '#06B6D4' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.title}>AIVA Assistant</Text>
        </View>
        <TouchableOpacity style={styles.avatar}>
          <Ionicons name="person" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Low-Power Wake-Word Status Banner */}
      <View style={styles.wakeWordBanner}>
        <View style={styles.wakeWordHeader}>
          <View style={styles.wakeWordStatusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    voiceState === 'WAKE_WORD_DETECTED'
                      ? '#10B981'
                      : voiceState === 'LISTENING'
                      ? '#3B82F6'
                      : '#EF4444',
                },
              ]}
            />
            <Text style={styles.wakeWordTitle}>
              {voiceState === 'WAKE_WORD_DETECTED'
                ? 'AIVA Wake Word Spotted!'
                : voiceState === 'LISTENING'
                ? 'Listening for "AIVA"'
                : 'Wake Word Idle'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleCycleBatteryMode} style={styles.batteryBadge}>
            <Ionicons name="battery-charging" size={14} color="#10B981" />
            <Text style={styles.batteryBadgeText}>{batteryMode}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.wakeWordSubtext}>
          {lastTranscript || 'Low-power local detection active. Zero audio uploaded while waiting.'}
        </Text>
      </View>

      {/* Quick Stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#10B981' }]}>12</Text>
          <Text style={styles.statLabel}>Tasks</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#F59E0B' }]}>28</Text>
          <Text style={styles.statLabel}>Notes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>6</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#8B5CF6' }]}>15</Text>
          <Text style={styles.statLabel}>Files</Text>
        </View>
      </ScrollView>

      {/* Main Menu */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.grid}>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.id} style={styles.menuItem}>
            <View style={[styles.iconContainer, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon as any} size={24} color="#fff" />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityContainer}>
        <View style={styles.activityItem}>
          <View style={[styles.activityIcon, { backgroundColor: '#10B981' }]}>
            <Ionicons name="checkmark" size={16} color="#fff" />
          </View>
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>Completed "Review Q1 report"</Text>
            <Text style={styles.activityTime}>2 minutes ago</Text>
          </View>
        </View>
        <View style={styles.activityItem}>
          <View style={[styles.activityIcon, { backgroundColor: '#F59E0B' }]}>
            <Ionicons name="document" size={16} color="#fff" />
          </View>
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>Created note "Meeting notes"</Text>
            <Text style={styles.activityTime}>15 minutes ago</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    color: '#888',
    fontSize: 14,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wakeWordBanner: {
    backgroundColor: '#252538',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  wakeWordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  wakeWordStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  wakeWordTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  batteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  batteryBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  wakeWordSubtext: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  menuItem: {
    width: '33.33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 54,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuLabel: {
    color: '#fff',
    fontSize: 12,
  },
  activityContainer: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 14,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a4e',
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: '#fff',
    fontSize: 13,
  },
  activityTime: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
});
