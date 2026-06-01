// English function words + pronouns + auxiliary verbs.
const FUNCTION_WORDS = [
  'a','about','above','after','again','against','all','am','an','and','any','are','aren','as','at',
  'be','because','been','before','being','below','between','both','but','by','can','cannot','could',
  'did','do','does','doing','don','down','during','each','few','for','from','further','had','has',
  'have','having','he','her','here','hers','herself','him','himself','his','how','i','if','in','into',
  'is','it','its','itself','just','let','me','more','most','my','myself','no','nor','not','now','of',
  'off','on','once','only','or','other','ought','our','ours','ourselves','out','over','own','re','s','t',
  'same','she','should','so','some','such','than','that','the','their','theirs','them','themselves',
  'then','there','these','they','this','those','through','to','too','under','until','up','very','was',
  'we','were','what','when','where','which','while','who','whom','why','will','with','would','you',
  'your','yours','yourself','yourselves','also','able','etc','eg','ie','must','shall','might','may',
];

// Number words and quantifiers.
const NUMBERS_AND_QUANTIFIERS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'much','many','single','multiple','several','various','few','some',
];

// Time/sequence references — usually filler in posts.
const TIME_WORDS = [
  'months','month','week','weeks','year','years','day','days','hour','hours','minute','minutes',
  'second','seconds','today','yesterday','tomorrow','currently','recently','lately','previously',
  'originally','eventually','finally','initially','first','second','third','last','next','previous',
  'latest','current','old','older','oldest','new','newer','newest','once','twice',
];

// Conversational/greeting/sign-off filler.
const CONVERSATIONAL = [
  'please','thanks','thank','hi','hello','hey','fwd','yes','okay','sure','team','regards','regard',
  'regarding','best','kind','kinds','kindly','dear','sincerely','cheers','greetings','morning',
  'evening','afternoon','everyone','everybody','anyone','someone','somebody','folks','guys',
  'yeah','yep','nope',
];

// Adjectives/adverbs that don't carry topic information.
const FILLER_MODIFIERS = [
  'really','always','never','sometimes','often','usually','perhaps','maybe','probably','obviously',
  'clearly','simply','simple','easy','easily','hard','difficult','possible','possibly','impossible',
  'automatically','manually','typically','generally','specifically','exactly','completely',
  'partially','partly','fully','full','empty','entire','whole','overall','good','great','nice',
  'fine','cool','awesome','bad','wrong','right','correct','incorrect','poor','large','small','big',
  'tiny','huge','little','low','high','medium','tall','short','long','far','near','close','different',
  'similar','related','default','common','normal','special','important','useful','helpful','primary',
  'secondary','main','additional','extra','further','another','well','way','ways','still',
];

// Generic nouns: containers/places/things without specific meaning.
const GENERIC_NOUNS = [
  'part','parts','side','sides','item','items','thing','things','stuff','place','places',
  'end','start','beginning','finish',
];

// Common conversational/non-technical verbs (and their inflections).
const COMMON_VERBS = [
  'use','using','used','via','get','gets','got','make','makes','made','making','want','wants','wanted',
  'need','needs','needed','see','sees','seen','saw','know','knows','known','knew','like','liked','likes',
  'said','says','saying','say','seems','seem','seemed','looks','look','looking','looked','mean','means',
  'meant','meaning','find','found','finding','take','taken','took','taking','give','given','gave','giving',
  'going','gone','went','goes','come','came','coming','comes','try','tries','tried','trying','ask','asks',
  'asked','asking','tell','tells','told','telling','talk','talks','talked','talking','hear','heard',
  'hearing','feel','feels','felt','feeling','think','thought','thinking','thinks','write','wrote',
  'written','writing','writes','read','reads','reading','put','puts','putting','keep','kept','keeping',
  'wait','waited','waiting','happen','happens','happened','happening','seek','seeks','sought','beat',
  'beats','occur','occurs','occurred','occurring','solve','solves','solved','solving','satisfy',
  'satisfied','satisfies','specify','specifies','specified','specifying','activate','activates',
  'activated','activating','modify','modifies','modified','modifying','modification','modifications',
  'attempt','attempts','attempted','expect','expects','expected','consider','considers','considered',
  'suggest','suggests','suggested','believe','believes','believed','assume','assumes','assumed',
  'wonder','wondered','wondering','realize','realized','recognize','recognized','notice','noticed',
  'remember','remembered','forgot','forget','forgets','understand','understood','understanding',
  'explain','explains','explained','describe','describes','described','mention','mentions','mentioned',
  'share','shares','shared','sharing','reach','reaches','reached','reaching','allow','allows','allowed',
  'allowing','follow','follows','followed','following','show','shows','showed','shown','showing','lets',
  'letting','provide','provides','provided','providing','contain','contains','contained','containing',
  'include','includes','included','including','exclude','excludes','excluded','prefer','prefers',
  'preferred','exist','exists','existed','existing','remain','remains','remained','remaining','depend',
  'depends','depended','depending','choose','chooses','chose','chosen','choosing','decide','decides',
  'decided','agree','agrees','agreed','disagree','approve','approved','enable','enables','enabled',
  'enabling','disable','disables','disabled','disabling','start','starts','started','starting','stop',
  'stops','stopped','stopping','restart','restarted','finish','finishes','finished','finishing',
  'complete','completed','completes','completing','done','unable',
];

