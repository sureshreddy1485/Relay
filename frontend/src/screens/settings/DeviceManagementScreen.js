import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import api from '../../services/api';
import TabHeader from '../../components/TabHeader';
import { useAlert } from '../../components/CustomAlert';

export default function DeviceManagementScreen({ navigation }) {
  const { showAlert } = useAlert();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoutId, setLogoutId] = useState(null);
  
  // Security PIN Modal State
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [targetDevice, setTargetDevice] = useState(null);
  const [securityKey, setSecurityKey] = useState('');

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const { data } = await api.get('/auth/devices');
      // sort current device to top
      const sorted = data.devices.sort((a, b) => (a.isCurrent ? -1 : 1));
      setDevices(sorted);
    } catch (e) {
      showAlert('Error', e.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutDevice = async (deviceId, isCurrent) => {
    if (isCurrent) {
      showAlert('Current Device', 'You cannot log out the current device from here. Use the main logout button instead.');
      return;
    }

    showAlert(
      'Log Out Device',
      'Are you sure you want to log out of this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            setTargetDevice(deviceId);
            setSecurityKey('');
            setPinModalVisible(true);
          }
        }
      ]
    );
  };

  const executeLogout = async () => {
    if (!securityKey.trim()) {
      showAlert('Error', 'Please enter your Security PIN');
      return;
    }
    
    setPinModalVisible(false);
    setLogoutId(targetDevice);
    try {
      await api.delete(`/auth/devices/${targetDevice}`, { data: { securityKey } });
      setDevices(prev => prev.filter(d => d.deviceId !== targetDevice));
      showAlert('Success', 'Device has been logged out.');
    } catch (e) {
      showAlert('Error', e.response?.data?.message || e.message || 'Failed to log out device');
    } finally {
      setLogoutId(null);
      setTargetDevice(null);
      setSecurityKey('');
    }
  };

  const renderItem = ({ item }) => {
    const isCurrent = item.isCurrent;
    const date = new Date(item.lastActive).toLocaleDateString();
    
    return (
      <View style={styles.deviceCard}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name={item.deviceName.includes('Simulator') || item.deviceName.includes('Desktop') || item.deviceName.includes('Web') ? "desktop-outline" : "phone-portrait-outline"} 
            size={24} 
            color={isCurrent ? Colors.primary : Colors.dark.muted} 
          />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, isCurrent && { color: Colors.primary }]}>
            {item.deviceName || 'Unknown Device'} {isCurrent && '(This Device)'}
          </Text>
          <Text style={styles.lastActive}>Last active: {date}</Text>
        </View>
        {!isCurrent && (
          <TouchableOpacity 
            style={styles.logoutBtn} 
            onPress={() => handleLogoutDevice(item.deviceId, isCurrent)}
            disabled={logoutId === item.deviceId}
          >
            {logoutId === item.deviceId ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TabHeader title="Active Devices" onBack={() => navigation.goBack()} />
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.deviceId}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No active devices found.</Text>
          }
        />
      )}

      {/* Security PIN Modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinModal}>
            <Text style={styles.modalTitle}>Enter Security PIN</Text>
            <Text style={styles.modalDesc}>Please enter your security PIN to authorize this action.</Text>
            
            <TextInput
              style={styles.pinInput}
              placeholder="Enter PIN"
              placeholderTextColor={Colors.dark.muted}
              secureTextEntry
              keyboardType="number-pad"
              value={securityKey}
              onChangeText={setSecurityKey}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnCancel]} 
                onPress={() => setPinModalVisible(false)}
              >
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnConfirm]} 
                onPress={executeLogout}
              >
                <Text style={styles.modalBtnTextConfirm}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16, gap: 12 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.input,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  lastActive: { color: Colors.dark.muted, fontSize: 13 },
  logoutBtn: {
    padding: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  emptyText: { color: Colors.dark.muted, textAlign: 'center', marginTop: 40 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pinModal: {
    backgroundColor: Colors.dark.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDesc: {
    color: Colors.dark.muted,
    fontSize: 14,
    marginBottom: 20,
  },
  pinInput: {
    backgroundColor: Colors.dark.input,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    color: '#FFF',
    padding: 14,
    fontSize: 16,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalBtnConfirm: {
    backgroundColor: Colors.primary,
  },
  modalBtnTextCancel: {
    color: Colors.dark.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBtnTextConfirm: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
