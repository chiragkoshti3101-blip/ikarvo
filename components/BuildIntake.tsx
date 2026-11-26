'use client';
import { useState } from 'react';
import Icon from './Icon';
import { INTAKE_QUESTIONS, intakeSummary, type Intake } from '@/lib/intake';

/** The questions asked before a build: style, layout, theme, data, GitHub and shipping. Collapsed to one line. */
export default function BuildIntake({ intake, onChange, githubOk }: { intake: Intake; onChange: (i: Intake) => void; githubOk: boolean }) {
  const [open, setOpen] = useState(false);
  const summary = intakeSummary(intake);
  return <div className="b-intake">
    <button className="b-intake-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="sliders" size={14} />
      <b>Brief</b>
      <span className="b-intake-sum">{summary}</span>
      <span className="grow" />
      <span className="small muted hide-sm">{open ? 'Hide' : 'Choose how to build it'}</span>
      <Icon name="chevron-down" size={13} />
    </button>
    {open && <div className="b-intake-body">
      {INTAKE_QUESTIONS.map(q => <div className="b-intake-q" key={q.key}>
        <span className="label">{q.label}</span>
        <div className="b-intake-opts" role="radiogroup" aria-label={q.label}>
          {q.options.map(o => <button key={o.id} role="radio" aria-checked={intake[q.key] === o.id} title={o.hint}
            className={intake[q.key] === o.id ? 'on' : ''} onClick={() => onChange({ ...intake, [q.key]: o.id })}>{o.label}</button>)}
        </div>
      </div>)}
      {!githubOk && intake.github !== 'none' && <p className="small muted">GitHub isn’t connected on this server yet. The build is still shaped for a repo; pushing asks you to connect it first.</p>}
      <p className="small muted">Leaving a question on “Your call” lets Ikarvo decide it.</p>
    </div>}
  </div>;
}
