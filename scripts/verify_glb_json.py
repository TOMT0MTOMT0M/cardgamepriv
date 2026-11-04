import struct
import json
import glob
import os

models_dir = r"C:\Users\Tom\Desktop\cardgamepriv\public\fx\yugioh\models"
files = [
    'blue-eyes-white-dragon.glb',
    'dark-magician.glb',
    'dark-magician-girl.glb',
    'exodia-the-forbidden-one.glb',
    'obelisk-the-tormentor.glb',
    'red-eyes-black-dragon.glb',
    'seto-kaiba.glb',
    'slifer-the-sky-dragon.glb',
    'yami-yugi.glb'
]

print("=== VERIFYING GLB ANIMATIONS & STRUCTURE ===\n")
for f in files:
    p = os.path.join(models_dir, f)
    with open(p, "rb") as fl:
        magic, version, length = struct.unpack("<4sII", fl.read(12))
        chunk_len, chunk_type = struct.unpack("<I4s", fl.read(8))
        json_data = json.loads(fl.read(chunk_len).decode("utf-8"))
        
        anims = [a.get("name", "unnamed") for a in json_data.get("animations", [])]
        meshes = len(json_data.get("meshes", []))
        images = len(json_data.get("images", []))
        materials = len(json_data.get("materials", []))
        print(f"[{f}] ({os.path.getsize(p):,} bytes):")
        print(f"   Clips: {anims}")
        print(f"   Meshes: {meshes}, Materials: {materials}, Embedded Images: {images}\n")
