const fs = require('fs');
const filepath = 'c:\\Users\\sures\\Desktop\\Relay\\frontend\\src\\screens\\chat\\GroupInfoScreen.js';

let content = fs.readFileSync(filepath, 'utf-8');

// 1. Update imports
content = content.replace(
    /import React, \{ useState, useEffect \} from 'react';/,
    "import React, { useState, useEffect, useMemo } from 'react';"
);

content = content.replace(
    /import \{ Ionicons \} from '@expo\/vector-icons';/,
    "import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';\nimport { Dimensions } from 'react-native';\nconst { width } = Dimensions.get('window');"
);

// 2. Update MemberGridItem
const old_member_grid_item = `// Member grid item
const MemberGridItem = ({ member, role, isMe, canManage, onAction, onTap }) => (
  <TouchableOpacity
    style={styles.gridItem}
    onPress={() => onTap(member)}
    onLongPress={() => !isMe && canManage && onAction(member)}
    activeOpacity={0.7}
  >
    <View style={styles.gridAvatarWrap}>
      {member.profilePicture ? (
        <Image source={{ uri: member.profilePicture }} style={styles.gridAvatar} />
      ) : (
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.gridAvatar}>
          <Text style={styles.gridInitial}>
            {(member.displayName || member.username).charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
      )}

      {/* Dynamic role icon badge at bottom-right */}
      <View style={[
        styles.roleIconBadge,
        role === 'system_bot' ? { backgroundColor: '#3B82F6' } :
        role === 'owner' ? styles.badgeOwner : 
        role === 'admin' ? styles.badgeAdmin : styles.badgeUser
      ]}>
        <Ionicons
          name={role === 'system_bot' ? 'hardware-chip' : role === 'owner' ? 'star' : role === 'admin' ? 'shield-checkmark' : 'person'}
          size={9}
          color="#FFF"
        />
      </View>
    </View>

    <Text style={styles.gridName} numberOfLines={1}>
      {member.displayName || member.username}
    </Text>
    {isMe && <Text style={styles.gridMeText}>You</Text>}
  </TouchableOpacity>
);`;

const new_member_grid_item = `// Member grid item
const MemberGridItem = ({ member, role, isMe, canManage, onAction, onTap }) => (
  <TouchableOpacity
    style={styles.gridItem}
    onPress={() => onTap(member)}
    onLongPress={() => !isMe && canManage && onAction(member)}
    activeOpacity={0.7}
  >
    <View style={styles.gridAvatarWrap}>
      {member.profilePicture ? (
        <Image source={{ uri: member.profilePicture }} style={styles.gridAvatar} />
      ) : (
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.gridAvatar}>
          <Text style={styles.gridInitial}>
            {(member.displayName || member.username).charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
      )}

      {(role === 'owner' || role === 'admin') && (
        <View style={styles.badgeCrown}>
          <MaterialCommunityIcons name="crown" size={12} color="#FFF" />
        </View>
      )}
    </View>

    <Text style={styles.gridName} numberOfLines={1}>
      {isMe ? 'You' : (member.displayName || member.username)}
    </Text>
  </TouchableOpacity>
);`;

content = content.replace(old_member_grid_item, new_member_grid_item);

// 3. Add states
content = content.replace(
    /const \[expandedSection, setExpandedSection\] = useState\(null\);/,
    "const [expandedSection, setExpandedSection] = useState(null);\n  const [activeTab, setActiveTab] = useState('members');"
);

