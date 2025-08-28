import { createSignal, createEffect, onCleanup } from "solid-js";

export default function BitTimer() {
    const [workTime, setWorkTime] = createSignal(30);
    const [restTime, setRestTime] = createSignal(5);
    const [repeats, setRepeats] = createSignal(12);

    const [isRunning, setIsRunning] = createSignal(false);
    const [currentTime, setCurrentTime] = createSignal(0);
    const [phase, setPhase] = createSignal("stopped"); // 'stopped', 'warmup', 'work', 'rest', 'finished'
    const [currentRound, setCurrentRound] = createSignal(0);

    let intervalId;

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const startTimer = () => {
        if (isRunning()) return;

        console.log("Starting timer...");
        setIsRunning(true);
        setPhase("warmup");
        setCurrentTime(10);
        setCurrentRound(1);

        intervalId = setInterval(() => {
            setCurrentTime((prev) => {
                if (prev <= 0) {
                    const currentPhase = phase();
                    const round = currentRound();

                    if (currentPhase === "warmup") {
                        setPhase("work");
                        return workTime();
                    } else if (currentPhase === "work") {
                        setPhase("rest");
                        return restTime();
                    } else if (currentPhase === "rest") {
                        const newRound = round + 1;
                        setCurrentRound(newRound);

                        if (newRound >= repeats()) {
                            setPhase("finished");
                            setIsRunning(false);
                            clearInterval(intervalId);
                            return 0;
                        } else {
                            setPhase("work");
                            return workTime();
                        }
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
        setCurrentRound(0);
        clearInterval(intervalId);
    };

    const resetTimer = () => {
        stopTimer();
    };

    onCleanup(() => {
        if (intervalId) clearInterval(intervalId);
    });

    const getPhaseColor = () => {
        switch (phase()) {
            case "warmup":
                return "text-yellow-400";
            case "work":
                return "text-red-400";
            case "rest":
                return "text-green-400";
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
                    <div class="text-xs text-zinc-500">v4</div>
                </div>
            </div>
        </div>
    );
}
