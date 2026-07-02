import { logger } from "./logger.js";

const antiSpamLogger = logger.child("AntiSpam");

interface UserRequestTrack {
  timestamps: number[];
  cooldownUntil: number;
  warned: boolean;
}

class AntiSpamManager {
  private userTracks = new Map<string, UserRequestTrack>();

  // Configuration thresholds
  private readonly MAX_REQUESTS = 3;    // Maximum allowed requests in window
  private readonly WINDOW_MS = 10000;     // Window size (10 seconds)
  private readonly COOLDOWN_MS = 30000;   // Cooldown duration (30 seconds)

  /**
   * Checks if the message content consists only of spam/meaningless symbols.
   * e.g., dots, spaces, tildes, common punctuation.
   */
  isSpammyContent(content: string): boolean {
    const clean = content.replace(/<@!?\d+>/g, "").trim();
    if (!clean) return true;

    // Regex to match strings containing ONLY dots, spaces, tildes, punctuation, tildes, emoji patterns, hyphens, brackets, etc.
    const isPunctuationOnly = /^[.\s~!?\-_*#`@()[\]{}|:;=+\\%/<>^]+$/.test(clean);
    return isPunctuationOnly;
  }

  /**
   * Tracks user request times and determines if they are rate-limited.
   * Returns:
   * - 'allowed': The message can be processed.
   * - 'warn': The user just triggered cooldown; should send a warning.
   * - 'ignored': The user is already in cooldown and should be ignored silently.
   */
  checkRateLimit(userId: string): 'allowed' | 'warn' | 'ignored' {
    const now = Date.now();
    let track = this.userTracks.get(userId);

    if (!track) {
      track = { timestamps: [], cooldownUntil: 0, warned: false };
      this.userTracks.set(userId, track);
    }

    // Check if the user is currently in cooldown
    if (now < track.cooldownUntil) {
      if (!track.warned) {
        track.warned = true;
        return 'warn';
      }
      return 'ignored';
    }

    // Reset warning status if the cooldown has expired
    if (track.cooldownUntil > 0 && now >= track.cooldownUntil) {
      track.warned = false;
      track.cooldownUntil = 0;
    }

    // Filter timestamps to only keep those within the sliding window
    track.timestamps = track.timestamps.filter((ts) => now - ts < this.WINDOW_MS);

    // Record the current timestamp
    track.timestamps.push(now);

    // If the number of requests in the window exceeds the limit, trigger cooldown
    if (track.timestamps.length > this.MAX_REQUESTS) {
      track.cooldownUntil = now + this.COOLDOWN_MS;
      track.warned = true;
      antiSpamLogger.warn(`User ${userId} rate-limited. Cooldown until ${new Date(track.cooldownUntil).toISOString()}`);
      return 'warn';
    }

    return 'allowed';
  }
}

export const antiSpam = new AntiSpamManager();
