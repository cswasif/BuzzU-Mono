import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    
    # 1. Update useSessionStore destructuring to include avatarSeed
    # Regex looks for: const { ... } = useSessionStore();
    def add_avatar_seed(m):
        inner = m.group(1)
        if 'avatarSeed' not in inner:
            return f"const {{ {inner}, avatarSeed }} = useSessionStore();"
        return m.group(0)

    content = re.sub(r"const\s+\{\s*([^}]+)\s*\}\s*=\s*useSessionStore\(\);", add_avatar_seed, content)

    # 2. Fix the URLs to use ${avatarSeed}
    # For Dashboard_Updated Modals/ProfilePopover/Sidebar
    content = content.replace("seed=${displayName}", "seed=${avatarSeed}")
    content = content.replace("seed=698a1c9eebb5a312f8caacd9", "seed=${avatarSeed}")
    
    # If there are hardcoded strings using double quotes containing seed=698a1c9eebb5a312f8caacd9, we need to convert them to backticks!
    # Example: src="https://api...seed=698a1c9..."
    def replace_hardcoded_db_url(m):
        return "`" + m.group(1).replace("seed=698a1c9eebb5a312f8caacd9", "seed=${avatarSeed}") + "`"
    content = re.sub(r'"([^"]*seed=698a1c9eebb5a312f8caacd9[^"]*)"', replace_hardcoded_db_url, content)

    def replace_hardcoded_chat_url(m):
        return "`" + m.group(1).replace("seed=69a013653ea2c25043517edd", "seed=${avatarSeed}") + "`"
    content = re.sub(r'"([^"]*seed=69a013653ea2c25043517edd[^"]*)"', replace_hardcoded_chat_url, content)
    content = content.replace("seed=69a013653ea2c25043517edd", "seed=${avatarSeed}")

    # 3. In ChatArea and VideoChatArea, our messages used peerId as seed newly.
    # Change "avatarSeed: peerId" to "avatarSeed: avatarSeed" (or just avatarSeed if we're feeling fancy, but explicit is safer for replacement)
    content = content.replace("avatarSeed: peerId", "avatarSeed: avatarSeed")
    
    # Optional: Fix FriendRequestsModal.tsx to use request.avatarSeed instead of request.username
    content = content.replace("seed=${request.username}", "seed=${request.avatarSeed}")

    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('apps/web/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
