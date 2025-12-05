import { createSignal, createEffect, onCleanup } from "solid-js";
import NoSleep from "nosleep.js";

export default function StretchTimer() {
    // Initialize with default values (consistent between server and client)
    const [workTime, setWorkTime] = createSignal(30);
    const [restTime, setRestTime] = createSignal(15);
    const [repeats, setRepeats] = createSignal(12);

    // Load from localStorage after component mounts (client-side only)
    createEffect(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            const savedWorkTime = localStorage.getItem("stretchTimer_workTime");
            const savedRestTime = localStorage.getItem("stretchTimer_restTime");
            const savedRepeats = localStorage.getItem("stretchTimer_repeats");

            if (savedWorkTime) setWorkTime(parseInt(savedWorkTime));
            if (savedRestTime) setRestTime(parseInt(savedRestTime));
            if (savedRepeats) setRepeats(parseInt(savedRepeats));
        }
    });

    // Save to localStorage whenever values change
    createEffect(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem("stretchTimer_workTime", workTime().toString());
        }
    });

    createEffect(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem("stretchTimer_restTime", restTime().toString());
        }
    });

    createEffect(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem("stretchTimer_repeats", repeats().toString());
        }
    });

    const [isRunning, setIsRunning] = createSignal(false);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [phase, setPhase] = createSignal("stopped"); // 'stopped', 'warmup', 'work', 'rest', 'finished'
    const [currentRound, setCurrentRound] = createSignal(1);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let audioContext: AudioContext | undefined;
    let workBuffer: AudioBuffer | undefined,
        roundBuffer: AudioBuffer | undefined,
        countdownBuffer: AudioBuffer | undefined,
        completionBuffer: AudioBuffer | undefined;
    let noSleep: NoSleep | undefined;

    // Prevent navigation away while timer is running
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isRunning()) {
            e.preventDefault();
            e.returnValue = "Timer is running. Are you sure you want to leave?";
            return "Timer is running. Are you sure you want to leave?";
        }
    };

    // Add/remove beforeunload listener based on timer state
    createEffect(() => {
        if (typeof window !== "undefined") {
            if (isRunning()) {
                window.addEventListener("beforeunload", handleBeforeUnload);
            } else {
                window.removeEventListener("beforeunload", handleBeforeUnload);
            }
        }
    });

    // Fetch and decode audio file into an AudioBuffer
    const loadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext!.decodeAudioData(arrayBuffer);
    };

    // Initialize audio with Web Audio API for reliable mobile playback
    const initAudio = async () => {
        // Set audio session type to "playback" for iOS 17+ to enable audio on muted devices
        if (typeof navigator !== "undefined" && (navigator as any).audioSession) {
            try {
                (navigator as any).audioSession.type = "playback";
            } catch (error) {
                console.error("Failed to set audio session type:", error);
            }
        }

        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        // Load and decode all audio files into buffers for instant, reliable playback
        try {
            [workBuffer, roundBuffer, countdownBuffer, completionBuffer] = await Promise.all([
                loadAudioBuffer("/audio/start.mp3"),
                loadAudioBuffer("/audio/round.mp3"),
                loadAudioBuffer("/audio/countdown.mp3"),
                loadAudioBuffer("/audio/end.mp3"),
            ]);
        } catch (error) {
            throw error;
        }
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

    // Screen orientation functions
    const lockOrientation = () => {
        try {
            if (
                typeof window !== "undefined" &&
                window.screen &&
                screen.orientation &&
                (screen.orientation as any).lock
            ) {
                // Lock to current orientation
                const currentOrientation = screen.orientation.type;
                (screen.orientation as any).lock(currentOrientation);
                console.log("Screen orientation locked to:", currentOrientation);
            }
        } catch (err) {
            console.log("Orientation lock failed:", err);
        }
    };

    const unlockOrientation = () => {
        try {
            if (
                typeof window !== "undefined" &&
                window.screen &&
                screen.orientation &&
                screen.orientation.unlock
            ) {
                screen.orientation.unlock();
                console.log("Screen orientation unlocked");
            }
        } catch (err) {
            console.log("Orientation unlock failed:", err);
        }
    };

    // Play audio buffer with Web Audio API - creates a new source each time for reliable playback
    const playBuffer = (buffer: AudioBuffer | undefined, volume: number = 1.0) => {
        if (!audioContext || !buffer) {
            console.warn("Audio not ready");
            return;
        }

        try {
            // Ensure audio context is running (important for mobile)
            if (audioContext.state === "suspended") {
                audioContext.resume();
            }

            // Create a new source node for each play (allows overlapping sounds)
            const source = audioContext.createBufferSource();
            source.buffer = buffer;

            // Create gain node for volume control
            const gainNode = audioContext.createGain();
            gainNode.gain.value = volume;

            // Connect: source -> gain -> destination
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Start playback immediately
            source.start(0);
        } catch (error) {
            console.error("Audio playback error:", error);
        }
    };

    // Play sound functions with appropriate volumes
    const playWorkSound = () => playBuffer(workBuffer, 1.0);
    const playRoundSound = () => playBuffer(roundBuffer, 1.0);
    const playCountdownSound = () => playBuffer(countdownBuffer, 0.6);
    const playCompletionSound = () => playBuffer(completionBuffer, 1.0);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const calculateTotalDuration = () => {
        const totalWorkTime = workTime() * repeats();
        const totalRestTime = restTime() * (repeats() - 1); // One less rest than work periods
        const warmupTime = 10; // Fixed warmup duration
        return totalWorkTime + totalRestTime + warmupTime;
    };

    const startTimer = async () => {
        if (isRunning()) return;

        await initAudio(); // Initialize audio on user interaction
        initNoSleep(); // Initialize NoSleep
        enableNoSleep(); // Prevent device from sleeping
        lockOrientation(); // Lock screen orientation
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
                        // Check if this is the final round
                        if (round >= repeats()) {
                            setPhase("finished");
                            setIsRunning(false);
                            clearInterval(intervalId);
                            disableNoSleep(); // Allow device to sleep when finished
                            unlockOrientation(); // Unlock screen orientation
                            playCompletionSound(); // All rounds complete
                            return 0;
                        } else {
                            playRoundSound(); // End of work period
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
        unlockOrientation(); // Unlock screen orientation
    };

    const resetTimer = () => {
        stopTimer();
    };

    onCleanup(() => {
        if (intervalId) clearInterval(intervalId);
        disableNoSleep(); // Clean up NoSleep on component unmount
        unlockOrientation(); // Clean up orientation lock on component unmount
        if (typeof window !== "undefined") {
            window.removeEventListener("beforeunload", handleBeforeUnload); // Clean up event listener
        }
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
                <h1 class="text-3xl font-bold text-center mb-8 text-zinc-100">Stretch Timer</h1>

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
                        {!isRunning()
                            ? `Total duration: ${formatTime(calculateTotalDuration())}`
                            : `Round ${currentRound()} of ${repeats()}`}
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
                    <div class="text-xs text-zinc-500">v8</div>
                </div>
            </div>
        </div>
    );
}
