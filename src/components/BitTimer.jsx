import { createSignal, createEffect, onCleanup } from "solid-js";
import NoSleep from "nosleep.js";

export default function BitTimer() {
    const [workTime, setWorkTime] = createSignal(30);
    const [restTime, setRestTime] = createSignal(10);
    const [repeats, setRepeats] = createSignal(22);

    const [isRunning, setIsRunning] = createSignal(false);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [phase, setPhase] = createSignal("stopped"); // 'stopped', 'warmup', 'work', 'rest', 'finished'
    const [currentRound, setCurrentRound] = createSignal(1);

    let intervalId;
    let audioContext;
    let workAudio, countdownAudio, completionAudio;
    let noSleep;

    // Create audio buffers programmatically for iOS silent mode compatibility
    const createAudioBuffer = (frequency, duration, sampleRate = 44100) => {
        const length = sampleRate * (duration / 1000);
        const buffer = audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            data[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * Math.exp(-t * 3);
        }

        return buffer;
    };

    // Initialize audio with iOS silent mode support
    const initAudio = async () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        // Create HTML5 Audio elements with data URLs for iOS compatibility
        workAudio = new Audio();
        countdownAudio = new Audio();
        completionAudio = new Audio();

        // Set preload and loop properties
        [workAudio, countdownAudio, completionAudio].forEach((audio) => {
            audio.preload = "auto";
            audio.volume = 0.4;
        });

        // Create short silent audio data URL (iOS requires actual audio data)
        const createBeepDataURL = (freq, duration) => {
            const sampleRate = 22050;
            const samples = Math.floor(sampleRate * (duration / 1000));
            const buffer = new ArrayBuffer(44 + samples * 2);
            const view = new DataView(buffer);

            // WAV header
            const writeString = (offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };

            writeString(0, "RIFF");
            view.setUint32(4, 36 + samples * 2, true);
            writeString(8, "WAVE");
            writeString(12, "fmt ");
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(36, "data");
            view.setUint32(40, samples * 2, true);

            // Generate beep
            for (let i = 0; i < samples; i++) {
                const t = i / sampleRate;
                const sample = Math.sin(2 * Math.PI * freq * t) * 0.3 * Math.exp(-t * 3);
                view.setInt16(44 + i * 2, sample * 32767, true);
            }

            const blob = new Blob([buffer], { type: "audio/wav" });
            return URL.createObjectURL(blob);
        };

        // Create audio data URLs
        workAudio.src = createBeepDataURL(1000, 300);
        countdownAudio.src = createBeepDataURL(600, 150);
        completionAudio.src = createBeepDataURL(800, 600);

        // Load the audio
        await Promise.all([
            new Promise((resolve) => {
                workAudio.oncanplaythrough = resolve;
                workAudio.load();
            }),
            new Promise((resolve) => {
                countdownAudio.oncanplaythrough = resolve;
                countdownAudio.load();
            }),
            new Promise((resolve) => {
                completionAudio.oncanplaythrough = resolve;
                completionAudio.load();
            }),
        ]);
    };

    // Initialize NoSleep.js
    const initNoSleep = () => {
        if (!noSleep) {
            noSleep = new NoSleep();
        }
    };

    const enableNoSleep = () => {
        try {
            if (noSleep) {
                noSleep.enable();
                console.log("NoSleep enabled");
            }
        } catch (err) {
            console.log("NoSleep enable failed:", err);
        }
    };

    const disableNoSleep = () => {
        try {
            if (noSleep && noSleep.isEnabled) {
                noSleep.disable();
                console.log("NoSleep disabled");
            }
        } catch (err) {
            console.log("NoSleep disable failed:", err);
        }
    };

    // Play sound functions
    const playWorkSound = () => {
        if (workAudio) {
            workAudio.currentTime = 0;
            workAudio.play().catch((e) => console.log("Audio play failed:", e));
        }
    };

    const playCountdownSound = () => {
        if (countdownAudio) {
            countdownAudio.currentTime = 0;
            countdownAudio.play().catch((e) => console.log("Audio play failed:", e));
        }
    };

    const playCompletionSound = () => {
        if (completionAudio) {
            completionAudio.currentTime = 0;
            completionAudio.play().catch((e) => console.log("Audio play failed:", e));
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const startTimer = async () => {
        if (isRunning()) return;

        await initAudio(); // Initialize audio on user interaction
        initNoSleep(); // Initialize NoSleep
        enableNoSleep(); // Prevent device from sleeping
        console.log("Starting timer...");
        setIsRunning(true);
        setPhase("warmup");
        setCurrentTime(10);
        setCurrentRound(1);

        intervalId = setInterval(() => {
            setCurrentTime((prev) => {
                const currentPhase = phase();

                // Play countdown sounds for warmup and rest phases
                if (
                    (currentPhase === "warmup" || currentPhase === "rest") &&
                    prev <= 3 &&
                    prev > 0
                ) {
                    playCountdownSound();
                }

                if (prev <= 0) {
                    const round = currentRound();

                    if (currentPhase === "warmup") {
                        setPhase("work");
                        playWorkSound(); // Start of work period
                        return workTime();
                    } else if (currentPhase === "work") {
                        playWorkSound(); // End of work period

                        // Check if this is the final round
                        if (round >= repeats()) {
                            setPhase("finished");
                            setIsRunning(false);
                            clearInterval(intervalId);
                            disableNoSleep(); // Allow device to sleep when finished
                            playCompletionSound(); // All rounds complete
                            return 0;
                        } else {
                            const newRound = round + 1;
                            setCurrentRound(newRound);
                            setPhase("rest");
                            return restTime();
                        }
                    } else if (currentPhase === "rest") {
                        setPhase("work");
                        playWorkSound(); // Start of new work period
                        return workTime();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopTimer = () => {
        setIsRunning(false);
        setPhase("stopped");
        setCurrentTime(0);
        setCurrentRound(1);
        clearInterval(intervalId);
        disableNoSleep(); // Allow device to sleep again
    };

    const resetTimer = () => {
        stopTimer();
    };

    onCleanup(() => {
        if (intervalId) clearInterval(intervalId);
        disableNoSleep(); // Clean up NoSleep on component unmount
    });

    const getPhaseColor = () => {
        switch (phase()) {
            case "warmup":
                return "text-yellow-400";
            case "work":
                return "text-green-400";
            case "rest":
                return "text-red-400";
            case "finished":
                return "text-blue-400";
            default:
                return "text-zinc-400";
        }
    };

    const getPhaseLabel = () => {
        switch (phase()) {
            case "warmup":
                return "WARM UP";
            case "work":
                return "WORK";
            case "rest":
                return "REST";
            case "finished":
                return "FINISHED";
            default:
                return "READY";
        }
    };

    return (
        <div class="min-h-screen bg-zinc-900 text-white p-6">
            <div class="max-w-md mx-auto">
                <h1 class="text-3xl font-bold text-center mb-8 text-zinc-100">BitTimer</h1>

                <div class="bg-zinc-800 rounded-lg p-6 mb-6">
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div>
                            <label class="block text-sm font-medium text-zinc-300 mb-2">
                                Work (sec)
                            </label>
                            <input
                                type="number"
                                value={workTime()}
                                onInput={(e) => setWorkTime(parseInt(e.target.value) || 0)}
                                disabled={isRunning()}
                                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
                                min="1"
                                max="300"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-zinc-300 mb-2">
                                Rest (sec)
                            </label>
                            <input
                                type="number"
                                value={restTime()}
                                onInput={(e) => setRestTime(parseInt(e.target.value) || 0)}
                                disabled={isRunning()}
                                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
                                min="1"
                                max="180"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-zinc-300 mb-2">
                                Rounds
                            </label>
                            <input
                                type="number"
                                value={repeats()}
                                onInput={(e) => setRepeats(parseInt(e.target.value) || 0)}
                                disabled={isRunning()}
                                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
                                min="1"
                                max="20"
                            />
                        </div>
                    </div>
                </div>

                <div class="bg-zinc-800 rounded-lg p-8 mb-6 text-center">
                    <div class={`text-sm font-semibold mb-2 ${getPhaseColor()}`}>
                        {getPhaseLabel()}
                    </div>
                    <div class="text-6xl font-mono font-bold mb-4 text-zinc-100">
                        {formatTime(currentTime())}
                    </div>
                    <div class="text-zinc-400">
                        Round {currentRound()} of {repeats()}
                    </div>
                </div>

                <div class="flex gap-4">
                    <button
                        onClick={() => {
                            console.log("Button clicked!");
                            startTimer();
                        }}
                        disabled={isRunning()}
                        class="flex-1 py-3 px-6 bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                    >
                        Start
                    </button>
                    <button
                        onClick={resetTimer}
                        class="flex-1 py-3 px-6 bg-zinc-600 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors"
                    >
                        Reset
                    </button>
                </div>

                <div class="mt-8 text-center">
                    <div class="text-xs text-zinc-500">v5</div>
                </div>
            </div>
        </div>
    );
}
