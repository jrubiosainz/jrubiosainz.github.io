export type Language = "en" | "es";

export const identity = {
  name: "Jesús Rubio Sainz",
  role: "Cloud Solution Architect, AI & Apps",
  organization: "Microsoft",
  linkedin: "https://www.linkedin.com/in/jrubiosainz/",
  github: "https://github.com/jrubiosainz",
  site: "https://jrubiosainz.github.io",
};

export interface LinkedInPublication {
  id: string;
  date: string;
  url: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
  kind: Record<Language, string>;
  tools: Record<Language, string>;
  image: {
    src: string;
    width: number;
    height: number;
    alt: Record<Language, string>;
  };
}

export const publications: LinkedInPublication[] = [
  {
    id: "maple-leaf",
    date: "2025-01-01",
    url: "https://www.linkedin.com/posts/jrubiosainz_projectodyssey-aimovie-mapleleaf-activity-7280313215169814528-p4FV",
    title: {
      en: "Maple Leaf.",
      es: "Maple Leaf.",
    },
    description: {
      en: "An original story, made into an AI short film. A 2024 creative project exploring the entire filmmaking process through generative video, voice and music.",
      es: "Una historia original convertida en cortometraje con IA. Un proyecto creativo de 2024 que explora todo el proceso cinematográfico con vídeo, voz y música generativos.",
    },
    kind: { en: "ORIGINAL AI SHORT FILM", es: "CORTOMETRAJE ORIGINAL CON IA" },
    tools: { en: "GENERATIVE VIDEO / VOICE / MUSIC", es: "VÍDEO GENERATIVO / VOZ / MÚSICA" },
    image: {
      src: "/media/maple-leaf.jpg", width: 1260, height: 720,
      alt: { en: "Original Maple Leaf video poster: a red maple-leaf character surfing a wave.", es: "Portada original del vídeo Maple Leaf: un personaje de hoja de arce roja surfea una ola." },
    },
  },
  {
    id: "ai-rpg",
    date: "2026-01-25",
    url: "https://www.linkedin.com/posts/jrubiosainz_github-copilot-custom-agents-unity-mcp-activity-7421279962546020352-IH7s",
    title: { en: "A world that\ntalks back.", es: "Un mundo que\nte responde." },
    description: {
      en: "A 3D RPG prototype with conversational characters connected to Microsoft Foundry, Bing search and Microsoft Fabric. Built with GitHub Copilot, custom agents and Unity MCP.",
      es: "Un prototipo de RPG 3D con personajes conversacionales conectados a Microsoft Foundry, búsquedas en Bing y Microsoft Fabric. Creado con GitHub Copilot, agentes personalizados y Unity MCP.",
    },
    kind: { en: "3D AI RPG / TECHNICAL PROTOTYPE", es: "RPG 3D CON IA / PROTOTIPO TÉCNICO" },
    tools: { en: "UNITY / COPILOT / MICROSOFT FOUNDRY", es: "UNITY / COPILOT / MICROSOFT FOUNDRY" },
    image: {
      src: "/media/ai-rpg.jpg", width: 800, height: 474,
      alt: { en: "Original LinkedIn image of the 3D RPG: a character answers a question using Bing search.", es: "Imagen original del RPG 3D publicada en LinkedIn: un personaje responde a una pregunta con búsquedas en Bing." },
    },
  },
  {
    id: "desktop-assistant",
    date: "2026-01-23",
    url: "https://www.linkedin.com/posts/jrubiosainz_yesterday-microsoft-released-copilot-sdk-activity-7420372024268591104-5U2B",
    title: { en: "Beyond the\nchat window.", es: "Más allá de\nla ventana del chat." },
    description: {
      en: "A desktop-assistant prototype built with Copilot SDK to interact with applications, files and system settings. Inspired by Burke Holland's example, then explored through my own implementation.",
      es: "Un prototipo de asistente de escritorio con Copilot SDK para interactuar con aplicaciones, archivos y ajustes del sistema. Inspirado en el ejemplo de Burke Holland y explorado con mi propia implementación.",
    },
    kind: { en: "DESKTOP ASSISTANT / COPILOT SDK", es: "ASISTENTE DE ESCRITORIO / COPILOT SDK" },
    tools: { en: "COPILOT SDK / APPLICATIONS / AUTOMATION", es: "COPILOT SDK / APLICACIONES / AUTOMATIZACIÓN" },
    image: {
      src: "/media/desktop-assistant.jpg", width: 800, height: 613,
      alt: { en: "Original LinkedIn image of Desktop Assistant, showing application, file and system interaction tools.", es: "Imagen original de Desktop Assistant publicada en LinkedIn, con herramientas para aplicaciones, archivos y ajustes del sistema." },
    },
  },
];

