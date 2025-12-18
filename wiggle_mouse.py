#!/usr/bin/env python3
"""
Real system mouse movement using pyautogui with advanced patterns
"""
import pyautogui
import time
import random
import math

def move_in_circle(center_x, center_y, radius, num_points=40, clockwise=True):
    """Move mouse in a circular pattern"""
    direction = -1 if clockwise else 1
    for i in range(num_points + 1):
        angle = direction * (2 * math.pi * i / num_points)
        x = center_x + radius * math.cos(angle)
        y = center_y + radius * math.sin(angle)

        # Keep within screen bounds
        x = max(100, min(1820, x))
        y = max(100, min(980, y))

        duration = random.uniform(0.01, 0.03)
        pyautogui.moveTo(x, y, duration=duration, _pause=False)

        # Random clicks during movement
        if random.random() < 0.1:
            pyautogui.click()

    print("  ○ Circle movement completed")

def move_in_spiral(center_x, center_y, max_radius, num_points=50, outward=True):
    """Move mouse in a spiral pattern"""
    for i in range(num_points + 1):
        if outward:
            radius = (max_radius * i) / num_points
        else:
            radius = max_radius * (1 - i / num_points)

        angle = 4 * math.pi * i / num_points
        x = center_x + radius * math.cos(angle)
        y = center_y + radius * math.sin(angle)

        # Keep within screen bounds
        x = max(100, min(1820, x))
        y = max(100, min(980, y))

        duration = random.uniform(0.01, 0.03)
        pyautogui.moveTo(x, y, duration=duration, _pause=False)

        if random.random() < 0.08:
            pyautogui.click()

    print("  ⊛ Spiral movement completed")

def move_in_figure8(center_x, center_y, width, height, num_points=50):
    """Move mouse in a figure-8 pattern"""
    for i in range(num_points + 1):
        t = 2 * math.pi * i / num_points
        x = center_x + width * math.sin(t)
        y = center_y + height * math.sin(2 * t) / 2

        # Keep within screen bounds
        x = max(100, min(1820, x))
        y = max(100, min(980, y))

        duration = random.uniform(0.01, 0.03)
        pyautogui.moveTo(x, y, duration=duration, _pause=False)

        # Random clicks
        if random.random() < 0.12:
            pyautogui.click()

    print("  ∞ Figure-8 movement completed")

def move_in_wave(start_x, start_y, end_x, end_y, amplitude, num_points=40):
    """Move mouse in a wave pattern"""
    for i in range(num_points + 1):
        t = i / num_points
        x = start_x + (end_x - start_x) * t
        y = start_y + (end_y - start_y) * t + amplitude * math.sin(6 * math.pi * t)

        # Keep within screen bounds
        x = max(100, min(1820, x))
        y = max(100, min(980, y))

        duration = random.uniform(0.01, 0.03)
        pyautogui.moveTo(x, y, duration=duration, _pause=False)

    print("  ≈ Wave movement completed")

def move_with_bezier(start_x, start_y, end_x, end_y, num_points=35):
    """Move mouse along a smooth Bezier curve"""
    # Random control points for natural curve
    ctrl1_x = start_x + random.randint(-250, 250)
    ctrl1_y = start_y + random.randint(-180, 180)
    ctrl2_x = end_x + random.randint(-250, 250)
    ctrl2_y = end_y + random.randint(-180, 180)

    for i in range(num_points + 1):
        t = i / num_points
        # Cubic Bezier formula
        x = (1-t)**3 * start_x + 3*(1-t)**2*t * ctrl1_x + 3*(1-t)*t**2 * ctrl2_x + t**3 * end_x
        y = (1-t)**3 * start_y + 3*(1-t)**2*t * ctrl1_y + 3*(1-t)*t**2 * ctrl2_y + t**3 * end_y

        # Keep within screen bounds
        x = max(100, min(1820, x))
        y = max(100, min(980, y))

        duration = random.uniform(0.01, 0.03)
        pyautogui.moveTo(x, y, duration=duration, _pause=False)

    print("  ⌇ Bezier curve movement completed")

def quick_zigzag(start_x, start_y, num_zigs=8):
    """Quick zigzag movements"""
    current_x, current_y = start_x, start_y
    for _ in range(num_zigs):
        offset_x = random.randint(-150, 150)
        offset_y = random.randint(-90, 90)

        target_x = max(100, min(1820, current_x + offset_x))
        target_y = max(100, min(980, current_y + offset_y))

        pyautogui.moveTo(target_x, target_y, duration=random.uniform(0.05, 0.12), _pause=False)
        current_x, current_y = target_x, target_y

        # Quick click
        if random.random() < 0.5:
            pyautogui.click()

    print("  ⚡ Zigzag movement completed")

def crazy_random_movement(num_moves=15):
    """Very aggressive random movements across entire screen"""
    for _ in range(num_moves):
        target_x = random.randint(200, 1720)
        target_y = random.randint(150, 930)

        pyautogui.moveTo(target_x, target_y, duration=random.uniform(0.08, 0.18), _pause=False)

        # Random actions
        action = random.random()
        if action < 0.3:
            pyautogui.click()
        elif action < 0.4:
            pyautogui.scroll(random.randint(-2, 2))

    print("  💥 Crazy random movement completed")

