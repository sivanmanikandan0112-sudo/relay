import { useEffect, useState } from "react";
import { api, type Athlete, type Squad } from "../lib/api";
import { SquadSelector } from "../components/SquadSelector";
import { AthleteCheckin } from "./AthleteCheckin";
import { AthleteRuns } from "./AthleteRuns";
import { HowItWorksContent } from "../components/HowItWorksContent";

interface AthleteHomeProps {
  squads: Squad[];
  squadId: string | null;
  onSquadChange: (squadId: string) => void;
}

type AthSubScreen = "checkin" | "runs" | "how";

const ATH_TABS: Array<{ key: AthSubScreen; label: string }> = [
  { key: "checkin", label: "Check-in" },
  { key: "runs", label: "My Runs" },
  { key: "how", label: "How it works" },
];

export function AthleteHome({ squads, squadId, onSquadChange }: AthleteHomeProps) {
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState<string>("");
  const [screen, setScreen] = useState<AthSubScreen>("checkin");

  useEffect(() => {
    if (!squadId) return;
    api.athletesInSquad(squadId).then((athletes) => {
      setRoster(athletes);
      setAthleteId(athletes[0]?.id ?? "");
    });
  }, [squadId]);

  const selectedAthlete = roster.find((a) => a.id === athleteId);

  return (
    <section>
      <p className="eyebrow">PREVIEWING AS</p>
      <div className="athlete-picker-row">
        <SquadSelector squads={squads} activeSquadId={squadId} onChange={onSquadChange} />
        <select className="athlete-picker" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          {roster.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <h1>Your week{selectedAthlete ? `, ${selectedAthlete.name.split(" ")[0]}` : ""}.</h1>

      <div className="athlete-subnav">
        {ATH_TABS.map((tab) => (
          <button key={tab.key} className={screen === tab.key ? "active" : ""} onClick={() => setScreen(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {athleteId && screen === "checkin" && <AthleteCheckin athleteId={athleteId} athleteName={selectedAthlete?.name ?? ""} />}
      {athleteId && screen === "runs" && <AthleteRuns athleteId={athleteId} />}
      {screen === "how" && <HowItWorksContent />}
    </section>
  );
}
