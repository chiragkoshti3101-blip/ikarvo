/**
 * Build intake: the few choices asked before a build. Shared by the client picker and the server prompt so
 * what the user picked actually shapes the output instead of being decoration.
 */
export type Intake = {
  style: string; shape: string; theme: string; data: string; github: string; deploy: string;
};
export type IntakeKey = keyof Intake;
type Option = { id: string; label: string; hint: string };
type Question = { key: IntakeKey; label: string; options: Option[] };

export const INTAKE_DEFAULTS: Intake = { style: 'auto', shape: 'auto', theme: 'auto', data: 'auto', github: 'none', deploy: 'auto' };

export const INTAKE_QUESTIONS: Question[] = [
  { key: 'style', label: 'Visual style', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo picks the direction that fits the brief' },
    { id: 'minimal', label: 'Minimal', hint: 'Lots of whitespace, one accent colour, restrained type, no decoration' },
    { id: 'classic', label: 'Classic', hint: 'Familiar, trustworthy layout: clear header, hero, feature grid, comfortable sans-serif' },
    { id: 'bold', label: 'Bold', hint: 'Big type, high-contrast blocks, strong colour, confident headlines' },
    { id: 'editorial', label: 'Editorial', hint: 'Serif headlines, magazine spacing, rules and generous line length' },
    { id: 'playful', label: 'Playful', hint: 'Rounded shapes, soft motion, warm palette, friendly illustration' },
    { id: 'technical', label: 'Technical', hint: 'Dense data-first layout, mono accents, dark surface' },
  ] },
  { key: 'shape', label: 'Layout', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides from what you are building' },
    { id: 'landing', label: 'One page', hint: 'A single long page with anchored sections' },
    { id: 'multi', label: 'Multi-page', hint: 'Several linked pages sharing one header and footer' },
    { id: 'dashboard', label: 'Dashboard', hint: 'App shell with sidebar or top bar and dense data views' },
  ] },
  { key: 'theme', label: 'Theme', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo picks what suits the style' },
    { id: 'light', label: 'Light', hint: 'Light surface throughout' },
    { id: 'dark', label: 'Dark', hint: 'Dark surface throughout' },
    { id: 'both', label: 'Light + dark', hint: 'Both, with a working toggle' },
  ] },
  { key: 'data', label: 'Data', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides how far to take the backend' },
    { id: 'static', label: 'Static', hint: 'No backend: state in the browser, sample data where needed' },
    { id: 'content', label: 'Real copy', hint: 'Written content for the brief, no invented metrics or testimonials' },
    { id: 'api', label: 'API routes', hint: 'Real server routes and persistence, no fake backend' },
  ] },
  { key: 'github', label: 'GitHub', options: [
    { id: 'none', label: 'Not now', hint: 'Just build it; you can export a zip or push later' },
    { id: 'new', label: 'New repo', hint: 'Shape the project for a fresh repository under your account' },
    { id: 'existing', label: 'Existing repo', hint: 'You will push it into a repository you already have' },
  ] },
  { key: 'deploy', label: 'Shipping', options: [
    { id: 'auto', label: 'Your call', hint: 'Ikarvo decides what the files should be ready for' },
    { id: 'vercel', label: 'Vercel', hint: 'Zero-config deploy: framework detection, build script, no stray files' },
    { id: 'download', label: 'Download', hint: 'Self-contained files that run locally with one command' },
  ] },
];

const idsFor = (key: IntakeKey) => (INTAKE_QUESTIONS.find(q => q.key === key)?.options ?? []).map(o => o.id);

/** Never trust the client: unknown ids fall back to the default for that question. */
export function normalizeIntake(raw: unknown): Intake {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...INTAKE_DEFAULTS };
  for (const q of INTAKE_QUESTIONS) {
    const v = src[q.key];
    if (typeof v === 'string' && idsFor(q.key).includes(v)) out[q.key] = v;
  }
  return out;
}

const labelOf = (key: IntakeKey, id: string) => INTAKE_QUESTIONS.find(q => q.key === key)?.options.find(o => o.id === id);

/** One short paragraph for the model. Empty for all-default choices, so a quick build stays a quick build. */
export function intakeBrief(intake: Intake): string {
  const lines: string[] = [];
  const add = (key: IntakeKey, prefix: string) => {
    if (intake[key] === 'auto') return;
    const o = labelOf(key, intake[key]);
    if (o) lines.push(`${prefix}: ${o.label} — ${o.hint}.`);
  };
  add('style', 'Visual style'); add('shape', 'Layout'); add('theme', 'Theme'); add('data', 'Data and backend'); add('deploy', 'Shipping');
  if (intake.github === 'new') lines.push('GitHub: prepare for a brand-new repository — package.json with a real name, description and scripts, a short README with run steps, and a .gitignore.');
  if (intake.github === 'existing') lines.push('GitHub: the user pushes this into an existing repository — keep the root clean, do not overwrite unrelated config, and list setup steps in the README.');
  return lines.length ? `\n\nUSER BRIEF CHOICES (follow these over your own defaults):\n- ${lines.join('\n- ')}` : '';
}

/** Short human summary for the collapsed panel. */
export function intakeSummary(intake: Intake): string {
  const parts = (['style', 'shape', 'theme', 'data'] as IntakeKey[])
    .filter(k => intake[k] !== 'auto')
    .map(k => labelOf(k, intake[k])?.label ?? '');
  const gh = intake.github === 'new' ? 'New repo' : intake.github === 'existing' ? 'Existing repo' : 'No GitHub';
  return [...parts, gh].filter(Boolean).join(' · ');
}
