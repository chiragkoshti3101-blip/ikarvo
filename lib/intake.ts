/**
 * Build intake: the requirement choices asked before a build. Shared by the client picker and the server
 * prompt so what the user ticked actually shapes the output instead of being decoration.
 *
 * Two kinds of answer:
 *  - one-of questions (style, premium, theme, motion, density, shape, content, data, github, deploy)
 *  - features, a checkbox list of things the app must actually do.
 */
export type Intake = {
  style: string; premium: string; theme: string; motion: string; density: string;
  shape: string; content: string; data: string;
  features: string[];
  github: string; deploy: string;
};
export type IntakeKey = 'style' | 'premium' | 'theme' | 'motion' | 'density' | 'shape' | 'content' | 'data' | 'github' | 'deploy';
type Option = { id: string; label: string; hint: string };
type Question = { key: IntakeKey; label: string; group: GroupId; options: Option[] };
export type GroupId = 'look' | 'work' | 'ship';

export const INTAKE_DEFAULTS: Intake = {
  style: 'auto', premium: 'premium', theme: 'auto', motion: 'subtle', density: 'balanced',
  shape: 'auto', content: 'real', data: 'auto', features: [], github: 'none', deploy: 'auto',
};

export const INTAKE_QUESTIONS: Question[] = [
  { key: 'style', group: 'look', label: 'Visual style', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo picks the direction that fits the brief' },
    { id: 'minimal', label: 'Minimal', hint: 'Lots of whitespace, one accent colour, restrained type, no decoration' },
    { id: 'classic', label: 'Classic', hint: 'Familiar, trustworthy layout: clear header, hero, feature grid, comfortable sans-serif' },
    { id: 'bold', label: 'Bold', hint: 'Big type, high-contrast blocks, strong colour, confident headlines' },
    { id: 'editorial', label: 'Editorial', hint: 'Serif headlines, magazine spacing, rules and generous line length' },
    { id: 'playful', label: 'Playful', hint: 'Rounded shapes, soft motion, warm palette, friendly illustration' },
    { id: 'technical', label: 'Technical', hint: 'Dense data-first layout, mono accents, dark surface' },
    { id: 'soft', label: 'Soft', hint: 'Muted pastels, gentle shadows, calm spacing, rounded but not pill-shaped' },
    { id: 'brutalist', label: 'Brutalist', hint: 'Raw grid, heavy borders, monospace, flat colour, no gradients' },
  ] },
  { key: 'premium', group: 'look', label: 'How premium', options: [
    { id: 'standard', label: 'Clean', hint: 'Tidy and functional: one accent, comfortable spacing, no flourish' },
    { id: 'premium', label: 'Premium', hint: 'Custom craft: deliberate type scale, 8px spacing rhythm, considered borders and elevation, states everywhere, one purposeful motion moment' },
    { id: 'luxury', label: 'Luxury', hint: 'Art-directed: editorial layout, generous negative space, high-contrast type pairing, near-monochrome plus one metallic accent, oversized imagery, slow restrained transitions' },
  ] },
  { key: 'theme', group: 'look', label: 'Theme', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo picks what suits the style' },
    { id: 'light', label: 'Light', hint: 'Light surface throughout' },
    { id: 'dark', label: 'Dark', hint: 'Dark surface throughout' },
    { id: 'both', label: 'Light + dark', hint: 'Both, with a working toggle' },
  ] },
  { key: 'motion', group: 'look', label: 'Motion', options: [
    { id: 'none', label: 'Static', hint: 'No animation beyond instant state changes' },
    { id: 'subtle', label: 'Subtle', hint: 'Short fades and 120–200ms transitions that clarify state only' },
    { id: 'expressive', label: 'Expressive', hint: 'Scroll reveals, staggered entrances and transitions, still under 400ms and reduced-motion safe' },
  ] },
  { key: 'density', group: 'look', label: 'Density', options: [
    { id: 'airy', label: 'Airy', hint: 'Large paddings and type, one idea per screen' },
    { id: 'balanced', label: 'Balanced', hint: 'Comfortable marketing spacing with efficient app screens' },
    { id: 'compact', label: 'Compact', hint: 'Dense tables and small controls for power users' },
  ] },
  { key: 'shape', group: 'work', label: 'Structure', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides from what you are building' },
    { id: 'landing', label: 'One page', hint: 'A single long page with anchored sections' },
    { id: 'multi', label: 'Multi-page', hint: 'Several linked pages sharing one header and footer' },
    { id: 'dashboard', label: 'Dashboard', hint: 'App shell with sidebar or top bar and dense data views' },
    { id: 'wizard', label: 'Guided flow', hint: 'Step-by-step screens for one job, with progress and back/next' },
  ] },
  { key: 'content', group: 'work', label: 'Copy', options: [
    { id: 'real', label: 'Real copy', hint: 'Written for this business: real headlines, feature names, labels, empty and error states — no lorem ipsum' },
    { id: 'short', label: 'Terse', hint: 'Minimal words: labels and short lines, no marketing paragraphs' },
    { id: 'rich', label: 'Long-form', hint: 'Full marketing and editorial copy: sections, proof, FAQ, detail pages' },
  ] },
  { key: 'data', group: 'work', label: 'Data', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides how far to take the backend' },
    { id: 'static', label: 'Static', hint: 'No backend: state in the browser, sample data where needed' },
    { id: 'local', label: 'Browser store', hint: 'Persisted in the browser with real create/edit/delete flows' },
    { id: 'api', label: 'API routes', hint: 'Real server routes and persistence, no fake backend' },
  ] },
  { key: 'github', group: 'ship', label: 'GitHub', options: [
    { id: 'none', label: 'Not now', hint: 'Just build it; you can export a zip or push later' },
    { id: 'new', label: 'New repo', hint: 'Shape the project for a fresh repository under your account' },
    { id: 'existing', label: 'Existing repo', hint: 'You will push it into a repository you already have' },
  ] },
  { key: 'deploy', group: 'ship', label: 'Shipping', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides what the files should be ready for' },
    { id: 'vercel', label: 'Vercel', hint: 'Zero-config deploy: framework detection, build script, no stray files' },
    { id: 'download', label: 'Download', hint: 'Self-contained files that run locally with one command' },
  ] },
];