def perform_clicks_and_scrolls():
    """Random clicks and scroll actions"""
    actions = random.randint(5, 10)
    for _ in range(actions):
        action = random.choice(['click', 'click', 'double_click', 'scroll_up', 'scroll_down', 'scroll_down'])

        if action == 'click':
            pyautogui.click()
            print("  ← Click")
        elif action == 'double_click':
            pyautogui.doubleClick()
            print("  ⇇ Double click")
        elif action == 'scroll_up':
            pyautogui.scroll(random.randint(2, 5))
            print("  ↑ Scroll up")
        elif action == 'scroll_down':
            pyautogui.scroll(-random.randint(2, 5))
            print("  ↓ Scroll down")

        time.sleep(random.uniform(0.03, 0.08))

def wiggle_mouse():
    """Perform aggressive natural mouse movements with varied patterns"""
    pyautogui.PAUSE = 0  # Disable default pause for smoother movement

    # Start from center
    center_x, center_y = 960, 540

    # List of movement patterns
    patterns = [
        'circle', 'circle', 'spiral_out', 'spiral_in', 'figure8', 'figure8',
        'wave', 'bezier', 'zigzag', 'zigzag', 'clicks', 'crazy',
        'random', 'random', 'random'  # Weight random movements more
    ]

    # Shuffle patterns for variety
    random.shuffle(patterns)

    # Select number of patterns to execute
    num_patterns = random.randint(8, 14)

    for i in range(num_patterns):
        pattern = patterns[i % len(patterns)]

        # Random starting position for variety
        current_x = random.randint(400, 1520)
        current_y = random.randint(200, 880)

        if pattern == 'circle':
            radius = random.randint(60, 180)
            move_in_circle(current_x, current_y, radius,
                          num_points=random.randint(35, 50),
                          clockwise=random.choice([True, False]))

        elif pattern == 'spiral_out':
            max_radius = random.randint(100, 220)
            move_in_spiral(current_x, current_y, max_radius,
                          num_points=random.randint(40, 60), outward=True)

        elif pattern == 'spiral_in':
            max_radius = random.randint(100, 220)
            move_in_spiral(current_x, current_y, max_radius,
                          num_points=random.randint(40, 60), outward=False)

        elif pattern == 'figure8':
            width = random.randint(100, 200)
            height = random.randint(80, 150)
            move_in_figure8(current_x, current_y, width, height,
                           num_points=random.randint(40, 60))

        elif pattern == 'wave':
            end_x = random.randint(300, 1620)
            end_y = random.randint(150, 930)
            amplitude = random.randint(40, 100)
            move_in_wave(current_x, current_y, end_x, end_y, amplitude,
                        num_points=random.randint(35, 50))

        elif pattern == 'bezier':
            end_x = random.randint(300, 1620)
            end_y = random.randint(150, 930)
            move_with_bezier(current_x, current_y, end_x, end_y,
                           num_points=random.randint(30, 45))

        elif pattern == 'zigzag':
            quick_zigzag(current_x, current_y, num_zigs=random.randint(6, 12))

        elif pattern == 'clicks':
            perform_clicks_and_scrolls()

        elif pattern == 'crazy':
            crazy_random_movement(num_moves=random.randint(10, 20))

        else:  # random movements
            num_movements = random.randint(6, 12)
            for _ in range(num_movements):
                offset_x = random.randint(-400, 400)
                offset_y = random.randint(-250, 250)

                target_x = current_x + offset_x
                target_y = current_y + offset_y

                # Keep within screen bounds
                target_x = max(100, min(1820, target_x))
                target_y = max(100, min(980, target_y))

                duration = random.uniform(0.08, 0.16)
                pyautogui.moveTo(target_x, target_y, duration=duration, _pause=False)

                # Random clicks
                if random.random() < 0.3:
                    pyautogui.click()

                # Occasional scroll
                if random.random() < 0.2:
                    pyautogui.scroll(random.randint(-3, 3))

                # Occasional jitter
                if random.random() < 0.5:
                    jitter_x = target_x + random.randint(-12, 12)
                    jitter_y = target_y + random.randint(-12, 12)
                    pyautogui.moveTo(jitter_x, jitter_y, duration=0.03, _pause=False)

                current_x, current_y = target_x, target_y

            print("  ◆ Random movements completed")

        # Minimal pause between patterns
        time.sleep(random.uniform(0.01, 0.05))

    # Final rapid activity burst
    print("\n  🎯 Final activity burst...")
    for _ in range(random.randint(4, 8)):
        action = random.choice(['click', 'scroll', 'move'])
        if action == 'click':
            pyautogui.click()
        elif action == 'scroll':
            pyautogui.scroll(random.randint(-4, 4))
        else:
            pyautogui.move(random.randint(-50, 50), random.randint(-50, 50), duration=0.05)
        time.sleep(random.uniform(0.02, 0.05))

    # Final sweep
    pyautogui.moveTo(
        center_x + random.randint(-100, 100),
        center_y + random.randint(-100, 100),
        duration=random.uniform(0.15, 0.25),
        _pause=False
    )

    print("\n✓ SUPER AGGRESSIVE mouse wiggle completed! 🔥")

if __name__ == "__main__":
    wiggle_mouse()
