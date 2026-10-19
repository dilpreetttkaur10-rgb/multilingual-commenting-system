
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SavedProgress = {
  currentTime: number;
  duration: number;
  completed: boolean;
};

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoUrl =
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
  const storageKey = `video-progress:${videoUrl}`;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [savedTime, setSavedTime] = useState(0);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time < 0) return "0:00";

    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        seconds
      ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const saveProgress = useCallback(
    (time: number, total: number, isCompleted = false) => {
      if (!Number.isFinite(time) || !Number.isFinite(total) || total <= 0) {
        return;
      }

      const progress: SavedProgress = {
        currentTime: isCompleted ? 0 : Math.max(0, Math.min(time, total)),
        duration: total,
        completed: isCompleted,
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(progress));
      } catch {
        setError("Progress could not be saved in this browser.");
      }
    },
    [storageKey]
  );

  const restoreProgress = (video: HTMLVideoElement) => {
    if (restoredRef.current || !Number.isFinite(video.duration)) return;

    restoredRef.current = true;
    setDuration(video.duration);

    try {
      const raw = localStorage.getItem(storageKey);

      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedProgress>;

        if (
          typeof saved.currentTime === "number" &&
          Number.isFinite(saved.currentTime) &&
          saved.currentTime > 0 &&
          saved.currentTime < video.duration &&
          saved.completed !== true
        ) {
          setSavedTime(saved.currentTime);
          setResumeAvailable(true);
        } else if (saved.completed === true) {
          setCompleted(true);
        }
      }
    } catch {
      setError("Previously saved progress could not be read.");
    }

    setProgressReady(true);
  };

  const resumeVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.min(
      savedTime,
      Math.max(0, video.duration - 0.1)
    );
    setCurrentTime(video.currentTime);
    setResumeAvailable(false);
    setCompleted(false);
    playerRef.current?.focus();
  };

  const startFromBeginning = () => {
    const video = videoRef.current;

    if (video) {
      video.currentTime = 0;
      setCurrentTime(0);
    }

    setResumeAvailable(false);
    setCompleted(false);
    setCountdown(null);
    saveProgress(0, duration);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }

      setError("");
    } catch {
      setError("Could not play the video. Check your internet connection.");
    }
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const limit = Number.isFinite(video.duration) ? video.duration : 0;

    video.currentTime = Math.max(
      0,
      Math.min(video.currentTime + seconds, limit)
    );

    setCurrentTime(video.currentTime);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const player = playerRef.current;
    if (!player) return;

    try {
      if (!document.fullscreenElement) {
        await player.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setError("Fullscreen is not available.");
    }
  };

  const replayVideo = async () => {
    const video = videoRef.current;
    if (!video) return;

    setCountdown(null);
    setError("");
    setCompleted(false);
    setResumeAvailable(false);

    video.currentTime = 0;
    setCurrentTime(0);
    saveProgress(0, video.duration);

    try {
      await video.play();
    } catch {
      setError("Could not replay the video. Press Play to try again.");
    }
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    setError("");
    setCountdown(null);

    if (video.error) {
      video.load();
    }

    if (Number.isFinite(video.duration) && video.duration > 0) {
      setCurrentTime(video.currentTime);
    }
  };

  const showControls = () => {
    setControlsVisible(true);

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (playing && countdown === null) {
      hideControlsTimer.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  };

  // Save progress after the playhead stops changing, and on pause.
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (progressReady && duration > 0 && !completed) {
        saveProgress(currentTime, duration);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentTime, duration, completed, progressReady, saveProgress]);

  // Automatically replay five seconds after the video ends.
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      void replayVideo();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((previous) =>
        previous === null ? null : previous - 1
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    const updateFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", updateFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  // Keyboard shortcuts: Space, Left, Right, M and F.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }

      if (
        playerRef.current &&
        !playerRef.current.contains(document.activeElement) &&
        document.activeElement !== document.body
      ) {
        return;
      }

      switch (event.code) {
        case "Space":
          event.preventDefault();
          void togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
          event.preventDefault();
          seekBy(10);
          break;
        case "KeyM":
          event.preventDefault();
          toggleMute();
          break;
        case "KeyF":
          event.preventDefault();
          void toggleFullscreen();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const percentage =
    duration > 0
      ? Math.min(100, Math.round((currentTime / duration) * 100))
      : 0;

  return (
    <div
      ref={playerRef}
      tabIndex={0}
      onMouseMove={showControls}
      onTouchStart={showControls}
      aria-label="Custom video player. Focus the player to use keyboard shortcuts."
      className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-800 bg-black text-white shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="aspect-video w-full bg-black object-contain"
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => restoreProgress(event.currentTarget)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          setPlaying(true);
          setResumeAvailable(false);
          showControls();
        }}
        onPause={(event) => {
          setPlaying(false);

          if (progressReady && event.currentTarget.duration > 0 && !completed) {
            saveProgress(
              event.currentTarget.currentTime,
              event.currentTarget.duration
            );
          }

          setControlsVisible(true);
        }}
        onEnded={(event) => {
          setPlaying(false);
          setCurrentTime(event.currentTarget.duration);
          setCompleted(true);
          setResumeAvailable(false);
          setCountdown(5);

          saveProgress(
            event.currentTarget.duration,
            event.currentTarget.duration,
            true
          );
        }}
        onError={() => {
          setError("Video failed to load. Check your internet connection.");
        }}
      />

      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold">Replay video?</h2>
            <p className="mt-2 text-gray-300">
              Playing again in {countdown} second
              {countdown === 1 ? "" : "s"}.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void replayVideo()}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold hover:bg-red-700"
              >
                Replay now
              </button>
              <button
                type="button"
                onClick={() => setCountdown(null)}
                className="rounded-lg bg-gray-700 px-4 py-2 hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={retryVideo}
            className="rounded-lg bg-red-700 px-3 py-2 font-semibold hover:bg-red-600"
          >
            Retry video
          </button>
        </div>
      )}

      {resumeAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-sm text-gray-200">
            Resume from {formatTime(savedTime)}?
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resumeVideo}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-700"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={startFromBeginning}
              className="rounded-lg bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      <div
        className={`space-y-4 bg-gradient-to-b from-gray-900 to-gray-950 p-3 transition-opacity sm:p-5 ${
          controlsVisible || !playing ? "opacity-100" : "opacity-70"
        }`}
      >
        <div className="space-y-2">
          <div className="relative">
            <input
              aria-label="Video progress"
              title="Seek through video"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => {
                const time = Number(event.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = time;
                }
                setCurrentTime(time);
              }}
              onMouseMove={(event) => {
                if (!duration) return;

                const rect = event.currentTarget.getBoundingClientRect();
                const position = Math.max(
                  0,
                  Math.min(1, (event.clientX - rect.left) / rect.width)
                );

                setHoverPosition(position * 100);
                setHoverTime(position * duration);
              }}
              onMouseLeave={() => setHoverTime(null)}
              className="h-2 w-full cursor-pointer accent-red-500"
            />

            {hoverTime !== null && (
              <span
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black px-2 py-1 text-xs"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </span>
            )}
          </div>

          <div className="flex justify-between text-xs text-gray-400 sm:text-sm">
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <span>{percentage}% watched</span>
          </div>

          <div
            className="h-1.5 overflow-hidden rounded-full bg-gray-700"
            role="progressbar"
            aria-label="Video completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <div
              className="h-full rounded-full bg-red-500 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {completed && countdown === null && (
            <p className="text-sm font-medium text-green-400">
              Video completed! You can replay it from the beginning.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={playing ? "Pause video" : "Play video"}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>

          <button
            type="button"
            onClick={() => seekBy(-10)}
            aria-label="Rewind 10 seconds"
            title="Rewind 10 seconds (Left Arrow)"
            className="rounded-lg bg-gray-800 px-3 py-2.5 text-sm hover:bg-gray-700"
          >
            ↶ 10s
          </button>

          <button
            type="button"
            onClick={() => seekBy(10)}
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds (Right Arrow)"
            className="rounded-lg bg-gray-800 px-3 py-2.5 text-sm hover:bg-gray-700"
          >
            10s ↷
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute video" : "Mute video"}
              className="rounded-lg px-2 py-2 hover:bg-gray-800"
            >
              {muted ? "🔇" : "🔊"}
            </button>

            <input
              aria-label="Volume"
              title="Adjust volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                const video = videoRef.current;

                if (video) {
                  video.volume = nextVolume;
                  video.muted = nextVolume === 0;
                }

                setVolume(nextVolume);
                setMuted(nextVolume === 0);
              }}
              className="w-16 cursor-pointer accent-red-500 sm:w-24"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span>Speed</span>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(event) => {
                const nextSpeed = Number(event.target.value);

                if (videoRef.current) {
                  videoRef.current.playbackRate = nextSpeed;
                }

                setSpeed(nextSpeed);
              }}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-white outline-none focus:border-red-500"
            >
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="ml-auto rounded-lg bg-gray-800 px-3 py-2.5 text-sm hover:bg-gray-700"
          >
            {fullscreen ? "⊙ Exit" : "⛶ Fullscreen"}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-800 pt-3 text-xs text-gray-400">
          <span>
            <kbd className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-200">
              Space
            </kbd>{" "}
            Play/Pause
          </span>
          <span>
            <kbd className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-200">
              ←
            </kbd>{" "}
            Back 10s
          </span>
          <span>
            <kbd className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-200">
              →
            </kbd>{" "}
            Forward 10s
          </span>
          <span>
            <kbd className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-200">
              M
            </kbd>{" "}
            Mute
          </span>
          <span>
            <kbd className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-200">
              F
            </kbd>{" "}
            Fullscreen
          </span>
        </div>
      </div>
    </div>
  );
}
