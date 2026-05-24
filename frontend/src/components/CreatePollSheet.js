import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

export default function CreatePollSheet({ visible, onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multipleAnswers, setMultipleAnswers] = useState(false);

  const addOption = () => {
    if (options.length >= 10) {
      Alert.alert('Limit Reached', 'You can only add up to 10 options.');
      return;
    }
    setOptions([...options, '']);
  };

  const removeOption = (index) => {
    if (options.length <= 2) {
      Alert.alert('Minimum Options', 'A poll must have at least 2 options.');
      return;
    }
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const updateOption = (text, index) => {
    const newOptions = [...options];
    newOptions[index] = text;
    setOptions(newOptions);
  };

  const handleCreate = () => {
    if (!question.trim()) {
      Alert.alert('Error', 'Please enter a question.');
      return;
    }
    
    const validOptions = options.map(opt => opt.trim()).filter(opt => opt.length > 0);
    if (validOptions.length < 2) {
      Alert.alert('Error', 'Please provide at least 2 valid options.');
      return;
    }

    // Format options as array of objects for the backend
    const formattedOptions = validOptions.map(text => ({ text, votes: [] }));
    
    onCreate({
      question: question.trim(),
      options: formattedOptions,
      multipleAnswers
    });
    
    // Reset state
    setQuestion('');
    setOptions(['', '']);
    setMultipleAnswers(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Poll</Text>
            <TouchableOpacity onPress={handleCreate} style={{ padding: 4 }}>
              <Text style={styles.createBtnText}>Send</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.input}
              placeholder="Ask a question..."
              placeholderTextColor={Colors.dark.muted}
              value={question}
              onChangeText={setQuestion}
              maxLength={255}
            />

            <Text style={[styles.label, { marginTop: 20 }]}>Options</Text>
            {options.map((opt, index) => (
              <View key={index} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={Colors.dark.muted}
                  value={opt}
                  onChangeText={(text) => updateOption(text, index)}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <TouchableOpacity onPress={() => removeOption(index)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.length < 10 && (
              <TouchableOpacity style={styles.addOptionBtn} onPress={addOption}>
                <Ionicons name="add" size={20} color={Colors.primary} />
                <Text style={styles.addOptionText}>Add Option</Text>
              </TouchableOpacity>
            )}

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Allow multiple answers</Text>
                <Text style={styles.toggleDesc}>Voters can select more than one option</Text>
              </View>
              <TouchableOpacity 
                style={[styles.toggleSwitch, multipleAnswers && styles.toggleSwitchActive]}
                onPress={() => setMultipleAnswers(!multipleAnswers)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleDot, multipleAnswers && styles.toggleDotActive]} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.dark.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.dark.bg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.dark.text,
    fontSize: 16,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  removeBtn: {
    padding: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addOptionText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  toggleDesc: {
    fontSize: 13,
    color: Colors.dark.muted,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: Colors.primary,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
  },
  toggleDotActive: {
    transform: [{ translateX: 20 }],
  },
});
