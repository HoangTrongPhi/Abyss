/**
 * Who made Abyss and how to reach them, shown in the About & contact dialog (rail). Same author
 * card as in Poseidon; the texts that change with the language come from `i18n` (`about`).
 * Empty fields are hidden; links open in the default browser / mail app.
 */
export type AuthorLinkKind = "linkedin" | "artstation" | "github" | "youtube" | "facebook" | "web" | "cv";

export interface AuthorLink {
  label: string;
  /** `https://…` or `mailto:…` only. */
  url: string;
  kind: AuthorLinkKind;
}

export interface Highlight {
  title: string;
  studio: string;
  years: string;
}

export const AUTHOR = {
  name: "Hoàng Trọng Phi",
  /** Shown in the avatar; the name's first letters by default. */
  handle: "Phineas",
  role: "3D Technical Artist",
  website: "https://huang-fei-room-porfolio.vercel.app/",
  email: "",
  skills: ["Unreal", "Unity", "Meta Horizon", "Cocos", "Web 3D", "VR/XR", "Optimization"],
  highlights: [
    { title: "Lies of P", studio: "Neowiz / Round8 Studio", years: "2021 – 2023" },
    { title: "Caliverse", studio: "Lotte", years: "2021 – 2023" },
    { title: "Net Surfer, Oblique BeatSaber", studio: "Meta Horizon Worlds", years: "2026" },
  ] as Highlight[],
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/hoangtrongphi2511/", kind: "linkedin" },
    { label: "ArtStation", url: "https://www.artstation.com/hoangphi", kind: "artstation" },
    { label: "GitHub", url: "https://github.com/HoangTrongPhi", kind: "github" },
    { label: "YouTube", url: "https://www.youtube.com/@phihoang1825/videos", kind: "youtube" },
    { label: "Facebook", url: "https://www.facebook.com/phi.hoang.568294/", kind: "facebook" },
  ] as AuthorLink[],
  cv: "https://drive.google.com/file/d/1ew7p4o9LU8ICZqbRo4OMR2Ul2i61Cpie/view?usp=drive_link",
};