export const professionalNotes = [
  {
    title: "OGECON",
    date: "2024-06-21",
    url: "https://es.linkedin.com/posts/jrubiosainz_ogecon-activity-7209994690199244801-XBiV",
    description: { en: "Speaker · AI adoption and its impact", es: "Ponente · adopción de IA y su impacto" },
  },
  {
    title: "Microsoft AI Tour 2026",
    date: "2026-02-16",
    url: "https://es.linkedin.com/posts/jrubiosainz_microsoftaitour-activity-7429234235678285826-b2HH",
    description: { en: "Session announcement · scaling AI in Azure", es: "Anuncio de sesión · IA a gran escala en Azure" },
  },
];

export const focusAreas = [
  {
    title: { en: "Cloud architecture", es: "Arquitectura cloud" },
    description: { en: "The foundation matters. My professional focus at Microsoft connects cloud architecture, AI and applications.", es: "La base importa. Mi enfoque profesional en Microsoft conecta la arquitectura cloud, la IA y las aplicaciones." },
  },
  {
    title: { en: "AI beyond the chat", es: "IA más allá del chat" },
    description: { en: "From conversational game characters to an assistant that interacts with a desktop. Intelligence becomes interesting when it can do something.", es: "De personajes de videojuegos que conversan a un asistente que interactúa con el escritorio. La inteligencia se vuelve interesante cuando puede hacer algo." },
  },
  {
    title: { en: "Apps & automation", es: "Apps y automatización" },
    description: { en: "Exploring how agents, Copilot SDK and modern application tools turn an intention into a useful interaction.", es: "Exploro cómo los agentes, Copilot SDK y las herramientas de aplicaciones convierten una intención en una interacción útil." },
  },
  {
    title: { en: "Creative technology", es: "Tecnología creativa" },
    description: { en: "An original AI film. A 3D world. Different ways to test the same question: what could we make next?", es: "Un cortometraje original con IA. Un mundo 3D. Distintas formas de explorar la misma pregunta: ¿qué podríamos crear ahora?" },
  },
  {
    title: { en: "Learning out loud", es: "Aprender y compartir" },
    description: { en: "Sharing experiments and ideas on LinkedIn, and conversations about AI with the community. The process is part of the work.", es: "Comparto experimentos e ideas en LinkedIn y conversaciones sobre IA con la comunidad. El proceso también forma parte del trabajo." },
  },
];

