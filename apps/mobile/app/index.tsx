/**
 * AIVA Mobile App - Home Screen
 */

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

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
          <Text style={styles.title}>Welcome back!</Text>
        </View>
        <TouchableOpacity style={styles.avatar}>
          <Ionicons name="person" size={24} color="#fff" />
        </TouchableOpacity>
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
        <View style={styles.activityItem}>
          <View style={[styles.activityIcon, { backgroundColor: '#3B82F6' }]}>
            <Ionicons name="chatbubbles" size={16} color="#fff" />
          </View>
          <View style={styles.activityContent}>
            <Text style={styles.activityText}>Chat with AIVA</Text>
            <Text style={styles.activityTime}>1 hour ago</Text>
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
    marginBottom: 24,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
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
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  menuItem: {
    width: '33.33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuLabel: {
    color: '#fff',
    fontSize: 12,
  },
  activityContainer: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 16,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a4e',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: '#fff',
    fontSize: 14,
  },
  activityTime: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
});
