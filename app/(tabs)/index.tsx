import { Ionicons } from '@expo/vector-icons';
import { DeviceMotion } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function App() {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [serverIP, setServerIP] = useState(''); // Empty by default
  const [connected, setConnected] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(true);
  
  const ws = useRef<WebSocket | null>(null);
  const velocity = useRef({ x: 0, y: 0 });
  
  // Calibration to remove resting gravity drift
  const calibrationRef = useRef({ x: 0, y: 0, count: 0 });
  const baseline = useRef({ x: 0, y: 0 });

  useEffect(() => {
    connectWebSocket();
    return () => {
      ws.current?.close();
    };
  }, [serverIP]);

  const connectWebSocket = () => {
    if (ws.current) {
      ws.current.close();
    }
    
    // Don't connect if empty
    if (!serverIP) return;

    try {
      let url = serverIP.trim();
      if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        url = `ws://${url}:8765`;
      }
      
      const socket = new WebSocket(url);
      
      socket.onopen = () => {
        setConnected(true);
        console.log('Connected to server');
      };
      
      socket.onclose = () => {
        setConnected(false);
        console.log('Disconnected');
      };

      socket.onerror = () => {
        setConnected(false);
        console.log('Error connecting to Server');
      };
      
      ws.current = socket;
    } catch (e) {
      console.log('Connecting error', e);
    }
  };

  useEffect(() => {
    DeviceMotion.setUpdateInterval(50); // fast updates
    
    // Stop calibration after 1 second
    const calTimeout = setTimeout(() => {
      if (calibrationRef.current.count > 0) {
        baseline.current = {
          x: calibrationRef.current.x / calibrationRef.current.count,
          y: calibrationRef.current.y / calibrationRef.current.count,
        };
      }
      setIsCalibrating(false);
    }, 1000);

    const subscription = DeviceMotion.addListener(motionData => {
      if (!motionData.acceleration) return;
      
      let rawAx = motionData.acceleration.x;
      let rawAy = motionData.acceleration.y;
      
      if (isCalibrating) {
        calibrationRef.current.x += rawAx;
        calibrationRef.current.y += rawAy;
        calibrationRef.current.count += 1;
        return;
      }
      
      // Subtract baseline to remove residual drift
      let ax = rawAx - baseline.current.x;
      let ay = rawAy - baseline.current.y;
      
      // Filter out micro-noise / deadzone (increased to ~0.8)
      const noiseThreshold = 0.8;
      if (Math.abs(ax) < noiseThreshold) ax = 0;
      if (Math.abs(ay) < noiseThreshold) ay = 0;
      
      // Damped Velocity Integration
      velocity.current.x = (velocity.current.x * 0.8) + ax;
      velocity.current.y = (velocity.current.y * 0.8) + ay;
      
      // Update UI state with current velocity
      setData({ x: velocity.current.x, y: velocity.current.y, z: 0 });
      
      // Sensitivity multiplier for velocity -> pixel translation
      const sensitivity = 25; 
      
      let dx = velocity.current.x * sensitivity;
      let dy = -velocity.current.y * sensitivity; // Invert Y logically
      
      // Clamp dx and dy to a maximum of ±30 per frame
      const maxSpike = 30;
      if (dx > maxSpike) dx = maxSpike;
      if (dx < -maxSpike) dx = -maxSpike;
      if (dy > maxSpike) dy = maxSpike;
      if (dy < -maxSpike) dy = -maxSpike;

      // Only send if connected and moving
      if (ws.current?.readyState === WebSocket.OPEN && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        console.log(`[${new Date().toISOString()}] Sending move: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
        ws.current.send(JSON.stringify({ action: 'move', dx, dy }));
      }
    });

    return () => {
      clearTimeout(calTimeout);
      subscription.remove();
    };
  }, [isCalibrating]);

  const handleClick = (button: 'left' | 'right') => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'click', button }));
    }
  };

  // Derive an angle for the arrow depending on the tilt direction
  const getRotation = () => {
    // Math.atan2 takes (y, x)
    const angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
    return `${-angle + 90}deg`; 
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput 
          style={styles.input}
          value={serverIP}
          onChangeText={setServerIP}
          placeholder="e.g. 192.168.1.100 or ws://192.168.1.100"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.status, { color: connected ? '#4CAF50' : '#f44336' }]}>
          {connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={() => handleClick('left')}>
          <Text style={styles.buttonText}>Left Click</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => handleClick('right')}>
          <Text style={styles.buttonText}>Right Click</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.arrowContainer}>
        {isCalibrating ? (
            <Text style={styles.instructions}>Calibrating resting position...</Text>
        ) : (
            <Text style={styles.instructions}>Drag phone on desk to move cursor</Text>
        )}
        <Text style={styles.debugText}>X: {data.x.toFixed(2)} Y: {data.y.toFixed(2)}</Text>
        
        {/* We use an arrow pointing up, and rotate it based on the DeviceMotion X/Y */}
        <Ionicons 
          name="arrow-up" 
          size={120} 
          color="#007AFF" 
          style={{ transform: [{ rotate: getRotation() }] }} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  status: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 12,
    width: '45%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  arrowContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructions: {
    fontSize: 18,
    marginBottom: 10,
    color: '#333',
    fontWeight: '600',
  },
  debugText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 60,
  }
});