import os
from convert_with_playwright import convert_monster

monsters = [
    {
        "fbx": r"Cross Duel Models\dark magician girl\04766_01J.fbx",
        "tex": r"Cross Duel Models\dark magician girl\tex_04766_01J_1_def.png",
        "id": "dark-magician-girl",
        "scale": 2.0
    },
    {
        "fbx": r"Cross Duel Models\exodia\04027_01J.fbx",
        "tex": r"Cross Duel Models\exodia\tex_04027_01J_1_def.png",
        "id": "exodia-the-forbidden-one",
        "scale": 2.5
    },
    {
        "fbx": r"Cross Duel Models\red eyes\04088_01J.fbx",
        "tex": r"Cross Duel Models\red eyes\tex_04088_01J_1_def.png",
        "id": "red-eyes-black-dragon",
        "scale": 2.3
    },
    {
        "fbx": r"Cross Duel Models\neos\06653_01J.fbx",
        "tex": r"Cross Duel Models\neos\tex_06653_01J_1_def.png",
        "id": "elemental-hero-neos",
        "scale": 2.2
    }
]

for m in monsters:
    convert_monster(m["fbx"], m["tex"], m["id"], m["scale"])
