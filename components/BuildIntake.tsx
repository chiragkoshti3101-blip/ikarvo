'use client';
import { useState } from 'react';
import Icon from './Icon';
import {
  FEATURES, INTAKE_DEFAULTS, INTAKE_GROUPS, INTAKE_QUESTIONS, intakeSummary, suggestedFeatures,
  type GroupId, type Intake,
} from '@/lib/intake';

/**
 * The requirements panel shown before a build: how it should look, how it should work, what it must do,
 * and how it ships. Collapsed to one line, everything inside is a real choice sent to the server.
 */
export default function BuildIntake({ intake, onChange, githubOk, prompt, kind }: {
  intake: Intake; onChange: (i: Intake) => void; githubOk: boolean; prompt: string; kind: string;
}) {
  const [open, setOpen] = useState(false);
  const summary = intakeSummary(intake);
  const suggested = suggestedFeatures(prompt, kind);
  const ordered = [...FEATURES].sort((a, b) => {
    const ai = suggested.indexOf(a.id); const bi = suggested.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const dirty = JSON.stringify(intake) !== JSON.stringify(INTAKE_DEFAULTS);
  const toggleFeature = (id: string) => onChange({
    ...intake,
    features: intake.features.includes(id) ? intake.features.filter(f => f !== id) : [...intake.features, id],
  });
  const group = (g: GroupId) => INTAKE_QUESTIONS.filter(q => q.group === g);

  return <div className="b-intake">
    <button type="button" className="b-intake-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="sliders" size={14} />
      <b>Brief</b>
      <span className="b-intake-sum">{summary}</span>
      <span className="grow" />
      <span className="small muted hide-sm">{open ? 'Hide' : 'Requirements, look & ship'}</span>
      <Icon name="chevron-down" size={13} />
    </button>

    {open && <div className="b-intake-body">
      {INTAKE_GROUPS.map(g => <fieldset className="b-intake-group" key={g.id}>
        <legend><b>{g.title}</b><span className="small muted">{g.hint}</span></legend>
        <div className="b-intake-g">
          {group(g.id).map(q => <div className="b-intake-q" key={q.key}>
            <span className="b-intake-l">{q.label}</span>
            <div className="b-intake-opts" role="radiogroup" aria-label={q.label}>
              {q.options.map(o => <button type="button" key={o.id} role="radio" aria-checked={intake[q.key] === o.id} title={o.hint}
                className={intake[q.key] === o.id ? 'on' : ''} onClick={() => onChange({ ...intake, [q.key]: o.id })}>{o.label}</button>)}
            </div>
          </div>)}
          {g.id === 'work' && <div className="b-intake-q">
            <span className="b-intake-l">Must-have features <i className="b-intake-count">{intake.features.length || 'none'}</i></span>
            <div className="b-intake-grid">
              {ordered.map(f => {
                const on = intake.features.includes(f.id);
                const sug = suggested.includes(f.id);
                return <label key={f.id} className={`b-intake-check ${on ? 'on' : ''}`} title={f.hint}>
                  <input type="checkbox" checked={on} onChange={() => toggleFeature(f.id)} />
                  <span><b>{f.label}</b>{sug && !on && <i className="b-intake-tag">suggested</i>}<small>{f.hint}</small></span>
                </label>;
              })}
            </div>
          </div>}
        </div>
      </fieldset>)}

      {!githubOk && intake.github !== 'none' && <p className="small muted b-intake-note">GitHub isn’t connected on this server yet. The build is still shaped for a repo; pushing asks you to connect it first.</p>}
      <div className="b-intake-foot">
        <p className="small muted">Nothing here is final — say what you want in the prompt and Ikarvo follows that first.</p>
        <span className="grow" />
        <button type="button" className="btn ghost sm" disabled={!dirty} onClick={() => onChange({ ...INTAKE_DEFAULTS })}>Reset</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>}
  </div>;
}
