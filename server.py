import asyncio
import json
import pyautogui
import websockets
from datetime import datetime

# Disable failsafe to allow mouse to go to the very edge of the screen
pyautogui.FAILSAFE = False

async def handle_connection(websocket):
    print("Device connected")
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get("action")
            
            if action == "move":
                dx = data.get("dx", 0)
                dy = data.get("dy", 0)
                
                # Double clamp safety net on server side capping at max 30 per frame
                if dx > 30: dx = 30
                if dx < -30: dx = -30
                if dy > 30: dy = 30
                if dy < -30: dy = -30
                
                # Apply the movement relatively
                print(f"[{datetime.now().isoformat()}] Moving cursor by dx: {dx}, dy: {dy}")
                pyautogui.move(dx, dy)
                
            elif action == "click":
                button = data.get("button", "left")
                print(f"[{datetime.now().isoformat()}] Clicking {button}")
                # Sometimes macOS ignores standard click(), explicit mouseDown and mouseUp is safer
                pyautogui.click(button=button)
                
    except websockets.exceptions.ConnectionClosed:
        print("Device disconnected")
    except Exception as e:
        print(f"Error: {e}")

async def main():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()

    print("Starting iPhoneMouse WebSocket Server...")
    print("Make sure your phone and computer are on the same Wi-Fi network.")
    server = await websockets.serve(handle_connection, "0.0.0.0", 8765)
    print(f"Server actually running on your local IP: ws://{IP}:8765")
    print(f"Please enter {IP} into the app.")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())