# Stream Videos

Stream Videos is a simple, fast, and user-friendly web application for streaming video files directly from your local disk to any device on your local network. It is ideal for watching videos on mobile devices, tablets, or VR headsets like Oculus Quest.

## Features

- **Local Video Streaming**: Play videos stored on your PC directly in your browser.
- **Network Access**: Accessible from any device on your local Wi-Fi (phone, tablet, VR headset, etc.).
- **Folder Navigation**: Browse folders and subfolders to organize your video library.
- **Video Ratings**: Rate videos from -1 (black star) to +5 (yellow stars) for easy sorting and review.
- **Sorting & Search**: Sort videos by name, size, rating, or modification date. Search videos by name.
- **Grid & List View**: Adjust zoom/grid for comfortable browsing.
- **Recently Played Highlight**: See your last 5 played videos highlighted for quick access.
- **Delete Videos**: Permanently delete unwanted videos from the interface.
- **VR Friendly**: Optimized for Oculus Quest browser and other mobile devices.

## Usage

1. **Install Node.js** (if not already installed):
   - Download from [nodejs.org](https://nodejs.org/)

2. **Place your videos** in a folder (e.g., `videos/`). Supported formats: `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.m4v`.

3. **Start the server**:
   - Open a terminal in the project directory.
   - Run:
     ```
     node server.js <video-folder-path>
     ```
     Example:
     ```
     node server.js videos
     ```
   - If no folder is specified, defaults to `videos/` in the project directory.

4. **Open the app**:
   - On your PC: Go to [http://localhost:3000](http://localhost:3000)
   - On other devices (phone, tablet, VR):
     - Find your PC's IP address (e.g., `192.168.1.100`).
     - Open [http://<your-pc-ip>:3000](http://<your-pc-ip>:3000) in the browser.

## Screenshots
<img width="997" height="442" alt="image" src="https://github.com/user-attachments/assets/d5994fa8-e49d-4842-b167-14dd02eb33db" />

## How It Works

- The server scans your video folder and exposes a web interface for browsing and streaming.
- Videos are streamed with HTTP Range support for smooth playback, even for large files.
- Ratings are stored locally in `ratings.json`.
- All actions (rating, delete) are performed securely and only within the specified video folder.

## Security

- Only files within the specified video directory are accessible.
- No external access or uploads are allowed.
- Deletion and rating actions are protected against path traversal.

## Requirements

- Node.js (v14+ recommended)
- Modern browser (Chrome, Firefox, Edge, Safari, Oculus Quest browser)


## Troubleshooting

- **Cannot access from other devices**
  - Ensure your PC and device are on the same Wi-Fi network.
  - Check firewall settings to allow incoming connections on port 3000.
