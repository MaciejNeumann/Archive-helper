const STOP_WORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are','aren','as','at',
  'be','because','been','before','being','below','between','both','but','by','can','cannot','could',
  'did','do','does','doing','don','down','during','each','few','for','from','further','had','has',
  'have','having','he','her','here','hers','herself','him','himself','his','how','i','if','in','into',
  'is','it','its','itself','just','let','me','more','most','my','myself','no','nor','not','now','of',
  'off','on','once','only','or','other','ought','our','ours','ourselves','out','over','own','re','s',
  'same','she','should','so','some','such','t','than','that','the','their','theirs','them','themselves',
  'then','there','these','they','this','those','through','to','too','under','until','up','very','was',
  'we','were','what','when','where','which','while','who','whom','why','will','with','would','you',
  'your','yours','yourself','yourselves','also','one','two','three','use','using','used','using','via',
  'get','got','make','made','want','need','see','seen','know','known','like','well','way','still',
  'much','many','any','many','able','etc','eg','ie','please','thanks','thank','hi','hello','hey','re',
  'fwd','yes','no','ok','okay','sure','help','team',
]);

const DYNATRACE_GENERIC = new Set([
  'dynatrace','community','post','question','answer','reply','thread','forum','user','users',
  'agent','agents','host','hosts','server','servers','data','metric','metrics','dashboard',
  'dashboards','tenant','environment','setting','settings','configure','configuration','install',
  'installed','installing','installation','feature','features','tool','tools','help','support',
  'documentation','docs','blog','article','articles','version','versions','update','updated',
  'release','releases','works','working','issue','issues','problem','problems','error','errors',
  'log','logs','file','files','time','date',
]);

const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 3 && t.length <= 30)
    .filter((t) => !STOP_WORDS.has(t) && !DYNATRACE_GENERIC.has(t))
    .filter((t) => !/^\d+$/.test(t));
};

const computeDocFrequency = (documents) => {
  const df = new Map();
  for (const tokens of documents) {
    const unique = new Set(tokens);
    for (const t of unique) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  return df;
};

const topKeywordsForDocument = (tokens, df, totalDocs, n = 15) => {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const scores = [];
  for (const [term, freq] of tf) {
    const docFreq = df.get(term) || 1;
    const idf = Math.log(1 + totalDocs / docFreq);
    scores.push({ term, score: freq * idf });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, n).map((s) => s.term);
};

const extractKeywordsForPosts = (posts, n = 15) => {
  const docs = posts.map((p) => tokenize(`${p.subject} ${p.body}`));
  const df = computeDocFrequency(docs);
  const total = docs.length || 1;
  return docs.map((tokens) => topKeywordsForDocument(tokens, df, total, n));
};

module.exports = { tokenize, extractKeywordsForPosts, STOP_WORDS, DYNATRACE_GENERIC };
