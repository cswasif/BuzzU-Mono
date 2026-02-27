
const fs = require('fs');
const path = require('path');

const baseDir = 'C:/Users/Administrator/.gemini/antigravity/brain/8e608058-d199-47c0-b6d7-a59c8084a433/.system_generated/steps/';
const stepDirs = ['1732', '1733', '1756', '1758', '1768', '1769', '1770', '1775', '1777', '1778'];

let allSongs = new Set();

stepDirs.forEach(step => {
    const filePath = path.join(baseDir, step, 'output.txt');
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');

        // Regex patterns for different list formats
        // Rolling Stone often uses "Number. Artist, 'Song'" or "Number. Artist - Song"
        // Billboard often uses "Artist - Song" or bolded names
        // Pitchfork often uses titles/headers for artist and song

        const lines = content.split('\n');
        lines.forEach(line => {
            // Match typical "Artist: Song" or "Artist - Song" or "Artist – Song"
            const match = line.match(/(?:\d+\.?\s+)?([^:–\-"]+)\s+[:–\-"]\s+([^"(\n]+)/);
            if (match) {
                let artist = match[1].trim();
                let song = match[2].trim();

                // Cleanup
                artist = artist.replace(/^[^a-zA-Z0-9]+/, '');
                song = song.replace(/["]+$/, '').trim();

                if (artist && song && artist.length < 50 && song.length < 100) {
                    allSongs.add(`${artist} - ${song}`);
                }
            }

            // Rolling Stone specific: "Artist, 'Song Title'"
            const rsMatch = line.match(/([^,]+),\s*['"]([^'"]+)['"]/);
            if (rsMatch) {
                let artist = rsMatch[1].trim();
                let song = rsMatch[2].trim();
                if (artist && song && artist.length < 50 && song.length < 100) {
                    allSongs.add(`${artist} - ${song}`);
                }
            }
        });
    }
});

const sortedSongs = Array.from(allSongs).sort();
fs.writeFileSync('buzzu_vibes_1000.txt', sortedSongs.join('\n'));
console.log(`Extracted ${sortedSongs.length} songs.`);
