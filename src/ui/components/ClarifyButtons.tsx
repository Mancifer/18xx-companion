/** askClarification (FR-072, US5-3): the question with one button per option. */
export function ClarifyButtons({
  question,
  options,
  onChoose,
  onCancel,
}: {
  question: string;
  options: readonly { readonly label: string; readonly value: string }[];
  onChoose: (option: { label: string; value: string }) => void;
  onCancel: () => void;
}) {
  return (
    <section className="voice-card" role="dialog" aria-label={question}>
      <p className="voice-summary">{question}</p>
      <div className="choice-grid">
        {options.map((o) => (
          <button key={o.value} onClick={() => onChoose(o)}>
            {o.label}
          </button>
        ))}
      </div>
      <button onClick={onCancel}>Cancelar</button>
    </section>
  );
}
