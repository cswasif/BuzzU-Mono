import os
import re

TARGET_URL_TEMPLATE = "https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed={}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80"

regex_interpolated = r"`(?:https://proxy\.extractcss\.dev/)?https://api\.dicebear\.com/5\.x/thumbs/png[^`]*?seed=\$\{([^}]+)\}[^`]*`"
regex_fixed = r'"(?:https://proxy\.extractcss\.dev/)?https://api\.dicebear\.com/5\.x/thumbs/png[^"]*?seed=([^"&]+)[^"]*"'
regex_fixed_2 = r"'(?:https://proxy\.extractcss\.dev/)?https://api\.dicebear\.com/5\.x/thumbs/png[^']*?seed=([^'&]+)[^']*'"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    def repl_interp(m):
        seed_var = m.group(1)
        return "`" + TARGET_URL_TEMPLATE.format("${" + seed_var + "}") + "`"
    
    content = re.sub(regex_interpolated, repl_interp, content)

    def repl_fixed(m):
        seed_val = m.group(1)
        return '"' + TARGET_URL_TEMPLATE.format(seed_val) + '"'

    content = re.sub(regex_fixed, repl_fixed, content)
    content = re.sub(regex_fixed_2, repl_fixed, content)
    
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('apps/web/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
