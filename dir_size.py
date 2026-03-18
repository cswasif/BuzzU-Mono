import os

def get_dir_size(start_path='.'):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(start_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            # skip if it is symbolic link
            if not os.path.islink(fp):
                try:
                    total_size += os.path.getsize(fp)
                except OSError:
                    pass
    return total_size

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0

items = os.listdir('.')
results = []
for item in items:
    path = os.path.join('.', item)
    if os.path.isdir(path):
        size = get_dir_size(path)
    else:
        size = os.path.getsize(path)
    results.append((item, size))

results.sort(key=lambda x: x[1], reverse=True)

print(f"{'Name':<30} | {'Size':<15}")
print("-" * 50)
for name, size in results:
    print(f"{name:<30} | {format_size(size):<15}")
