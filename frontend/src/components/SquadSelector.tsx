import type { Squad } from "../lib/api";

const SQUAD_LABEL: Record<Squad["name"], string> = { GIRLS: "Girls", BOYS: "Boys" };
const SQUAD_ACCENT: Record<Squad["name"], string> = { GIRLS: "#d97fb0", BOYS: "#7fb0d9" };

interface SquadSelectorProps {
  squads: Squad[];
  activeSquadId: string | null;
  onChange: (squadId: string) => void;
}

export function SquadSelector({ squads, activeSquadId, onChange }: SquadSelectorProps) {
  if (squads.length === 0) return null;

  return (
    <div className="navbar-squad">
      <span className="navbar-squad-label">SQUAD</span>
      {squads.map((squad) => (
        <button
          key={squad.id}
          className={`squad-pill ${activeSquadId === squad.id ? "active" : ""}`}
          style={{ borderColor: activeSquadId === squad.id ? SQUAD_ACCENT[squad.name] : undefined }}
          onClick={() => onChange(squad.id)}
        >
          <span className="dot" style={{ background: SQUAD_ACCENT[squad.name] }} />
          {SQUAD_LABEL[squad.name]} <span className="count">{squad.athleteCount}</span>
        </button>
      ))}
    </div>
  );
}
