// ---------------------------------------------------------------------------
// content.js — EVERYTHING you will want to personalise lives here.
//
// The 3D room, the TV channels, the teletext, the old PC, the notepad, the
// tapes and the CD player all read from this file at runtime, so editing text
// here never requires re-rendering or re-baking anything in Blender.
//
// Conventions
//   * Plain strings only (no HTML). Inline links use [label](url).
//   * Dates are ISO (YYYY-MM-DD). Colours are CSS hex strings.
//   * Anything marked TODO still needs a real value.
// ---------------------------------------------------------------------------

const content = {
  site: {
    name: 'Jesús Rubio',                  // your name (HUD, TV ident, notepad signature)
    fullName: 'Jesús Rubio Sainz',
    shortName: 'JR',                      // TV station call sign / small spaces
    tagline: 'AI · apps · imagination',   // TV ident sub-line
    intro: 'Cloud Solution Architect for AI & Apps at Microsoft. I like the space where engineering meets imagination: a film made with AI, a world that talks back, an app that does more than answer.',
    email: '',                            // optional: add one to show an Email link in ONLINE and the lite page
    location: 'Burgos, Spain',
    city: 'Port Meridian',                // fictional city outside the window (weather channel, teletext)
    photo: 'assets/images/photo.jpg',     // taped to the PC monitor (square works best). Make one: tools/photo_from_source.py
    lang: 'en',
    url: 'https://jrubiosainz.github.io/', // public address (feed.xml links, social cards); '' while it has none
  },

  // TV (the monitor). Buttons 1–3 are channels, 4–6 are monitor modes.
  tv: {
    brand: 'RUBIO',                       // printed on the TV bezel (baked; change in blender/config.json)
    homeChannel: 0,                        // CH 00 = station ident that plays when nothing is inserted
    channels: [
      { number: 1, id: 'about', title: 'About', route: 'about-tv' },       // "The Late Forecast"
      { number: 2, id: 'work', title: 'Work', route: 'work' },             // work reel + notepad
      { number: 3, id: 'posts', title: 'Posts', route: 'posts' },          // LATETEXT teletext
    ],
    modes: ['UNDERSCAN', 'H/V DELAY', 'BLUE ONLY'],                        // buttons 4, 5, 6
    teletext: { service: 'LATETEXT', indexPage: 100, perPage: 7 },        // perPage: 1–7
  },

  // ABOUT — shown in the PC pager (type ABOUT at the READY prompt) and on CH 01.
  about: {
    title: 'About me',
    // Paragraphs separated by blank lines. Lines starting with "# " are headings.
    text: `I'm Jesús Rubio Sainz, a Cloud Solution Architect for AI & Apps at Microsoft. I like the space where engineering meets imagination: a film made with AI, a world that talks back, an app that does more than answer. I build to understand. And I share what I discover.

# What I work on

The foundation matters. My focus at Microsoft connects cloud architecture, AI and applications: helping teams take AI apps on Azure from a promising demo to something that runs in production.

AI beyond the chat: from game characters that hold a conversation to an assistant that drives a desktop. Intelligence gets interesting when it can do something.

# What I build after hours

Agents and small tools for GitHub Copilot, experiments with Microsoft Foundry, little games, an AI short film, and this room. Most of it lives on [GitHub](https://github.com/jrubiosainz).

# Learning out loud

I share experiments on [LinkedIn](https://www.linkedin.com/in/jrubiosainz/) and talk about AI with anyone who hands me a microphone: OGECON in Burgos, a course on AI for nurses, the Microsoft AI Tour. The process is part of the work.

# Say hello

The quickest way to reach me is a message on [LinkedIn](https://www.linkedin.com/in/jrubiosainz/). I am jrubiosainz everywhere else too, so you can also find me [online](#online), or type ONLINE at the prompt and let the modem do the talking.`,
    forecast: [                          // CH 01 "The Late Forecast": your bio as a weather report
      { region: 'AZURE', icon: 'cloud', temp: 21, text: 'Solid cloud cover over production. Architectures holding steady through the night.' },
      { region: 'AI & APPS', icon: 'sun', temp: 24, text: 'Bright spells of agents doing real work. Chat windows clearing by morning.' },
      { region: 'GITHUB', icon: 'rain', temp: 14, text: 'Steady showers of small Copilot tools. Pull requests likely after midnight.' },
      { region: 'BURGOS', icon: 'storm', temp: 8, text: 'Cold, clear and curious. Ideas building well before the first coffee.' },
    ],
  },

  // WORK — the notepad list, the tapes on the desk (one tape per item, max 12,
  // first 6 go on the left stack) and the programmes that play when a tape is
  // inserted into the VCR.
  //   tape.color   sleeve colour   tape.ink  text colour on the spine
  //   tape.style   'band' | 'stripe' | 'solid' | 'split'   tape.mark  a glyph printed on the spine
  //   visual       B-roll for the tape programme:
  //                'terminal' | 'wireframe' | 'map' | 'charts' | 'starfield' | 'screens' |
  //                'oscilloscope' | 'photos' | 'video'
  //   video        optional mp4/webm path (used when visual === 'video')
  //   images       optional image paths (used when visual === 'photos')
  // Career entries come from public sources (LinkedIn is login-only for scripts): check titles and add years.
  work: {
    title: 'Work',
    groups: [
      {
        heading: 'Career',
        items: [
          {
            id: 'cloud-architect', title: 'Cloud Architect', years: 'now',
            tape: { color: '#2d5bd7', ink: '#ffffff', style: 'band', mark: '★' },
            description: 'Cloud Solution Architect for AI & Apps at Microsoft.',
            body: 'The foundation matters. I connect cloud architecture, AI and applications, and help teams take AI apps on Azure from a promising demo to production.',
            links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/jrubiosainz/' }],
            visual: 'screens',
          },
          {
            id: 'support-engineer', title: 'Support Engineer', years: '',            // TODO: years
            tape: { color: '#e4572e', ink: '#fff6e8', style: 'stripe', mark: '●' },
            description: 'Support Escalation Engineer at Microsoft.',
            body: 'The cases that arrive after everything else has been tried. Good training for staying calm and reading a system from end to end.',
            links: [],
            visual: 'terminal',
          },
          {
            id: 'grupo-antolin', title: 'Grupo Antolin', years: '',                  // TODO: years
            tape: { color: '#1f8a5b', ink: '#f2fff6', style: 'solid', mark: '▲' },
            description: 'Analyst programmer at Grupo Antolin, the automotive interiors group based in Burgos.',
            body: 'Business software for a global manufacturer: the kind of systems that have to keep working on a Monday morning.',
            links: [],
            visual: 'charts',
          },
          {
            id: 'first-jobs', title: 'First Jobs', years: '',                        // TODO: years
            tape: { color: '#6b3fa0', ink: '#ffffff', style: 'split', mark: '◆' },
            description: 'Earlier chapters at Cognodata and Keyland Sistemas de Gestión.',
            body: 'Where I learned the trade on real projects: data, business software and a lot of reading other people’s code.',
            links: [],
            visual: 'map',
          },
          {
            id: 'on-stage', title: 'On Stage', years: '2024–now',
            tape: { color: '#c9302c', ink: '#ffffff', style: 'band', mark: '✦' },
            description: 'Talking about AI with anyone who will listen.',
            body: 'Speaker at OGECON in Burgos in 2024. A course on AI for nurses at the Colegio de Enfermería de Burgos in 2025. A session on scaling AI in Azure at the Microsoft AI Tour in 2026.',
            links: [
              { label: 'OGECON', url: 'https://es.linkedin.com/posts/jrubiosainz_ogecon-activity-7209994690199244801-XBiV' },
              { label: 'AI Tour', url: 'https://es.linkedin.com/posts/jrubiosainz_microsoftaitour-activity-7429234235678285826-b2HH' },
            ],
            visual: 'oscilloscope',
          },
        ],
      },
      {
        heading: 'Projects',
        items: [
          {
            id: 'maple-leaf', title: 'Maple Leaf', years: '2024',
            tape: { color: '#d9482b', ink: '#fff4e0', style: 'solid', mark: '♥' },
            description: 'An original story, made into an AI short film.',
            body: 'A creative project to explore the whole filmmaking process with generative video, voice and music. The credits for every tool roll at the end of the film.',
            links: [{ label: 'Watch it on LinkedIn', url: 'https://www.linkedin.com/posts/jrubiosainz_projectodyssey-aimovie-mapleleaf-activity-7280313215169814528-p4FV' }],
            visual: 'photos',
            images: ['assets/images/work/maple-leaf.jpg'],
          },
          {
            id: 'talking-rpg', title: 'Talking RPG', years: '2026',
            tape: { color: '#1aa3c9', ink: '#ffffff', style: 'stripe', mark: '◆' },
            description: 'A 3D RPG prototype whose characters hold real conversations.',
            body: 'Built with GitHub Copilot custom agents and Unity MCP. The characters are agents in Microsoft Foundry, grounded with Bing search and real data from Microsoft Fabric. Not an AAA game, just proof that all these pieces can play together.',
            links: [{ label: 'LinkedIn post', url: 'https://www.linkedin.com/posts/jrubiosainz_github-copilot-custom-agents-unity-mcp-activity-7421279962546020352-IH7s' }],
            visual: 'photos',
            images: ['assets/images/work/ai-rpg.jpg'],
          },
          {
            id: 'desktop-assistant', title: 'Desktop Assistant', years: '2026',
            tape: { color: '#3d3d3d', ink: '#f5f0e6', style: 'band', mark: '◎' },
            description: 'A desktop assistant built with the GitHub Copilot SDK in under two hours.',
            body: 'It lists and closes apps, arranges windows, tidies files, takes screenshots and sets the volume or the brightness. Inspired by Burke Holland’s example, then built my own way and published on GitHub.',
            links: [
              { label: 'GitHub', url: 'https://github.com/jrubiosainz/desktop-assistant' },
              { label: 'LinkedIn post', url: 'https://www.linkedin.com/posts/jrubiosainz_yesterday-microsoft-released-copilot-sdk-activity-7420372024268591104-5U2B' },
            ],
            visual: 'photos',
            images: ['assets/images/work/desktop-assistant.jpg'],
          },
          {
            id: 'copilot-workbench', title: 'Copilot Workbench', years: '2026',
            tape: { color: '#d94f8a', ink: '#ffffff', style: 'solid', mark: '✦' },
            description: 'A shelf of small tools and extensions for GitHub Copilot.',
            body: 'Token and premium-request budget guards for Copilot CLI sessions, session replay against different models, an agent-experience score for repositories. Each one scratches a real itch.',
            links: [
              { label: 'Budget guard', url: 'https://github.com/jrubiosainz/squad-budget-tokens-extension' },
              { label: 'All repositories', url: 'https://github.com/jrubiosainz?tab=repositories' },
            ],
            visual: 'terminal',
          },
          {
            id: 'foundry-lab', title: 'Foundry Lab', years: '2026',
            tape: { color: '#ff8c42', ink: '#1b1b1b', style: 'split', mark: '☁' },
            description: 'Agents on Microsoft Foundry, taken apart to see how they work.',
            body: 'A governance view that lists every agent with its tools and connections, a harness lab with nine runnable demos, a multi-agent Terraform plan reviewer and a deploy checker for hosted agents.',
            links: [
              { label: 'Agents governance', url: 'https://github.com/jrubiosainz/microsoft-foundry-agents-governance' },
              { label: 'Harness lab', url: 'https://github.com/jrubiosainz/agent-harnesses-lab' },
            ],
            visual: 'charts',
          },
          {
            id: 'arcade-nights', title: 'Arcade Nights', years: '2026',
            tape: { color: '#4b3fd1', ink: '#ffffff', style: 'stripe', mark: '♥' },
            description: 'Small games, built with a lot of help from AI.',
            body: 'Operation Merge, a GitHub-themed run-and-gun arcade game. Agentmon, a handheld-style RPG about collecting robot creatures, backed by Azure Cosmos DB. A hand-drawn doodle RPG for iOS whose every asset came from an image model.',
            links: [
              { label: 'Operation Merge', url: 'https://github.com/jrubiosainz/github-slug' },
              { label: 'Agentmon', url: 'https://github.com/jrubiosainz/agentmon' },
            ],
            visual: 'starfield',
          },
        ],
      },
    ],
  },

  // POSTS — teletext pages 101, 102, ... on CH 03 (newest first). url: a page of this site or any link.
  // Titles up to ~31 characters fit the teletext index on one line.
  posts: [
    { title: 'How this room was built', date: '2026-09-28', url: 'posts/how-this-room-was-built/', excerpt: 'Blender, Python, Cycles lightmaps, synthesised sound and a lot of shaders: the making of this website.' },
    { title: 'Microsoft AI Tour: AI at scale', date: '2026-02-16', url: 'https://es.linkedin.com/posts/jrubiosainz_microsoftaitour-activity-7429234235678285826-b2HH', excerpt: 'Session announcement for the Microsoft AI Tour on 26 February, together with Omar Mokrani Gallego: what it takes to run AI at scale on Azure.' },
    { title: 'A 3D RPG that talks back', date: '2026-01-25', url: 'https://www.linkedin.com/posts/jrubiosainz_github-copilot-custom-agents-unity-mcp-activity-7421279962546020352-IH7s', excerpt: 'GitHub Copilot custom agents, Unity MCP, Microsoft Foundry, Bing and Fabric, all in one little game. The characters answer questions about their world, the news and real data.' },
    { title: 'A desktop agent in two hours', date: '2026-01-23', url: 'https://www.linkedin.com/posts/jrubiosainz_yesterday-microsoft-released-copilot-sdk-activity-7420372024268591104-5U2B', excerpt: 'The Copilot SDK came out and I wondered whether a regular developer could build a desktop agent with it. Less than two hours later it was public on GitHub.' },
    { title: 'AI in health: past and future', date: '2025-12-10', url: 'https://colegioenfermeriaburgos.com/formacion/abierto-el-plazo-de-inscripcion-curso-inteligencia-artificial-para-enfermeria-inscripciones-hasta-el-23-noviembre', excerpt: 'Opening talk of a course on artificial intelligence for nurses at the Colegio de Enfermería de Burgos: evidence-based care, writing, images, video and data.' },
    { title: 'Maple Leaf, an AI short film', date: '2025-01-01', url: 'https://www.linkedin.com/posts/jrubiosainz_projectodyssey-aimovie-mapleleaf-activity-7280313215169814528-p4FV', excerpt: 'An original story turned into a short film with generative video, voice and music during 2024. The credits for every tool roll at the end.' },
    { title: 'Speaking at OGECON', date: '2024-06-21', url: 'https://es.linkedin.com/posts/jrubiosainz_ogecon-activity-7209994690199244801-XBiV', excerpt: 'On stage in Burgos with FAE Burgos, Ibercaja and the University of Burgos, in front of 75 local companies, talking about how AI is changing every layer of work.' },
  ],

  // ONLINE — the BBS directory on the PC (type ONLINE) and the ONLINE link.
  online: {
    bbsName: 'RAIN CITY BBS',
    phone: '555-0142',
    links: [
      { label: 'LinkedIn', handle: 'in/jrubiosainz', url: 'https://www.linkedin.com/in/jrubiosainz/' },
      { label: 'GitHub', handle: 'jrubiosainz', url: 'https://github.com/jrubiosainz' },
      { label: 'X', handle: '@jrubiosainz', url: 'https://x.com/jrubiosainz' },
      { label: 'Instagram', handle: '@jrubiosainz', url: 'https://www.instagram.com/jrubiosainz/' },
      { label: 'TikTok', handle: '@jrubiosainz', url: 'https://www.tiktok.com/@jrubiosainz' },
      { label: 'Portfolio', handle: 'jrubiosainz.github.io/portfolio', url: 'https://jrubiosainz.github.io/portfolio/' },
      { label: 'RSS', handle: 'posts feed', url: 'feed.xml' },
    ],
  },

  // CD player — three original tracks synthesised for this site.
  music: {
    artist: 'The Night Desk',
    album: 'Late Edition',
    tracks: [
      { id: 'music_01', title: 'Rain on Glass' },
      { id: 'music_02', title: 'Night Shift' },
      { id: 'music_03', title: 'Tape Hiss Lullaby' },
    ],
  },

  // CREDITS — the index card. Keep the licence notes if you keep the assets.
  credits: {
    title: 'Credits',
    lines: [
      { what: 'Words, photos and projects', who: 'Jesús Rubio Sainz' },
      { what: 'Room, props and lighting', who: 'modelled in Blender with Python, baked in Cycles' },
      { what: 'Music and sound effects', who: 'synthesised from scratch for this site' },
      { what: 'Reachy Mini', who: 'robot design, meshes and wake/sleep sounds by Pollen Robotics (Apache-2.0)' },
      { what: 'Reachy’s voice', who: 'Azure AI Speech neural voices' },
      { what: 'The view outside', who: 'Jesús’s own photo of the ría, taken into a rainy night with Azure OpenAI' },
      { what: 'Rendering', who: 'three.js (MIT)' },
      { what: 'Type', who: 'Archivo, VT323, Caveat, Courier Prime and others (SIL Open Font License)' },
    ],
    extra: 'Inspired by felixrieseberg.com. The room, its light, music and programmes were made from scratch for this site; Reachy Mini is Pollen Robotics’ open-source desk robot.',
  },
};

export default content;

// Flat list of work items in notepad order (also the tape order on the desk).
export function workItems(c = content) {
  return c.work.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.heading })));
}
