import React, { createContext, useContext, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../theme/colors';

export const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState(null);

  const showAlert = (title, message, buttons = [{ text: 'OK', style: 'default' }]) => {
    setAlertConfig({ title, message, buttons });
  };

  const closeAlert = () => setAlertConfig(null);

  return (
    <AlertContext.Provider value={{ showAlert, closeAlert }}>
      {children}
      <Modal visible={!!alertConfig} transparent animationType="fade" onRequestClose={closeAlert}>
        <View style={styles.overlay}>
          <View style={styles.alertBox}>
            <Text style={styles.title}>{alertConfig?.title}</Text>
            {alertConfig?.message ? <Text style={styles.message}>{alertConfig?.message}</Text> : null}
            <View style={styles.buttonContainer}>
              {alertConfig?.buttons?.slice().sort((a, b) => {
                if (a.style === 'cancel' && b.style !== 'cancel') return 1;
                if (b.style === 'cancel' && a.style !== 'cancel') return -1;
                return 0;
              }).map((btn, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    btn.style === 'cancel' && styles.cancelButton,
                    btn.style === 'destructive' && styles.destructiveButton,
                  ]}
                  onPress={() => {
                    closeAlert();
                    if (btn.onPress) btn.onPress();
                  }}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      btn.style === 'cancel' && styles.cancelText,
                      btn.style === 'destructive' && styles.destructiveText,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    backgroundColor: Colors.dark.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: Colors.dark.muted,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  destructiveButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.dark.muted,
  },
  destructiveText: {
    color: '#EF4444',
  },
});
