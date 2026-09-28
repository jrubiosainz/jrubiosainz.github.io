export const BUILTIN_FILES = {
  'README.TXT': {
    type: 'text',
    text: `Welcome to the vantec PC 286.\n\nType HELP for commands, ABOUT for the personal pager, ONLINE for the rainy city board, or RUN "HELLO" to try BASIC.\n\nEverything on this disk is original to this site.`,
  },
  'ABOUT.TXT': { type: 'text', text: 'Type ABOUT to open the full phosphor pager with links.' },
  'RAIN.BAS': { type: 'basic', text: `10 CLS\n20 FOR I=1 TO 180\n30 LOCATE INT(RND(1)*22)+1,INT(RND(1)*78)+1\n40 PRINT CHR$(33+INT(RND(1)*60));\n50 NEXT I\n60 GOTO 20` },
  'MAZE.BAS': { type: 'basic', text: `10 CLS\n20 FOR I=1 TO 1840\n30 IF RND(1)>.5 THEN PRINT "/"; ELSE PRINT "\\";\n40 NEXT I` },
  'CLOCK.BAS': { type: 'basic', text: `10 CLS\n20 LOCATE 10,28\n30 PRINT "RAIN CITY TIME"\n40 LOCATE 12,31\n50 PRINT TIME$\n60 FOR I=1 TO 300:NEXT I\n70 GOTO 40` },
  'STARS.BAS': { type: 'basic', text: `10 CLS\n20 FOR I=1 TO 80\n30 LOCATE INT(RND(1)*22)+1,INT(RND(1)*78)+1\n40 PRINT ".";\n50 NEXT I\n60 GOTO 20` },
  'GUESS.BAS': { type: 'basic', text: `10 RANDOMIZE TIMER\n20 N=INT(RND(1)*10)+1\n30 INPUT "NUMBER 1-10";G\n40 IF G=N THEN PRINT "RIGHT!":END\n50 IF G<N THEN PRINT "HIGHER" ELSE PRINT "LOWER"\n60 GOTO 30` },
  'SONG.BAS': { type: 'basic', text: `10 PRINT "RAIN ON GLASS"\n20 PLAY "T140 O4 L8 C E G >C <G E C P8 D F A >D <A F D"` },
  'HELLO.BAS': { type: 'basic', text: `10 LINE INPUT "YOUR NAME? ";N$\n20 PRINT "HELLO, ";N$;"."\n30 PRINT "THE ROOM IS GLAD YOU ARE HERE."` },
  'SNAKE.EXE': { type: 'native' },
  'BLOCKS.EXE': { type: 'native' },
  'LANDER.EXE': { type: 'native' },
  'DEMO.EXE': { type: 'native' },
};

const KEY = 'vantec286.savedPrograms.v1';

export function loadUserFiles() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function saveUserFile(name, text) {
  const files = loadUserFiles();
  files[normalizeBasName(name)] = { type: 'basic', text: String(text || '') };
  localStorage.setItem(KEY, JSON.stringify(files));
}

export function deleteUserFile(name) {
  const files = loadUserFiles();
  delete files[normalizeBasName(name)];
  localStorage.setItem(KEY, JSON.stringify(files));
}

export function allFiles() {
  return { ...BUILTIN_FILES, ...loadUserFiles() };
}

export function normalizeBasName(name) {
  let n = String(name || '').trim().replace(/^"|"$/g, '').toUpperCase();
  if (!/\.[A-Z0-9]+$/.test(n)) n += '.BAS';
  return n;
}

export function fileText(name) {
  const n = normalizeBasName(name);
  const f = allFiles()[n] || allFiles()[String(name || '').toUpperCase()];
  return f?.text || null;
}

export function fileListRows() {
  return Object.entries(allFiles()).sort(([a], [b]) => a.localeCompare(b)).map(([name, f]) => ({
    name,
    size: f.text ? f.text.length : f.type === 'native' ? 4096 : 512,
    type: f.type,
  }));
}
