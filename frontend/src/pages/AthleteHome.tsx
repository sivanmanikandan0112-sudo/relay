import { useEffect, useState } from "react";
import { api, type Athlete, type Squad } from "../lib/api";
import { SquadSelector } from "../components/SquadSelector";
import { AthleteCheckin } from "./AthleteCheckin";
import { AthleteRuns } from "./AthleteRuns";
import { AthleteHowItWorks } from "./AthleteHowItWorks";

interface AthleteHomeProps {
  squads: Squad[];
  squadId: string | null;
  onSquadChange: (squadId: string) => void;
  screen: "checkin" | "runs" | "how";
}

export function AthleteHome({ squads, squadId, onSquadChange, screen }: AthleteHomeProps) {
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState<string>("");

  useEffect(() => {
    if (!squadId) return;
    api.athletesInSquad(squadId).then((athletes) => {
      setRoster(athletes);
      setAthleteId(athletes[0]?.id ?? "");
    });
  }, [squadId]);

  const selectedAthlete = roster.find((a) => a.id === athleteId);

  return (
    <>
      {/* This demo has no separate athlete login yet, so the coach previews
          any athlete's view here. Kept visually distinct from the real
          athlete nav above it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <span className="field-hint" style={{ margin: 0 }}>
          PREVIEWING AS
        </span>
        <SquadSelector squads={squads} activeSquadId={squadId} onChange={onSquadChange} />
        <select className="ath-input" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          {roster.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {athleteId && screen === "checkin" && <AthleteCheckin athleteId={athleteId} athleteName={selectedAthlete?.name ?? ""} />}
      {athleteId && screen === "runs" && <AthleteRuns athleteId={athleteId} />}
      {screen === "how" && <AthleteHowItWorks />}
    </>
  );
}
