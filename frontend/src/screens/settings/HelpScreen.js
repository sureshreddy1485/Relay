import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';

import { LinearGradient } from 'expo-linear-gradient';

const HelpSection = ({ icon, title, description, color }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      <LinearGradient colors={[color, color + '80']} style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#FFF" />
      </LinearGradient>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <Text style={styles.sectionDesc}>{description}</Text>
  </View>
);

export default function HelpScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.card} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & User Guide</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.welcomeText}>Welcome to Relay!</Text>
        <Text style={styles.subtitleText}>
          Relay is a beautiful, feature-rich messaging app designed for speed, privacy, and fun. Below is your complete guide to mastering the app.
        </Text>

        <HelpSection 
          icon="chatbubbles"
          title="1. Chatting & Media"
          color="#3B82F6"
          description="Send text, voice notes, photos, and videos instantly. You can react to messages, reply to them, or edit your text messages within 15 minutes of sending. Check out the '+' button to send disappearing 'View Once' media, polls, or documents."
        />

        <HelpSection 
          icon="timer"
          title="2. Disappearing Messages"
          color="#EC4899"
          description="Privacy first! You can enable disappearing messages in any chat. Messages will automatically self-destruct after the set time limit. We also support 'View Once' images and videos that disappear the moment they are closed."
        />

        <HelpSection 
          icon="people"
          title="3. Communities & Groups"
          color="#10B981"
          description="Create groups, invite friends, and communicate seamlessly. You can make groups Public to list them in the Communities tab. Use 'Auto-Accept Requests' in your group settings to automatically approve new members!"
        />

        <HelpSection 
          icon="aperture"
          title="4. Moments (Stories)"
          color="#F43F5E"
          description="Share 24-hour disappearing Moments with your friends! Post photos, text, or videos to your friends, and see who viewed your Moments. It's the best way to share what you're up to!"
        />

        <HelpSection 
          icon="people-circle"
          title="5. Multi-Account Manager"
          color="#6366F1"
          description="Got multiple identities? Tap your profile picture on the top right of the Chats screen to open the Account Manager. Add another account and instantly switch between them without logging out!"
        />

        <HelpSection 
          icon="planet"
          title="6. Meet the Bots: Mica & Mars"
          color="#8B5CF6"
          description="Relay features two incredibly smart AI companions. Mica is friendly and helpful. Mars is sarcastic and a bit of a rebel. In any group chat, the admin can swap the active bot by typing !swap."
        />

        <HelpSection 
          icon="game-controller"
          title="7. Play Games (Scramble)"
          color="#F59E0B"
          description="Bored? Type '!scramble' in any group chat with Mica or Mars active! The bot will jumble a word, and everyone in the group can race to guess it. Your scores are tracked on the global leaderboard!"
        />

        <HelpSection 
          icon="shield-checkmark"
          title="8. Privacy & Security"
          color="#EAB308"
          description="Go to Settings to control who sees your Last Seen, Profile Picture, and Read Receipts. You can also silently remove friends, or temporarily deactivate your account if you need a break."
        />

        <HelpSection 
          icon="notifications"
          title="9. Smart Notifications"
          color="#06B6D4"
          description="Relay uses native background notifications. Even if the app is completely closed, you will receive notifications securely. Reply or mark messages as read directly from your phone's notification panel."
        />

        <View style={styles.footer}>
          <Ionicons name="heart" size={32} color="#EF4444" style={{ marginBottom: 8 }} />
          <Text style={styles.footerText}>Made with love</Text>
          <Text style={styles.versionText}>Relay Version 1.0.0</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  welcomeText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitleText: {
    color: Colors.dark.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  sectionDesc: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  footerText: {
    color: Colors.dark.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  versionText: {
    color: Colors.dark.muted,
    fontSize: 12,
    marginTop: 4,
  }
});
