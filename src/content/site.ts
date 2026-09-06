export type Language = "en" | "es";

export const identity = {
  name: "Jesús Rubio Sainz",
  role: "Cloud Solution Architect, AI & Apps",
  organization: "Microsoft",
  linkedin: "https://www.linkedin.com/in/jrubiosainz/",
  github: "https://github.com/jrubiosainz",
  site: "https://jrubiosainz.github.io",
};

export const en = {
  metaTitle: "Jesús Rubio Sainz — Beyond the interface",
  metaDescription: "Jesús Rubio Sainz. Cloud Solution Architect, AI & Apps at Microsoft. Professional profile and public updates on LinkedIn.",
  skip: "Skip to content",
  role: "Cloud Solution Architect",
  discipline: "AI & Apps at Microsoft",
  hero: "BEYOND THE\nINTERFACE.",
  lead: "Human perspective.\nTechnological possibility.",
  linkedin: "My professional story, on LinkedIn",
  language: "Change language",
  independent: "Personal website. Views are my own.",
};
export const es: typeof en = {
  metaTitle: "Jesús Rubio Sainz — Más allá de la interfaz",
  metaDescription: "Jesús Rubio Sainz. Arquitecto de Soluciones Cloud, IA y Aplicaciones en Microsoft. Perfil profesional y publicaciones en LinkedIn.",
  skip: "Saltar al contenido",
  role: "Arquitecto de Soluciones Cloud",
  discipline: "IA y Aplicaciones en Microsoft",
  hero: "MÁS ALLÁ DE\nLA INTERFAZ.",
  lead: "Perspectiva humana.\nPosibilidad tecnológica.",
  linkedin: "Mi trayectoria profesional, en LinkedIn",
  language: "Cambiar idioma",
  independent: "Web personal. Mis opiniones son propias.",
};
export const copy = { en, es };