const STOP_WORDS = new Set([
  ...FUNCTION_WORDS,
  ...NUMBERS_AND_QUANTIFIERS,
  ...TIME_WORDS,
  ...CONVERSATIONAL,
  ...FILLER_MODIFIERS,
  ...GENERIC_NOUNS,
  ...COMMON_VERBS,
]);

// Forum/product vocabulary that's everywhere on the Community — leave it out of keywords
// so genuine topic terms can rise instead.
const DYNATRACE_GENERIC = new Set([
  'dynatrace','community','post','posts','question','questions','answer','answers','reply','replies',
  'thread','threads','forum','forums','user','users','help','support','docs','documentation','blog',
  'article','articles','version','versions','update','updated','updates','updating','release',
  'releases','released','releasing','works','worked','working','issue','issues','problem','problems',
  'error','errors','log','logs','file','files','time','times','date','dates','example','examples',
  'sample','samples','case','cases','option','options','feature','features','tool','tools',
  'configure','configures','configured','configuring','configuration','configurations','install',
  'installs','installed','installing','installation','installations','setup','set','sets','setting',
  'settings','data','info','information','details','detail','step','steps','guide','guides',
]);

const isCleanTokenShape = (t) => {
  if (t.length < 3 || t.length > 30) return false;
  if (/^\d/.test(t)) return false;
  if (/^-/.test(t) || /-$/.test(t)) return false;
  if (/--/.test(t)) return false;
  if ((t.match(/-/g) || []).length > 2) return false;
  if (/^[a-z]+\d+[a-z]*\d+/.test(t)) return false;
  if (!/[aeiouy]/.test(t)) return false;
  return true;
};

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
    .filter(isCleanTokenShape)
    .filter((t) => !STOP_WORDS.has(t) && !DYNATRACE_GENERIC.has(t));
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

const topKeywordsForDocument = (tokens, df, totalDocs, n, vocab) => {
  const tf = new Map();
  for (const t of tokens) {
    if (vocab && !vocab.has(t)) continue;
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const scores = [];
  for (const [term, freq] of tf) {
    const docFreq = df.get(term) || 1;
    const idf = Math.log(1 + totalDocs / docFreq);
    scores.push({ term, score: freq * idf });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, n).map((s) => s.term);
};

// Returns a Map keyed by post reference (not array index), so callers that filter or
// reorder posts between extraction and consumption can't desync their data.
const extractKeywordsForPosts = (posts, n = 25, { vocab = null } = {}) => {
  const tokenLists = posts.map((p) => tokenize(`${p.subject} ${p.body}`));
  const df = computeDocFrequency(tokenLists);
  const total = tokenLists.length || 1;
  const result = new Map();
  posts.forEach((post, i) => {
    result.set(post, topKeywordsForDocument(tokenLists[i], df, total, n, vocab));
  });
  return result;
};

module.exports = { tokenize, extractKeywordsForPosts, STOP_WORDS, DYNATRACE_GENERIC };
