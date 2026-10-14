import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Resolve Tailwind's actual CSS tokens, including the browser's OKLCH conversion.
function cssColor(element: HTMLElement, property: string) {
    const context = document.createElement('canvas').getContext('2d')!;
    context.fillStyle = getComputedStyle(element).getPropertyValue(property).trim();
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return new THREE.Vector3(r / 255, g / 255, b / 255);
}

export async function mountShipHologram(host: HTMLElement) {
    let disposed = false;
    let frame = 0;
    let visible = true;
    let elapsed = 0;
    let last = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let composer: EffectComposer | undefined;
    let geometry: THREE.BufferGeometry | undefined;
    let material: THREE.ShaderMaterial | undefined;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const group = new THREE.Group();
    scene.add(group);
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;

    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        document.removeEventListener('visibilitychange', resume);
        document.removeEventListener('astro:before-swap', cleanup);
        motion.removeEventListener('change', resume);
        geometry?.dispose();
        material?.dispose();
        composer?.passes.forEach(pass => pass.dispose());
        composer?.dispose();
        renderer?.dispose();
        renderer?.domElement.remove();
    };
    const resume = () => {
        cancelAnimationFrame(frame);
        last = 0;
        if (!disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
        if (disposed || !material || !composer) return;
        if (last && !motion.matches) elapsed += Math.min((now - last) / 1000, 0.05);
        last = now;
        material.uniforms.time.value = motion.matches ? 0 : elapsed;
        material.uniforms.motion.value = motion.matches ? 0 : 1;
        group.rotation.set(0.16 - THREE.MathUtils.degToRad(5), 1.1 + (motion.matches ? 0 : Math.sin(elapsed * 0.22) * 0.07), 0.08);
        group.position.y = motion.matches ? 0 : Math.sin(elapsed * 0.65) * 0.035;
        finish.uniforms.time.value = motion.matches ? 0 : elapsed;
        composer.render();
        if (!motion.matches && visible && !document.hidden) frame = requestAnimationFrame(render);
    };
    const finish = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, time: { value: 0 }, rose: { value: cssColor(host, '--color-rose-500') } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec3 rose; varying vec2 vUv;
            void main() {
                float light = texture2D(tDiffuse, vUv).r;
                float grain = fract(sin(dot(gl_FragCoord.xy + floor(time * 24.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
                // Feather the bloom to fully transparent before it reaches the canvas boundary.
                vec2 edge = min(vUv, 1.0 - vUv);
                float feather = smoothstep(0.0, 0.16, edge.x) * smoothstep(0.0, 0.16, edge.y);
                float coverage = (1.0 - exp(-light * 5.0)) * smoothstep(0.0, 0.012, light) * feather;
                vec3 color = rose;
                color += (grain * 0.045 + max(light - 1.3, 0.0) * 0.025) * coverage;
                gl_FragColor = vec4(color, coverage);
            }`,
    });
    try {
        renderer = new THREE.WebGLRenderer({ alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
        renderer.setClearColor(0x000000, 0);
        host.append(renderer.domElement);
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.2, 0.65));
        composer.addPass(finish);
        document.addEventListener('astro:before-swap', cleanup, { once: true });
        const gltf = await new GLTFLoader().loadAsync('/models/spaceship.gltf');
        gltf.scene.updateMatrixWorld(true);
        const parts: THREE.BufferGeometry[] = [];
        gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const part = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
            for (const name of Object.keys(part.attributes)) if (name !== 'position') part.deleteAttribute(name);
            part.morphAttributes = {};
            part.morphTargetsRelative = false;
            part.applyMatrix4(object.matrixWorld);
            parts.push(part);
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(item => item.dispose());
        });
        if (disposed) { parts.forEach(part => part.dispose()); return cleanup; }
        const surface = mergeGeometries(parts)!;
        parts.forEach(part => part.dispose());
        surface.computeBoundingBox();
        const size = surface.boundingBox!.getSize(new THREE.Vector3());
        surface.center();
        const scale = 3.7 / Math.max(size.x, size.y, size.z);
        surface.scale(scale, scale, scale);
        // The supplied ship's longitudinal axis is Z. Keep that coordinate for the sweep.
        const length = size.z * scale;
        const surfaceMaterial = new THREE.MeshBasicMaterial();
        const sampler = new MeshSurfaceSampler(new THREE.Mesh(surface, surfaceMaterial)).build();
        const count = matchMedia('(max-width: 639px)').matches ? 14000 : 24000;
        const positions = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        const point = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
            sampler.sample(point);
            point.toArray(positions, i * 3);
            seeds[i] = Math.random();
        }
        surface.dispose();
        surfaceMaterial.dispose();
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
        material = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, motion: { value: 1 }, length: { value: length }, pixelRatio: { value: renderer.getPixelRatio() } },
            vertexShader: `uniform float time, motion, length, pixelRatio; attribute float seed; varying float brightness;
                void main() {
                    float phase = mod(time, 5.5);
                    float front = mix(length * 0.7, -length * 0.7, clamp(phase / 2.0, 0.0, 1.0));
                    float wave = exp(-pow((position.z - front) / (length * 0.095), 2.0)) * motion;
                    // Z is the source model's longitudinal axis: expand only its cross-section.
                    // After the display rotation this corresponds to displacement in Y/Z, not X.
                    vec3 displaced = vec3(position.xy * (1.0 + 0.08 * wave), position.z);
                    vec4 view = modelViewMatrix * vec4(displaced, 1.0);
                    gl_Position = projectionMatrix * view;
                    gl_PointSize = clamp((1.2 + seed * 0.75) * pixelRatio * 6.0 / -view.z, 1.0, 4.0 * pixelRatio);
                    brightness = 0.45 + seed * 0.45 + wave * 0.25;
                }`,
            fragmentShader: `varying float brightness;
                void main() { float radius = length(gl_PointCoord - 0.5); if (radius > 0.5) discard;
                    float glow = exp(-radius * radius * 13.0); gl_FragColor = vec4(vec3(brightness * glow), glow * 0.8); }`,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const points = new THREE.Points(geometry, material);
        // Turn the long ship across the hero rather than aiming its nose at the viewer.
        points.rotation.y = -Math.PI / 2;
        group.add(points);
        const resize = () => {
            const width = host.clientWidth, height = host.clientHeight;
            if (!width || !height || disposed) return;
            camera.aspect = width / height;
            camera.position.set(0, 1.6, Math.max(5.8, 4.1 / camera.aspect));
            camera.lookAt(0, 0, 0);
            camera.clearViewOffset();
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
            // Frame the visible silhouette, rather than the unrotated model's origin.
            // Use the resting pose so the subtle hover can still move around this center.
            group.rotation.set(0.16 - THREE.MathUtils.degToRad(5), 1.1, 0.08);
            group.position.y = 0;
            scene.updateMatrixWorld(true);
            let bottom = Infinity, top = -Infinity;
            for (let i = 0; i < count; i++) {
                point.fromBufferAttribute(geometry!.getAttribute('position'), i)
                    .applyMatrix4(points.matrixWorld).project(camera);
                bottom = Math.min(bottom, point.y);
                top = Math.max(top, point.y);
            }
            camera.setViewOffset(width, height, 0, -(top + bottom) * height / 4, width, height);
            renderer!.setSize(width, height);
            composer!.setSize(width, height);
            resume();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
        intersectionObserver.observe(host);
        document.addEventListener('visibilitychange', resume);
        motion.addEventListener('change', resume);
        host.dataset.ready = '';
        resize();
    } catch (error) {
        console.warn('Ship hologram could not load; keeping the decorative fallback.', error);
        cleanup();
        delete host.dataset.ready;
    }
    return cleanup;
}
