/**
 * Chat tab — main interaction screen.
 *
 * Supports /remember and /ask commands via Brain orchestrator.
 * Messages render in a scrollable list with typing indicator.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// In-app chat state (self-contained, no cross-package imports needed at runtime)
interface Message {
  id: string;
  type: 'user' | 'dina' | 'system';
  content: string;
  timestamp: number;
}

let messageCounter = 0;
const chatHistory: Message[] = [];
const vaultMemory: Record<string, string> = {};

function addMessage(type: Message['type'], content: string): Message {
  const msg: Message = {
    id: `msg-${++messageCounter}`,
    type,
    content,
    timestamp: Date.now(),
  };
  chatHistory.push(msg);
  return msg;
}

function processCommand(text: string): string {
  const trimmed = text.trim();

  // /help
  if (trimmed === '/help') {
    return [
      '/remember <text> — Store something in memory',
      '/ask <question> — Search your memories',
      '/help — Show this help',
    ].join('\n');
  }

  // /remember
  if (trimmed.startsWith('/remember ')) {
    const memory = trimmed.slice('/remember '.length).trim();
    if (!memory) return 'What would you like me to remember?';

    const key = memory.toLowerCase();
    vaultMemory[key] = memory;
    return `Got it — I'll remember that. (${Object.keys(vaultMemory).length} memories stored)`;
  }

  // /ask
  if (trimmed.startsWith('/ask ')) {
    const query = trimmed.slice('/ask '.length).trim().toLowerCase();
    if (!query) return 'What would you like to know?';

    const matches = Object.values(vaultMemory).filter(m =>
      m.toLowerCase().includes(query) ||
      query.split(' ').some(w => w.length > 2 && m.toLowerCase().includes(w))
    );

    if (matches.length > 0) {
      return matches.map((m, i) => `${i + 1}. ${m}`).join('\n') + `\n\n[Source: vault, ${matches.length} match(es)]`;
    }
    return `No memories found matching "${query}".`;
  }

  // General chat
  return `I heard you say: "${trimmed}"\n\nTry /remember or /ask to use your vault.`;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');

    // Add user message
    addMessage('user', text);
    setMessages([...chatHistory]);

    // Show typing indicator
    setIsTyping(true);

    // Simulate brief thinking delay
    await new Promise(r => setTimeout(r, 300));

    // Process and respond
    const response = processCommand(text);
    addMessage('dina', response);

    setIsTyping(false);
    setMessages([...chatHistory]);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [inputText]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.type === 'user';
    const isSystem = item.type === 'system';

    return (
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.dinaBubble,
        isSystem && styles.systemBubble,
      ]}>
        {!isUser && <Text style={styles.senderLabel}>{isSystem ? 'System' : 'Dina'}</Text>}
        <Text style={[styles.messageText, isUser && styles.userText]}>
          {item.content}
        </Text>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <StatusBar style="auto" />

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.title}>Dina</Text>
          <Text style={styles.subtitle}>Your sovereign personal AI</Text>
          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Try these commands:</Text>
            <Text style={styles.hint}>/remember Emma's birthday is March 15</Text>
            <Text style={styles.hint}>/ask When is Emma's birthday?</Text>
            <Text style={styles.hint}>/help</Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {isTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>Dina is thinking...</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          testID="chat-input"
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          editable={!isTyping}
          autoCorrect={false}
        />
        <TouchableOpacity
          testID="send-button"
          style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isTyping}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 32, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
  hintBox: { marginTop: 32, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, width: '100%' },
  hintTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  hint: { fontSize: 14, color: '#007AFF', marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, marginBottom: 8 },
  userBubble: { backgroundColor: '#007AFF', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  dinaBubble: { backgroundColor: '#F0F0F0', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  systemBubble: { backgroundColor: '#FFF3CD', alignSelf: 'center', maxWidth: '90%' },
  senderLabel: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 2 },
  messageText: { fontSize: 16, lineHeight: 22, color: '#333' },
  userText: { color: '#fff' },
  typingIndicator: { paddingHorizontal: 20, paddingVertical: 8 },
  typingText: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  textInput: { flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#DDD' },
  sendButton: { marginLeft: 8, backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 18, justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#B0B0B0' },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
