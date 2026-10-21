
import math
import os
import random
import struct
import wave

OUTPUT = "public/assets/audio"
os.makedirs(OUTPUT, exist_ok=True)

SAMPLE_RATE = 22050

def generate_tone(filename, start_freq, end_freq, duration, volume=0.35):
    samples = int(SAMPLE_RATE * duration)

    with wave.open(os.path.join(OUTPUT, filename), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)

        data = bytearray()

        for i in range(samples):
            t = i / SAMPLE_RATE
            progress = i / max(samples, 1)
            freq = start_freq + (end_freq - start_freq) * progress

            envelope = min(1, i / 150) * (1 - progress) ** 1.5
            value = math.sin(2 * math.pi * freq * t)
            value *= envelope * volume

            data.extend(struct.pack("<h", int(value * 32767)))

        wav.writeframes(data)

def generate_noise(filename, duration, volume=0.3):
    samples = int(SAMPLE_RATE * duration)

    with wave.open(os.path.join(OUTPUT, filename), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)

        data = bytearray()

        for i in range(samples):
            progress = i / max(samples, 1)
            envelope = (1 - progress) ** 2
            value = random.uniform(-1, 1) * envelope * volume
            data.extend(struct.pack("<h", int(value * 32767)))

        wav.writeframes(data)

generate_tone("fired.wav", 1000, 250, 0.12)
generate_tone("hit.wav", 500, 120, 0.18)
generate_noise("exploded.wav", 0.45)

print("Звукові файли створено:", OUTPUT)
