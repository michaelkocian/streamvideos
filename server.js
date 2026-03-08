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
 
function ratingKeyFromNameSize(name, size) {
  return `${name}::${size}`;
}

function saveRatings(ratings) {
  fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2));
}

function isPathSafe(relPath) {
  const resolved = path.resolve(path.join(VIDEO_DIR, relPath));
  return resolved === VIDEO_DIR || resolved.startsWith(VIDEO_DIR + path.sep);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Deep search videos recursively
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const ratingParam = req.query.rating;
  let rating = null;
  if (ratingParam !== undefined) {
    rating = parseInt(ratingParam, 10);
    if (isNaN(rating) || rating < -1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating (-1 to 5)' });
    }
  }
  console.log(`[SEARCH] Query: "${q}"${rating !== null ? `, rating: ${rating}` : ''} from ${req.ip}`);
  if (!q && rating === null) {
    console.log(`[SEARCH] Empty query from ${req.ip}`);
    return res.json([]);
  }
  const ratings = loadRatings();
  function walk(dir, relPath = '') {
    let results = [];
    let files;
    try { files = fs.readdirSync(dir); } catch { return results; }
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stats;
      try { stats = fs.statSync(fullPath); } catch { continue; }
      const subRel = relPath ? relPath + '/' + file : file;
      if (stats.isDirectory()) {
        // If folder name matches, include it
        if (q && file.toLowerCase().includes(q)) {
          results.push({ name: subRel, type: 'folder' });
        }
        results = results.concat(walk(fullPath, subRel));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(ext)) continue;
        // Always use full relative path for key
        const key = ratingKeyFromNameSize(file, stats.size);
        const fileRating = ratings[key] !== undefined ? ratings[key] : null;
        // If searching by rating
        if (rating !== null) {
          if (fileRating === rating) {
            results.push({
              name: subRel,
              type: 'video',
              size: stats.size,
              rating: fileRating,
              modified: stats.mtimeMs
            });
          }
        } else if (q && file.toLowerCase().includes(q)) {
          results.push({
            name: subRel,
            type: 'video',
            size: stats.size,
            rating: fileRating,
            modified: stats.mtimeMs
          });
        }
      }
    }
    return results;
  }
  if (!isPathSafe('')) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const results = walk(VIDEO_DIR);
  res.json(results);
});

// List videos and folders in a directory
app.get('/api/videos', (req, res) => {
  try {
    const subdir = req.query.dir || '';
    console.log(`[ACCESS] Listing directory: ${subdir || '/'} from ${req.ip}`);
    if (!isPathSafe(subdir)) {
      console.warn(`[DENIED] Directory access: ${subdir}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    const targetDir = path.join(VIDEO_DIR, subdir);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      console.warn(`[NOT FOUND] Directory: ${targetDir}`);
      return res.status(404).json({ error: 'Directory not found' });
    }

    const files = fs.readdirSync(targetDir);
    const ratings = loadRatings();
    const items = [];

    for (const file of files) {
      const fullPath = path.join(targetDir, file);
      let stats;
      try { stats = fs.statSync(fullPath); } catch { continue; }
 
      if (stats.isDirectory()) {
        items.push({ name: file, type: 'folder' });
      } else {
        const ext = path.extname(file).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const key = ratingKeyFromNameSize(file, stats.size);
          items.push({
            name: file,
            type: 'video',
            size: stats.size,
            rating: ratings[key] !== undefined ? ratings[key] : null,
            modified: stats.mtimeMs
          });
        }
      }
    }

    res.json(items);
  } catch (err) {
    console.error(`[ERROR] Failed to list directory: ${err}`);
    res.status(500).json({ error: 'Failed to list directory' });
  }
});

// Rate a video (name can include subdir path like "sub/file.mp4")
app.post('/api/rate', (req, res) => {
  const { name, size, rating } = req.body;
  console.log(`[RATE] ${name} (${size}) set to ${rating} by ${req.ip}`);
  if (typeof name !== 'string' || !name || typeof size !== 'number' || size <= 0 || typeof rating !== 'number' || rating < -3 || rating > 5 || !Number.isInteger(rating)) {
    console.warn(`[DENIED] Invalid rating: ${name} (${size}) -> ${rating}`);
    return res.status(400).json({ error: 'Invalid name, size, or rating (-3 to 5 integer)' });
  }
  // Path safety check for name
  if (!isPathSafe(name)) {
    console.warn(`[DENIED] Rating access: ${name}`);
    return res.status(403).json({ error: 'Access denied' });
  }
 
  const ratings = loadRatings();
  const key = ratingKeyFromNameSize(name, size);
  ratings[key] = rating;
  saveRatings(ratings);
  res.json({ success: true });
});

// Delete a video (path can include subdirs)
app.delete('/api/videos/*', (req, res) => {
  const name = req.params[0];
  if (!name || !isPathSafe(name)) {
    console.warn(`[DENIED] Delete access: ${name}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(VIDEO_DIR, name);
  try {
    fs.unlinkSync(filePath);
    console.log(`[DELETE] ${name} deleted by ${req.ip}`);
    const ratings = loadRatings();
    delete ratings[name];
    saveRatings(ratings);
    res.json({ success: true });
  } catch (err) {
    console.error(`[ERROR] Failed to delete ${name}: ${err}`);
    res.status(err.code === 'ENOENT' ? 404 : 500).json({ error: 'Failed to delete' });
  }
});

// Stream video with HTTP Range support (path can include subdirs)
app.get('/api/stream/*', (req, res) => {
  const name = req.params[0];
  if (!name || !isPathSafe(name)) {
    console.warn(`[DENIED] Stream access: ${name}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(VIDEO_DIR, name);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    console.warn(`[NOT FOUND] Stream file: ${filePath}`);
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

  console.log(`[STREAM] ${name} (${fileSize} bytes) to ${req.ip}`);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1]
      ? parseInt(parts[1], 10)
      : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

    if (start >= fileSize) {
      console.warn(`[RANGE ERROR] ${name} start ${start} >= fileSize ${fileSize}`);
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
