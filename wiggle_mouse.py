#!/usr/bin/env python3
"""
Real system mouse movement using pyautogui
"""
import pyautogui
import time
import random

def wiggle_mouse():
    """Perform natural mouse movements"""
    # Perform small, natural movements
    movements = [
        (960, 540),   # center
        (970, 545),   # small offset
        (950, 535),   # another small offset
        (960, 540),   # back to center
    ]

    for x, y in movements:
        # Use duration for smooth movement
        pyautogui.moveTo(x, y, duration=random.uniform(0.1, 0.3))
        time.sleep(random.uniform(0.05, 0.15))

    print("✓ Mouse wiggle completed via pyautogui")

if __name__ == "__main__":
    wiggle_mouse()