// 4. Add mediaMessages
const old_sorted_members_regex = /  const sortedMembers = \[\.\.\.\(chat\.users \|\| \[\]\)\].sort\(\(a, b\) => \{[\s\S]*?const memberCount = chat\.users\?\.length \|\| 0;/;
const media_messages_code = `  const sortedMembers = [...(chat.users || [])].sort((a, b) => {
    const ra = getRole(a._id || a);
    const rb = getRole(b._id || b);
    const rank = { owner: 0, admin: 1, null: 2 };
    return (rank[ra] ?? 2) - (rank[rb] ?? 2);
  });

  const memberCount = chat.users?.length || 0;

  const messages = useChatStore(state => state.messages[chat._id] || []);
  const mediaMessages = useMemo(() => {
    return messages.filter(m => m.mediaUrl).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [messages]);`;

content = content.replace(old_sorted_members_regex, media_messages_code);

// 5. Replace Main UI
const main_ui_regex = /    <View style=\{styles\.container\}>\n      <StatusBar barStyle="light-content" \/>[\s\S]*?      <\/ScrollView>/;

const new_main_ui = `    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: (insets.top || StatusBar.currentHeight || 0) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Info</Text>
          <Text style={styles.headerSubtitle}>{memberCount} of 100 Members</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => {}}>
            <Ionicons name="share-social-outline" size={22} color={Colors.dark.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (isAdmin) {
                setEditName(chat.chatName || '');
                setEditDesc(chat.groupDescription || '');
                setEditPrivacy(chat.joinPrivacy || 'anyone');
                setEditIsPublic(chat.isPublic !== false);
                setEditAvatar(null);
                setShowEditModal(true);
              } else {
                showAlert('Info', 'Only admins can edit this group.');
              }
            }}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={Colors.dark.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Actions List */}
        <View style={styles.actionsList}>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('ChatRoom', { chat })}>
            <Ionicons name="chatbubble-ellipses" size={22} color={Colors.dark.text} />
            <Text style={styles.actionText}>Open Chat</Text>
          </TouchableOpacity>

          <View style={styles.actionItem}>
            <Ionicons name="notifications" size={22} color={Colors.dark.text} />
            <Text style={styles.actionText}>Notifications</Text>
            <Switch
              value={true}
              onValueChange={() => {}}
              trackColor={{ false: '#3A3A3A', true: Colors.primary }}
              thumbColor="#FFF"
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>

          <View style={styles.actionItem}>
            <Ionicons name="mail" size={22} color={Colors.dark.text} />
            <View style={{ position: 'absolute', left: 24, top: 12, backgroundColor: Colors.dark.bg, borderRadius: 10 }}>
              <Ionicons name="lock-closed" size={10} color={Colors.dark.text} />
            </View>
            <Text style={styles.actionText}>Receive Direct Messages</Text>
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: '#3A3A3A', true: Colors.primary }}
              thumbColor="#FFF"
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>

          {isAdmin && (
            <TouchableOpacity style={styles.actionItem} onPress={() => setShowTheme(true)}>
              <Ionicons name="settings" size={22} color={Colors.dark.text} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Change Chat Theme</Text>
                <Text style={styles.actionSubtext}>{chat.theme === 'default' ? 'Default' : 'Moondust'}</Text>
              </View>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity style={styles.actionItem} onPress={() => setShowAddMemberModal(true)}>
              <Ionicons name="add" size={26} color={Colors.primary} />
              <Text style={[styles.actionText, { color: Colors.primary }]}>Add People</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionItem} onPress={handleLeave}>
            <Ionicons name="exit-outline" size={24} color="#E11D48" style={{ transform: [{ scaleX: -1 }] }} />
            <Text style={[styles.actionText, { color: '#E11D48' }]}>Leave Group</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrapper}>
          <TouchableOpacity style={[styles.tab, activeTab === 'members' && styles.tabActive]} onPress={() => setActiveTab('members')}>
            <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>Members</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'media' && styles.tabActive]} onPress={() => setActiveTab('media')}>
            <Text style={[styles.tabText, activeTab === 'media' && styles.tabTextActive]}>Media</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'members' ? (
          <View style={styles.membersGridContainer}>
            {sortedMembers.map((member) => {
              const id = member._id || member;
              const isMe = id?.toString() === myId?.toString();
              return (
                <MemberGridItem
                  key={id}
                  member={typeof member === 'object' ? member : { _id: member, username: 'Unknown' }}
                  role={getRole(id)}
                  isMe={isMe}
                  canManage={isOwner || isAdmin}
                  onAction={handleMemberAction}
                  onTap={(m) => {
                    if (isMe) return;
                    setSelectedMember(m);
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.mediaGridContainer}>
            {mediaMessages.length === 0 ? (
              <Text style={{ color: Colors.dark.muted, textAlign: 'center', marginTop: 40, width: '100%' }}>No media shared</Text>
            ) : (
              mediaMessages.map(item => {
                const isVideo = item.messageType === 'video' || (item.mediaUrl && item.mediaUrl.match(/\\.(mp4|mov|webm)$/i));
                return (
                  <TouchableOpacity 
                    key={item._id}
                    style={styles.mediaItem}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('MediaViewer', { mediaUrl: item.mediaUrl, messageType: item.messageType })}
                  >
                    <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
                    {isVideo && (
                      <View style={styles.videoIcon}>
                        <Ionicons name="play-circle" size={24} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

      </ScrollView>`;

content = content.replace(main_ui_regex, new_main_ui);

// 6. Update Styles
const styles_append = `
  // New Styles
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSubtitle: { fontSize: 13, color: Colors.dark.muted, marginTop: 2 },
  actionsList: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  actionText: { fontSize: 16, color: Colors.dark.text, fontWeight: '500', flex: 1 },
  actionSubtext: { fontSize: 13, color: Colors.dark.muted, marginTop: 2 },
  tabsWrapper: {
    flexDirection: 'row', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    marginBottom: 16, backgroundColor: Colors.dark.bg,
  },
  tab: { paddingVertical: 14, paddingHorizontal: 16, marginRight: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 15, color: Colors.dark.muted, fontWeight: '600' },
  tabTextActive: { color: Colors.primary },
  membersGridContainer: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 40,
  },
  gridItem: {
    width: '25%', // 4 columns
    alignItems: 'center', marginBottom: 20,
  },
  gridAvatarWrap: { position: 'relative', marginBottom: 8 },
  gridAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  gridInitial: { fontSize: 24, fontWeight: '700', color: '#FFF' },
  badgeCrown: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#F97316', // Orange
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.dark.bg,
  },
  gridName: { fontSize: 12, fontWeight: '500', color: Colors.dark.text, textAlign: 'center', width: '100%', paddingHorizontal: 4 },
  mediaGridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 },
  mediaItem: { width: (width - 4) / 3, height: (width - 4) / 3, padding: 1 },
  mediaImage: { width: '100%', height: '100%', backgroundColor: Colors.dark.card },
  videoIcon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
`;

content = content.replace("  modalOverlay: {", styles_append + "\n  modalOverlay: {");

fs.writeFileSync(filepath, content);
console.log("Update completed successfully.");
