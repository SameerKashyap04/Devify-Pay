import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, AppState } from 'react-native';
import RNAndroidNotificationListener from 'react-native-android-notification-listener';

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);

  // Function to query the native system settings state
  const checkServicePermission = async () => {
    const status = await RNAndroidNotificationListener.getPermissionStatus();
    setHasPermission(status === 'authorized');
  };
  useEffect(()=>{
    checkServicePermission();

    const subscription = AppState.addEventListener('change', (nextAppState)=>{
      if(nextAppState=== 'active'){
        checkServicePermission();
      }
    })
    return()=>subscription.remove();
  }, []);

const handleRequestPermission = async () => {
    await RNAndroidNotificationListener.requestPermission();
  };

return (
    <View style={styles.container}>
      <Text style={styles.title}>Bootleg Gateway Monitor</Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Service Status:</Text>
        <Text style={[styles.statusText, hasPermission ? styles.active : styles.inactive]}>
          {hasPermission ? "ACTIVE & LISTENING" : "DISABLED"}
        </Text>
      </View>

      {!hasPermission && (
        <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
          <Text style={styles.buttonText}>Grant Notification Access</Text>
        </TouchableOpacity>
      )}
    </View>
  );

}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 30 },
  statusBox: { flexDirection: 'row', marginBottom: 40, alignItems: 'center' },
  statusLabel: { fontSize: 18, color: '#aaa', marginRight: 10 },
  statusText: { fontSize: 18, fontWeight: 'bold' },
  active: { color: '#4CAF50' },
  inactive: { color: '#F44336' },
  button: { backgroundColor: '#2196F3', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});