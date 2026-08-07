import type { Squad } from "../lib/api";

const SQUAD_LABEL: Record<Squad["name"], string> = { GIRLS: "Girls", BOYS: "Boys" };
const SQUAD_DOT_CLASS: Record<Squad["name"], string> = { GIRLS: "dot-pink", BOYS: "dot-blue" };
const SQUAD_ACCENT: Record<Squad["name"], string> = { GIRLS: "var(--pink)", BOYS: "var(--blue)" };

interface SquadSelectorProps {
  squads: Squad[];
  activeSquadId: string | null;
  onChange: (squadId: string) => void;
}

export function SquadSelector({ squads, activeSquadId, onChange }: SquadSelectorProps) {
  if (squads.length === 0) return null;

  return (
    <div className="squad-selector">
      <span className="squad-label">Squad</span>
      {squads.map((squad) => (
        <button
          key={squad.id}
          className={`squad-pill ${activeSquadId === squad.id ? "active" : ""}`}
          style={activeSquadId === squad.id ? { borderColor: SQUAD_ACCENT[squad.name] } : undefined}
          onClick={() => onChange(squad.id)}
        >
          <span className={`dot ${SQUAD_DOT_CLASS[squad.name]}`} />
          {SQUAD_LABEL[squad.name]} <span className="squad-count">{squad.athleteCount}</span>
        </button>
      ))}
    </div>
  );
}
