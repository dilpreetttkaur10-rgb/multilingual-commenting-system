
import VideoPlayer from "@/components/video/VideoPlayer";

export default function VideoDemoPage() {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wider text-red-600">
            Day 46 Project
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Customized HTML5 Video Player
          </h1>

          <p className="mt-2 text-gray-600">
            Test playback, seeking, volume, speed, and fullscreen controls.
          </p>
        </header>

        <VideoPlayer />

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Player Features</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-gray-700">
            <li>Play and pause</li>
            <li>Progress bar and timestamps</li>
            <li>Volume and mute</li>
            <li>Playback speed controls</li>
            <li>Fullscreen mode</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

