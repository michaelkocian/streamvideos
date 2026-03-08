const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const VIDEO_DIR = path.resolve(process.argv[2] || path.join(__dirname, 'videos'));
const RATINGS_FILE = path.join(__dirname, 'ratings.json');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks for large VR files

if (!fs.existsSync(VIDEO_DIR)) {
  console.error(`Video directory not found: ${VIDEO_DIR}`);
  console.error('Usage: node server.js <video-folder-path>');
  process.exit(1);
}

function loadRatings() {
  try {
    return JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveRatings(ratings) {
  fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2));
}

function isPathSafe(name) {
  const resolved = path.resolve(path.join(VIDEO_DIR, name));
  return resolved.startsWith(VIDEO_DIR + path.sep);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List all videos
app.get('/api/videos', (req, res) => {
  try {
    const files = fs.readdirSync(VIDEO_DIR);
    const ratings = loadRatings();
    const videos = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (VIDEO_EXTENSIONS.has(ext)) {
        const stats = fs.statSync(path.join(VIDEO_DIR, file));
        videos.push({
          name: file,
          size: stats.size,
          rating: ratings[file] !== undefined ? ratings[file] : null,
          modified: stats.mtimeMs
        });
      }
    }

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list videos' });
  }
});

// Rate a video
app.post('/api/rate', (req, res) => {
  const { name, rating } = req.body;
  if (typeof name !== 'string' || !name || typeof rating !== 'number' || rating < -3 || rating > 5 || !Number.isInteger(rating)) {
    return res.status(400).json({ error: 'Invalid name or rating (-3 to 5 integer)' });
  }
  if (!isPathSafe(name)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const ratings = loadRatings();
  ratings[name] = rating;
  saveRatings(ratings);
  res.json({ success: true });
});

// Delete a video
app.delete('/api/videos/:name', (req, res) => {
  const name = req.params.name;
  if (!isPathSafe(name)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(VIDEO_DIR, name);
  try {
    fs.unlinkSync(filePath);
    const ratings = loadRatings();
    delete ratings[name];
    saveRatings(ratings);
    res.json({ success: true });
  } catch (err) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({ error: 'Failed to delete' });
  }
});

// Stream video with HTTP Range support
app.get('/api/stream/:name', (req, res) => {
  const name = req.params.name;
  if (!isPathSafe(name)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(VIDEO_DIR, name);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  const fileSize = stat.size;
  const ext = path.extname(name).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1]
      ? parseInt(parts[1], 10)
      : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

    if (start >= fileSize) {
      return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    }

    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });

    stream.pipe(res);
    stream.on('error', () => res.end());
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => res.end());
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  console.log(`Video directory: ${VIDEO_DIR}`);
  console.log(`Open in Quest 3 browser: http://<your-pc-ip>:${PORT}`);
});