/** The panel is grouped so twenty options still read as three decisions. */
export const INTAKE_GROUPS: { id: GroupId; title: string; hint: string }[] = [
  { id: 'look', title: 'How it should look', hint: 'Style, craft level, theme, motion and density' },
  { id: 'work', title: 'How it should work', hint: 'Structure, copy and where data lives' },
  { id: 'ship', title: 'How it ships', hint: 'Repository and hosting' },
];

export type Feature = { id: string; label: string; hint: string };

/** Things a real product in this market usually has. The user ticks what they want built; the model is told to build exactly those. */
export const FEATURES: Feature[] = [
  { id: 'auth', label: 'Sign-in & accounts', hint: 'Sign up, sign in, sign out, session-aware UI' },
  { id: 'roles', label: 'Roles & permissions', hint: 'Owner / member style access, guarded actions' },
  { id: 'admin', label: 'Admin panel', hint: 'Manage records, users or content from one screen' },
  { id: 'persistence', label: 'Saved data', hint: 'Records survive a reload and can be edited again' },
  { id: 'search', label: 'Search', hint: 'Find records by text, with a no-results state' },
  { id: 'filters', label: 'Filters & sorting', hint: 'Filter chips, date range, sortable columns' },
  { id: 'charts', label: 'Charts & metrics', hint: 'A few charts that answer a real question' },
  { id: 'uploads', label: 'File & image uploads', hint: 'Upload, preview, remove, size and type checks' },
  { id: 'notifications', label: 'Notifications', hint: 'In-app notices and an email-ready hook' },
  { id: 'realtime', label: 'Live updates', hint: 'Lists or presence that update without a reload' },
  { id: 'calendar', label: 'Calendar & booking', hint: 'Slots, availability, confirm and cancel' },
  { id: 'payments', label: 'Checkout & payments', hint: 'Cart or plan selection to a payment step, clearly sandboxed' },
  { id: 'pricing', label: 'Pricing section', hint: 'Plans, a monthly/yearly switch and a comparison' },
  { id: 'invoices', label: 'Invoices & receipts', hint: 'Numbered records, totals, printable view' },
  { id: 'cms', label: 'Blog / content', hint: 'Article list, article page, author and dates' },
  { id: 'reviews', label: 'Reviews & testimonials', hint: 'Only real or clearly labelled sample quotes — never invented customers' },
  { id: 'faq', label: 'FAQ', hint: 'Questions grouped by topic, expandable answers' },
  { id: 'contact', label: 'Contact form', hint: 'Validated fields, success and error states' },
  { id: 'newsletter', label: 'Newsletter / waitlist', hint: 'Email capture with duplicate and invalid handling' },
  { id: 'legal', label: 'Privacy & terms', hint: 'Real, readable policy pages linked from the footer' },
  { id: 'darkmode', label: 'Dark mode toggle', hint: 'A working theme switch that persists' },
  { id: 'export', label: 'CSV / print export', hint: 'Export the current view, not a fixed file' },
  { id: 'offline', label: 'Offline / installable', hint: 'Works without a network, installable where it makes sense' },
];
const FEATURE_IDS = FEATURES.map(f => f.id);

const idsFor = (key: IntakeKey) => (INTAKE_QUESTIONS.find(q => q.key === key)?.options ?? []).map(o => o.id);

