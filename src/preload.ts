import ffmpegPath from "ffmpeg-static";

// Set FFMPEG_PATH globally BEFORE any other modules (like discord.js or prism-media) load
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}
