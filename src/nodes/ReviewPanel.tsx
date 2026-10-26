// Particles ▸ Check, for the particles found by any way but Find like this (it has its own): Review (a click leaves a
// particle out, or puts it back), Learn from my choices (the particles said good or not teach a classifier, which leaves
// out those like the bad ones), how sure Segment anything is of each (a least kept).
import { LEARN_LABELS, LEARN_METHODS, LEAST_EXAMPLES, type LearnMethod } from '../image/learn.ts';
import { PARTICLE_FEATURE_TITLES, PARTICLE_FEATURES } from '../image/review.ts';
import { Fold, ScoreHistogram } from './RoiManager.tsx';
import { Check, Select } from './ui.tsx';

export function ReviewPanel(p: {
  reviewing: boolean;
  setReviewing: (on: boolean) => void;
  count: number; // the particles found
  out: { hand: number; said: number; learnt: number; score: number };
  putBack: () => void; // those left out by a click put back
  learnOn: boolean;
  setLearn: (on: boolean) => void;
  method: LearnMethod | 'auto';
  setMethod: (m: LearnMethod | 'auto') => void;
  good: number;
  bad: number;
  learnt: { method: LearnMethod; accuracy: Record<LearnMethod, number>; importance: number[] } | null;
  probs: number[] | null;
  pmin: number;
  setPmin: (v: number) => void;
  unsure: boolean;
  setUnsure: (on: boolean) => void;
  forget: () => void;
  scores: number[]; // how sure Segment anything is of each of its particles
  sure: number;
  setSure: (v: number) => void;
}) {
  const left = p.out.hand + p.out.said + p.out.learnt + p.out.score;
  const why = [p.out.hand ? `${p.out.hand} by a click` : '', p.out.said ? `${p.out.said} said not good` : '', p.out.learnt ? `${p.out.learnt} learnt` : '', p.out.score ? `${p.out.score} not sure enough` : ''].filter(Boolean).join(', ');
  return (
    <>
      <Fold id="gen-review" title="Review" aside={left ? `${left} left out` : p.reviewing ? 'on' : undefined} opened>
        <div className="row wrap">
          <button className={`nodrag${p.reviewing ? ' on' : ''}`} disabled={!p.count} title="Review: a click on a particle found leaves it out (faint, not measured); on one left out, puts it back. Learning: a click says it is not good, a second that it is good, a third neither" onClick={() => p.setReviewing(!p.reviewing)}>
            {p.reviewing ? 'Done' : 'Review'}
          </button>
          {p.out.hand > 0 && (
            <button className="nodrag" title="Every particle left out by a click put back" onClick={p.putBack}>
              Put back ({p.out.hand})
            </button>
          )}
        </div>
        <div className="hint">{p.count ? `${p.count - left} kept of ${p.count}${why ? `; left out: ${why}` : ''}.` : 'Find the particles first (step 2).'}</div>
        <Check label="Learn from my choices" title="While reviewing, a click on a particle says it is not good, a second one that it is good, a third neither. From those said (3 of each at least) a classifier learns what tells them apart (their size, roundness, brightness, contrast with the ground, edges, texture, nearest neighbour, how sure Segment anything is), and leaves out those it finds probably not good" value={p.learnOn} onChange={p.setLearn} />
        {p.learnOn && (
          <div className="ie-learn">
            <span className="muted">
              {p.good} good, {p.bad} not good{p.learnt ? '' : `: ${LEAST_EXAMPLES} of each to learn`}
            </span>
            <div className="ie-params">
              <span className="ie-label">Method</span>
              <Select<string> value={p.method} title="Auto: the method most often right on your examples (each left out in turn and guessed from the others; past 30 examples, ten parts of them in turn; worked out off the page)" options={[['auto', 'Auto'], ...LEARN_METHODS.map((m): [string, string] => [m, LEARN_LABELS[m]])]} onChange={(v) => p.setMethod(v as LearnMethod | 'auto')} />
            </div>
            {p.learnt && (
              <>
                {p.probs && (
                  <>
                    <ScoreHistogram scores={p.probs} min={p.pmin} onMin={p.setPmin} lo={0} />
                    <div className="hint">The probability of every particle being a good one; those at least as probable as the line kept.</div>
                  </>
                )}
                <div className="hint">
                  Right on your examples (each guessed from the others): {LEARN_METHODS.map((m) => `${LEARN_LABELS[m]} ${Number.isFinite(p.learnt!.accuracy[m]) ? Math.round(p.learnt!.accuracy[m] * 100) : '–'} %`).join(', ')}; used: {LEARN_LABELS[p.learnt.method]}
                </div>
                <div className="ie-importance" title="How much each feature counts: how much the probabilities move when its values are shuffled">
                  {PARTICLE_FEATURES.map((name, j) => (
                    <div key={name} className="ie-imp-row" title={PARTICLE_FEATURE_TITLES[j]}>
                      <span>{name}</span>
                      <span className="ie-imp-bar" style={{ width: `${Math.round(p.learnt!.importance[j] * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="row wrap">
                  <button className={`nodrag${p.unsure ? ' on' : ''}`} title="The 5 particles the classifier is least sure of (not said yet), outlined: say them while reviewing, then the next 5" onClick={() => p.setUnsure(!p.unsure)}>
                    Show the unsure ones
                  </button>
                </div>
              </>
            )}
            {p.good + p.bad > 0 && (
              <div className="row">
                <button className="nodrag" title="Forget every particle said good or not" onClick={p.forget}>
                  Forget the examples
                </button>
              </div>
            )}
          </div>
        )}
      </Fold>
      {p.scores.length > 0 && (
        <Fold id="gen-sure" title="Sure (Segment anything)" aside={p.sure > 0 ? `≥ ${p.sure.toFixed(2)}` : 'all kept'}>
          <ScoreHistogram scores={p.scores} min={Math.max(0.5, p.sure)} onMin={p.setSure} lo={0.5} />
          <div className="hint">How sure the model is of every particle it found; those less sure than the line left out (a click or a drag on it moves the line).</div>
        </Fold>
      )}
    </>
  );
}
