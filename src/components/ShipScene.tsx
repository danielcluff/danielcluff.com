import { onCleanup, onMount } from 'solid-js';

export default function ShipScene() {
    let host!: HTMLDivElement;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    onMount(() => {
        // Keep Three.js and its addons out of the island's initial hydration bundle.
        void import('../scripts/ship-hologram').then(async ({ mountShipHologram }) => {
            if (disposed) return;
            const disposeScene = await mountShipHologram(host);
            if (disposed) disposeScene();
            else cleanup = disposeScene;
        }).catch(error => console.warn('Unable to load ship scene.', error));
    });
    onCleanup(() => {
        disposed = true;
        cleanup?.();
    });

    return <div class="ship-scene" ref={host}><span class="fallback">✳</span></div>;
}
