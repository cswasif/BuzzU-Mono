import os
import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix the common " , avatarSeed }" pattern
    content = content.replace(" , avatarSeed }", ", avatarSeed }")
    
    # Fix the specific multi-line/comma mess in MatchPage (already fixed but for safety) and VideoChatArea
    # Regex to catch: , \n , avatarSeed } OR , , avatarSeed }
    content = re.sub(r",\s*,\s*avatarSeed", ", avatarSeed", content)
    
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk('apps/web/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_file(os.path.join(root, file))
