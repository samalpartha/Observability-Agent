"""
Visual Monitoring Specialist: Uses OpenCV to detect hardware anomalies in data centers.
Simulates a camera feed detecting "Red Alert" LEDs on server racks.
"""
import os
try:
    import cv2
except ImportError:
    cv2 = None
import numpy as np
import time
from typing import Optional
from agent.resilience import logger

class VisualSpecialist:
    def __init__(self, camera_id: int = 0):
        self.camera_id = camera_id
        self.running = False

    def analyze_frame(self, frame: np.ndarray) -> dict:
        """
        Analyze a single frame for 'Red' alert LEDs.
        Returns a summary of detected anomalies.
        """
        # Convert to HSV color space for better color detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Define range of red color in HSV
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 100, 100])
        upper_red2 = np.array([180, 255, 255])
        
        # Threshold the HSV image to get only red colors
        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        full_mask = mask1 + mask2
        
        # Find contours of red areas
        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        red_count = 0
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 100:  # Ignore small noise
                red_count += 1
                
        return {
            "status": "alert" if red_count > 0 else "ok",
            "anomaly_count": red_count,
            "detected_signal": "Red Alert LED Detected" if red_count > 0 else "Normal",
            "timestamp": time.time()
        }

    def run_physical_safety_check(self) -> dict:
        """
        Captures a frame and runs analysis. 
        Note: Supports headless environments by returning simulation if no camera found.
        """
        # In Cloud Run or when explicitly disabled, do not attempt to access physical camera
        if os.environ.get("K_SERVICE") or os.environ.get("DISABLE_OPENCV", "false").lower() == "true":
            logger.info("Cloud Run or DISABLE_OPENCV detected. Skipping physical camera access.")
            return self._simulate_check()
            
        try:
            cap = cv2.VideoCapture(self.camera_id)
            if not cap.isOpened():
                logger.warning("No camera found. Falling back to simulation mode for OpenCV.")
                return self._simulate_check()
                
            ret, frame = cap.read()
            cap.release()
            
            if not ret:
                return self._simulate_check()
                
            return self.analyze_frame(frame)
        except Exception as e:
            logger.error(f"OpenCV check failed: {e}")
            return self._simulate_check()

    def _simulate_check(self) -> dict:
        """Simulate a physical check for demo/headless/testing."""
        # Check environment variable for forced alert simulation
        force_alert = os.getenv("SIMULATE_VISUAL_ALERT", "false").lower() == "true"
        return {
            "status": "alert" if force_alert else "ok",
            "anomaly_count": 1 if force_alert else 0,
            "detected_signal": "Red Alert LED (Simulated)" if force_alert else "Normal (Simulated)",
            "timestamp": time.time(),
            "note": "Simulator mode active"
        }

def tool_physical_health_check() -> dict:
    """Agent tool to verify physical hardware health via vision."""
    specialist = VisualSpecialist()
    return specialist.run_physical_safety_check()
