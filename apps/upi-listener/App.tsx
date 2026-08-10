/**
 * Devify Pay UPI Listener — App.tsx
 *
 * Adapted from GpayReader App.tsx (MIT) by InventiveGit-12.
 * Changes: Added configuration screen for API URL + UPI secret,
 * and last-5-notifications debug log.
 */
import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  AppState, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import RNAndroidNotificationListener from 'react-native-android-notification-listener';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [saved, setSaved] = useState<boolean>(false);
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);

  // Check notification listener permission (GpayReader pattern)
  const checkServicePermission = async () => {
    const status = await RNAndroidNotificationListener.getPermissionStatus();
    setHasPermission(status === 'authorized');
  };

  const handleRequestPermission = async () => {
    await RNAndroidNotificationListener.requestPermission();
  };

  // Load saved config from AsyncStorage
  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem('devify_backend_url') ?? '';
      const sec = await AsyncStorage.getItem('devify_upi_secret') ?? '';
      setBackendUrl(url);
      setSecret(sec);
      setConfigLoaded(true);
    })();

    checkServicePermission();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') checkServicePermission();
    });
    return () => subscription.remove();
  }, []);

  const handleSave = async () => {
    if (!backendUrl.trim() || !secret.trim()) {
      Alert.alert('Error', 'Both fields are required.');
      return;
    }
    const cleanUrl = backendUrl.trim().replace(/\/$/, '');
    await AsyncStorage.setItem('devify_backend_url', cleanUrl);
    await AsyncStorage.setItem('devify_upi_secret', secret.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!configLoaded) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Devify Pay Listener</Text>
        <Text style={styles.subtitle}>UPI Auto-Verification Companion App</Text>

        {/* Service Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, hasPermission ? styles.dotGreen : styles.dotRed]} />
            <Text style={[styles.statusText, hasPermission ? styles.active : styles.inactive]}>
              {hasPermission ? 'ACTIVE — Listening for payments' : 'DISABLED — Permission required'}
            </Text>
          </View>
          {!hasPermission && (
            <TouchableOpacity style={styles.btn} onPress={handleRequestPermission}>
              <Text style={styles.btnText}>Grant Notification Access</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Configuration */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configuration</Text>
          <Text style={styles.label}>Devify Pay API URL</Text>
          <TextInput
            style={styles.input}
            value={backendUrl}
            onChangeText={setBackendUrl}
            placeholder="https://your-app.up.railway.app"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.label}>UPI Notify Secret</Text>
          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={setSecret}
            placeholder="Copy from Admin Dashboard → Settings"
            placeholderTextColor="#555"
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.btn, saved && styles.btnSuccess]}
            onPress={handleSave}
          >
            <Text style={styles.btnText}>{saved ? 'Saved!' : 'Save Configuration'}</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it works</Text>
          <Text style={styles.instruction}>1. Grant notification access above</Text>
          <Text style={styles.instruction}>2. Enter your Railway API URL and the UPI Notify Secret from your Admin Dashboard → Settings</Text>
          <Text style={styles.instruction}>3. Leave this app running. Keep it in battery optimization exclusion list.</Text>
          <Text style={styles.instruction}>4. When a customer pays via UPI, Google Pay will notify this app, which will instantly verify the payment on your server.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: '#161616', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#222' },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#4CAF50' },
  dotRed: { backgroundColor: '#F44336' },
  statusText: { fontSize: 14, fontWeight: '500' },
  active: { color: '#4CAF50' },
  inactive: { color: '#F44336' },
  label: { fontSize: 12, color: '#888', marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14, fontFamily: 'monospace' },
  btn: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', marginTop: 14 },
  btnSuccess: { backgroundColor: '#4CAF50' },
  btnText: { color: '#000', fontSize: 14, fontWeight: '600' },
  instruction: { fontSize: 13, color: '#777', marginBottom: 8, lineHeight: 18 },
});
