import os
from PIL import Image

raw_dir = r"C:\Users\Tom\Desktop\cardgamepriv\imports\Raw Files"
for f in os.listdir(raw_dir):
    if f.lower().endswith(".tga"):
        tga_path = os.path.join(raw_dir, f)
        png_path = os.path.join(raw_dir, os.path.splitext(f)[0] + ".png")
        im = Image.open(tga_path)
        im.save(png_path)
        print(f"Converted {f} -> {os.path.basename(png_path)} ({im.size})")

print("All TGAs converted to PNG successfully.")
