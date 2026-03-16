import { Ionicons } from '@expo/vector-icons';
import { DeviceMotion } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function App() {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [serverIP, setServerIP] = useState(''); // Empty by default
  const [connected, setConnected] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);

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

  const flipStateX = useRef(false);
  const flipStateY = useRef(false);
  const lastAx = useRef(0);
  const lastAy = useRef(0);

  const activeX = useRef(false);
  const zeroCountX = useRef(0);
  const activeY = useRef(false);
  const zeroCountY = useRef(0);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(30); // fast updates
    
    const subscription = DeviceMotion.addListener(motionData => {
      if (!motionData.acceleration) return;
      
      let rawAx = motionData.acceleration.x;
      let rawAy = motionData.acceleration.y;
      let ax = rawAx;
      let ay = rawAy;
      
      // Filter out micro-noise / deadzone
      if (Math.abs(ax) < 0.5) ax = 0;
      if (Math.abs(ay) < 0.5) ay = 0;

      // X axis logic
      if (ax === 0) {
        zeroCountX.current++;
        if (zeroCountX.current > 5) activeX.current = false;
      } else {
        if (!activeX.current) {
          flipStateX.current = false;
          activeX.current = true;
        } else if (lastAx.current !== 0 && Math.sign(ax) !== Math.sign(lastAx.current)) {
          flipStateX.current = true;
        }
        zeroCountX.current = 0;
        lastAx.current = ax;
      }
      if (!flipStateX.current && ax !== 0) ax = -ax;

      // Y axis logic
      if (ay === 0) {
        zeroCountY.current++;
        if (zeroCountY.current > 5) activeY.current = false;
      } else {
        if (!activeY.current) {
          flipStateY.current = false;
          activeY.current = true;
        } else if (lastAy.current !== 0 && Math.sign(ay) !== Math.sign(lastAy.current)) {
          flipStateY.current = true;
        }
        zeroCountY.current = 0;
        lastAy.current = ay;
      }
      if (!flipStateY.current && ay !== 0) ay = -ay;

      setData({ x: ax, y: ay, z: 0 });

      if (ws.current?.readyState === WebSocket.OPEN && (Math.abs(ax) > 0 || Math.abs(ay) > 0)) {
        console.log(`[${new Date().toISOString()}] Sending move: ax=${ax.toFixed(2)}, ay=${ay.toFixed(2)}`);
        ws.current.send(JSON.stringify({ action: 'move', dx: ax, dy: ay}));
      }
    });

    return () => {
      subscription.remove();
    };
  });

  const handleMouseEvent = (action: 'mousedown' | 'mouseup', button: 'left' | 'right') => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action, button }));
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
        <TouchableOpacity 
          style={styles.button} 
          onPressIn={() => handleMouseEvent('mousedown', 'left')}
          onPressOut={() => handleMouseEvent('mouseup', 'left')}
        >
          <Text style={styles.buttonText}>Left Click</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.button} 
          onPressIn={() => handleMouseEvent('mousedown', 'right')}
          onPressOut={() => handleMouseEvent('mouseup', 'right')}
        >
          <Text style={styles.buttonText}>Right Click</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.arrowContainer}>
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