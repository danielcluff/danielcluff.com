export type Slide = {
    path: string;
    title: string;
};

export const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const presentationBase = withBase("/presentations/hosting-at-home");

export function withBase(path: string) {
    if (!path.startsWith("/")) return path;
    return `${baseUrl}${path}` || "/";
}

export const slides: Slide[] = [
    { path: `${presentationBase}/intro`, title: "Introduction" },
    { path: `${presentationBase}/author`, title: "About the Author" },
    { path: `${presentationBase}/overview`, title: "Overview" },
    { path: `${presentationBase}/why`, title: "Why?" },
    { path: `${presentationBase}/hardware`, title: "Hardware" },
    { path: `${presentationBase}/the-old-way`, title: "The Old Way" },
    { path: `${presentationBase}/cloudflare`, title: "Cloudflare" },
    { path: `${presentationBase}/getting-started`, title: "Getting Started" },
    { path: `${presentationBase}/server-hardening`, title: "Hardening" },
    { path: `${presentationBase}/cloudflare-hardening`, title: "Hardening part 2" },
    { path: `${presentationBase}/homelab`, title: "Kubernetes Homelab" },
    { path: `${presentationBase}/homelab-upgrade`, title: "Homelab Hardening" },
    { path: `${presentationBase}/homelab-plans`, title: "Future plans" },
    { path: `${presentationBase}/thank-you`, title: "Thanks" },
];

export function normalizePath(path: string) {
    const pathname = path.replace(/\/$/, "") || "/";
    return pathname;
}

export function getSlideIndex(path: string) {
    const pathname = normalizePath(path);
    return slides.findIndex((s) => s.path === pathname);
}

export function getSlideNav(currentPath: string) {
    const index = getSlideIndex(currentPath);
    return {
        index,
        total: slides.length,
        prev: index > 0 ? slides[index - 1] : null,
        next: index >= 0 && index < slides.length - 1 ? slides[index + 1] : null,
        current: index >= 0 ? slides[index] : null,
    };
}