/** Never trust the client: unknown ids fall back to the default for that question. */
export function normalizeIntake(raw: unknown): Intake {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Intake = { ...INTAKE_DEFAULTS, features: [] };
  for (const q of INTAKE_QUESTIONS) {
    const v = src[q.key];
    if (typeof v === 'string' && idsFor(q.key).includes(v)) out[q.key] = v;
  }
  const feats = Array.isArray(src.features) ? src.features : [];
  out.features = [...new Set(feats.filter((x): x is string => typeof x === 'string' && FEATURE_IDS.includes(x)))].slice(0, FEATURES.length);
  return out;
}

const labelOf = (key: IntakeKey, id: string) => INTAKE_QUESTIONS.find(q => q.key === key)?.options.find(o => o.id === id);
export const featureById = (id: string) => FEATURES.find(f => f.id === id);

/**
 * Which features a brief probably wants. Used only to order and tag the checkboxes — nothing is ticked for the user.
 */
export function suggestedFeatures(text: string, kind = ''): string[] {
  const t = `${text} ${kind}`.toLowerCase();
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  if (/\b(auth|log ?in|sign ?in|sign ?up|account|user|saas|team|member|profile)\b/.test(t)) add('auth');
  if (/\b(dashboard|analytic|metric|report|chart|kpi|insight)\b/.test(t)) { add('charts'); add('filters'); }
  if (/\b(book|appointment|schedul|calendar|reserv)\b/.test(t)) add('calendar');
  if (/\b(payment|checkout|pricing|subscription|billing|invoice|store|shop|ecommerce|cart|paid)\b/.test(t)) { add('payments'); add('pricing'); }
  if (/\b(blog|article|post|cms|editorial|publication)\b/.test(t)) { add('cms'); add('newsletter'); }
  if (/\b(search|find|catalog|directory|listing)\b/.test(t)) add('search');
  if (/\b(upload|image|photo|file|media|document|pdf)\b/.test(t)) add('uploads');
  if (/\b(notif|alert|remind|email|digest)\b/.test(t)) add('notifications');
  if (/\b(chat|message|realtime|live|collaborat|multiplayer)\b/.test(t)) { add('realtime'); add('notifications'); }
  if (/\b(landing|marketing|website|site|launch)\b/.test(t)) { add('contact'); add('pricing'); }
  if (/\b(admin|manage|moderat|back ?office)\b/.test(t)) add('admin');
  if (/\b(mobile|ios|android|expo|react native)\b/.test(t)) { add('offline'); add('notifications'); }
  if (/\b(crm|lead|pipeline|customer)\b/.test(t)) { add('filters'); add('export'); add('roles'); }
  if (/\b(recipe|workout|habit|tracker|journal|log)\b/.test(t)) { add('persistence'); add('charts'); }
  return out;
}

/** One short paragraph for the model. Premiumness and copy always travel, because they are what stops a generic build. */
export function intakeBrief(intake: Intake): string {
  const lines: string[] = [];
  const add = (key: IntakeKey, prefix: string) => {
    if (intake[key] === 'auto') return;
    const o = labelOf(key, intake[key]);
    if (o) lines.push(`${prefix}: ${o.label} — ${o.hint}.`);
  };
  add('style', 'Visual style'); add('premium', 'Craft level'); add('theme', 'Theme'); add('motion', 'Motion'); add('density', 'Density');
  add('shape', 'Structure'); add('content', 'Copy'); add('data', 'Data and backend'); add('deploy', 'Shipping');
  if (intake.github === 'new') lines.push('GitHub: prepare for a brand-new repository — package.json with a real name, description and scripts, a short README with run steps, and a .gitignore.');
  if (intake.github === 'existing') lines.push('GitHub: the user pushes this into an existing repository — keep the root clean, do not overwrite unrelated config, and list setup steps in the README.');
  const feats = intake.features.map(featureById).filter((f): f is Feature => !!f);
  const must = feats.length
    ? `\n- Must exist and actually work (build these, and only add other features the brief itself requires): ${feats.map(f => `${f.label} (${f.hint})`).join('; ')}.`
    : '\n- No feature beyond what the brief asks for.';
  return `\n\nUSER BRIEF CHOICES (follow these over your own defaults):\n- ${lines.join('\n- ')}${must}`;
}

/** Short human summary for the collapsed panel. */
export function intakeSummary(intake: Intake): string {
  const parts = (['premium', 'style', 'shape', 'theme'] as IntakeKey[])
    .filter(k => intake[k] !== 'auto')
    .map(k => labelOf(k, intake[k])?.label ?? '');
  if (intake.features.length) parts.push(`${intake.features.length} feature${intake.features.length === 1 ? '' : 's'}`);
  const gh = intake.github === 'new' ? 'New repo' : intake.github === 'existing' ? 'Existing repo' : 'No GitHub';
  return [...parts, gh].filter(Boolean).join(' · ');
}
