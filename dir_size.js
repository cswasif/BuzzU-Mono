const fs = require('fs');
const path = require('path');

function getDirSize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(dirPath, files[i]);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        size += stats.size;
      } else if (stats.isDirectory()) {
        size += getDirSize(filePath);
      }
    } catch (e) {}
  }
  return size;
}

function formatSize(size) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(2) + ' ' + units[i];
}

const items = fs.readdirSync('.');
const results = [];

for (const item of items) {
  const itemPath = path.join('.', item);
  try {
    const stats = fs.statSync(itemPath);
    if (stats.isDirectory()) {
      results.push({ name: item, size: getDirSize(itemPath) });
    } else {
      results.push({ name: item, size: stats.size });
    }
  } catch (e) {}
}

results.sort((a, b) => b.size - a.size);

console.log(`${'Name'.padEnd(30)} | ${'Size'.padEnd(15)}`);
console.log('-'.repeat(50));
for (const res of results) {
  console.log(`${res.name.padEnd(30)} | ${formatSize(res.size).padEnd(15)}`);
}
