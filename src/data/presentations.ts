import { slides } from "../components/presentations/hosting-at-home/deck";

export type Presentation = {
    slug: string;
    title: string;
    description: string;
    details: string;
    accent: string;
    preview: string;
};

export const presentations: Presentation[] = [
    {
        slug: "hosting-at-home",
        title: "Hosting @home",
        description: "How to host public websites with hardware you have at home.",
        details:
            "A practical tour of the tools, network edge, and hardening steps behind a self-hosted homelab.",
        accent: "#ea580c",
        preview: slides[0].path,
    },
];