export const en = {
  metaTitle: "Jesús Rubio Sainz — AI, apps & a little imagination",
  metaDescription: "Meet Jesús Rubio Sainz, Cloud Solution Architect, AI & Apps at Microsoft. Original AI films, interactive worlds and applications, shared on LinkedIn.",
  skip: "Skip to content",
  role: "Cloud Solution Architect",
  discipline: "AI & Apps at Microsoft",
  hero: "HI, I'M JESÚS",
  heroAside: "A curious mind turning AI, apps and imagination into something real.",
  heroFootnote: "The human behind the technology.",
  home: "Back to the beginning",
  nav: "Main navigation",
  about: "About",
  approach: "Approach",
  projects: "Projects",
  contact: "Contact",
  contactMe: "Let's talk",
  scroll: "Scroll to explore",
  language: "Change language",
  languageCommand: "RENDER LANGUAGE",
  languageHint: "Same Jesús. A different language.",
  motionOn: "Motion on",
  motionOff: "Motion off",
  motionToggle: "Enable animated effects",
  independent: "Personal website. Views are my own.",
  portraitAlt: "Jesús Rubio Sainz's photograph rendered as silver points, preserving his face and silhouette.",
  portraitCaption: "My photograph. Encoded in points.",
  montage: "A few ideas that became real.",
  montageLink: "Explore the projects",
  conceptFilm: "MAKE\nBELIEVE.",
  conceptWorld: "AI ×\nWORLDS.",
  conceptAgent: "BEYOND\nTHE CHAT.",
  aboutTitle: "ABOUT ME",
  aboutKicker: "01 / PERSON BEFORE TECHNOLOGY",
  aboutCopy: "I'm Jesús Rubio Sainz, a Cloud Solution Architect for AI & Apps at Microsoft. I like the space where engineering meets imagination: a film made with AI, a world that talks back, an app that does more than answer. I build to understand. And I share what I discover.",
  aboutSignature: "Curiosity is the starting point.",
  profile: "My story on LinkedIn",
  approachTitle: "MY FOCUS",
  approachKicker: "02 / HOW I THINK & WHAT I EXPLORE",
  approachIntro: "Technology is the medium.\nPossibility is the point.",
  professionalNotes: "Ideas shared beyond the screen",
  projectsTitle: "SELECTED WORK",
  projectsKicker: "03 / EXPERIMENTS, MADE PUBLIC",
  projectsIntro: "From an idea to an experiment.\nA few stories I've shared on LinkedIn.",
  publicationOpen: "Original post",
  published: "Published on LinkedIn",
  mediaSource: "Original LinkedIn image",
  editorialVisual: "Editorial illustration",
  filmNote: "A story. A leaf.\nA different way to make a film.",
  worldNote: "A world with\nsomething to say.",
  agentNote: "From a prompt\nto an action.",
  contactTitle: "GOOD THINGS\nSTART WITH\nA CONVERSATION.",
  contactKicker: "04 / WHAT'S NEXT?",
  contactCopy: "AI, an idea, or a good question.\nLet's see where it goes.",
  returnTop: "Back to top",
  footerLine: "AI. APPS. IMAGINATION.",
};
export const es: typeof en = {
  metaTitle: "Jesús Rubio Sainz — IA, apps y un poco de imaginación",
  metaDescription: "Conoce a Jesús Rubio Sainz, Arquitecto de Soluciones Cloud, IA y Aplicaciones en Microsoft. Cortometrajes con IA, mundos interactivos y aplicaciones compartidos en LinkedIn.",
  skip: "Saltar al contenido",
  role: "Arquitecto de Soluciones Cloud",
  discipline: "IA y Aplicaciones en Microsoft",
  hero: "SOY JESÚS",
  heroAside: "Una mente curiosa que convierte IA, apps e imaginación en algo real.",
  heroFootnote: "La persona detrás de la tecnología.",
  home: "Volver al comienzo",
  nav: "Navegación principal",
  about: "Sobre mí",
  approach: "Enfoque",
  projects: "Proyectos",
  contact: "Contacto",
  contactMe: "Hablemos",
  scroll: "Desliza para explorar",
  language: "Cambiar idioma",
  languageCommand: "RENDERIZAR IDIOMA",
  languageHint: "El mismo Jesús. Otro idioma.",
  motionOn: "Movimiento sí",
  motionOff: "Movimiento no",
  motionToggle: "Activar efectos animados",
  independent: "Web personal. Mis opiniones son propias.",
  portraitAlt: "Fotografía de Jesús Rubio Sainz representada con puntos plateados, conservando su rostro y silueta.",
  portraitCaption: "Mi fotografía. Codificada en puntos.",
  montage: "Algunas ideas que se hicieron realidad.",
  montageLink: "Explorar los proyectos",
  conceptFilm: "CREAR\nPARA CREER.",
  conceptWorld: "IA ×\nMUNDOS.",
  conceptAgent: "MÁS ALLÁ\nDEL CHAT.",
  aboutTitle: "SOBRE MÍ",
  aboutKicker: "01 / LA PERSONA ANTES QUE LA TECNOLOGÍA",
  aboutCopy: "Soy Jesús Rubio Sainz, Arquitecto de Soluciones Cloud de IA y Aplicaciones en Microsoft. Me interesa el espacio donde la ingeniería se encuentra con la imaginación: una película hecha con IA, un mundo que te responde, una app que hace más que contestar. Creo para entender. Y comparto lo que descubro.",
  aboutSignature: "La curiosidad es el punto de partida.",
  profile: "Mi historia en LinkedIn",
  approachTitle: "MI ENFOQUE",
  approachKicker: "02 / CÓMO PIENSO Y QUÉ EXPLORO",
  approachIntro: "La tecnología es el medio.\nLo importante es lo que hace posible.",
  professionalNotes: "Ideas compartidas fuera de la pantalla",
  projectsTitle: "PROYECTOS",
  projectsKicker: "03 / EXPERIMENTOS EN PÚBLICO",
  projectsIntro: "De una idea a un experimento.\nHistorias que he compartido en LinkedIn.",
  publicationOpen: "Publicación original",
  published: "Publicado en LinkedIn",
  mediaSource: "Imagen original de LinkedIn",
  editorialVisual: "Ilustración editorial",
  filmNote: "Una historia. Una hoja.\nOtra forma de hacer cine.",
  worldNote: "Un mundo con\nalgo que decir.",
  agentNote: "De una instrucción\na una acción.",
  contactTitle: "TODO EMPIEZA\nCON UNA BUENA\nCONVERSACIÓN.",
  contactKicker: "04 / ¿QUÉ VIENE AHORA?",
  contactCopy: "IA, una idea o una buena pregunta.\nVeamos adónde nos lleva.",
  returnTop: "Volver arriba",
  footerLine: "IA. APPS. IMAGINACIÓN.",
};
export const copy = { en, es };
