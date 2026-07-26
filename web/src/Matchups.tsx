import { useEffect, useState } from "react";
import type { Role } from "./types";

interface MatchupView {
  name: string;
  icon: string;
  wr: number;
  games: number;
}

interface MatchupReport {
  role: Role;
  sample: number;
  avgWr: number | null;
  hardest?: MatchupView[];
  easiest?: MatchupView[];
  versus?: MatchupView | null;
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

function Cell({ m, avg }: { m: MatchupView; avg: number | null }) {
  // Couleur relative au winrate moyen du champion, pas à 50 % :
  // un champion à 47 % global n'est pas "faible" partout
  const ref = avg ?? 50;
  const cls = m.wr >= ref + 1.5 ? "good" : m.wr <= ref - 1.5 ? "bad" : "";
  return (
    <span className={`mu-cell ${cls}`} title={`${m.games.toLocaleString("fr-FR")} parties`}>
      <img src={m.icon} alt="" loading="lazy" />
      <b>{pct(m.wr)}</b>
      <i>{m.name}</i>
    </span>
  );
}

export default function Matchups({
  champKey,
  role,
  enemyId,
}: {
  champKey: string;
  role: Role;
  enemyId?: string | null;
}) {
  const [data, setData] = useState<MatchupReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    const params = new URLSearchParams({ champ: champKey, role });
    if (enemyId) params.set("enemy", enemyId);
    fetch(`/api/matchups?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [champKey, role, enemyId]);

  if (failed) return null;
  if (!data) return <p className="runes-loading">Matchups…</p>;
  if (!data.sample) return null;

  return (
    <div className="matchups">
      {data.versus && (
        <p className="mu-versus">
          <img src={data.versus.icon} alt="" />
          Face à {data.versus.name} : <b>{pct(data.versus.wr)}</b> de winrate
          <span className="mu-sample"> ({data.versus.games.toLocaleString("fr-FR")} parties)</span>
        </p>
      )}
      <div className="mu-grid">
        <div>
          <p className="mu-label">Matchups défavorables</p>
          <div className="mu-row">
            {data.hardest?.map((m) => (
              <Cell key={m.name} m={m} avg={data.avgWr} />
            ))}
          </div>
        </div>
        <div>
          <p className="mu-label">Matchups favorables</p>
          <div className="mu-row">
            {data.easiest?.map((m) => (
              <Cell key={m.name} m={m} avg={data.avgWr} />
            ))}
          </div>
        </div>
      </div>
      <p className="mu-foot">
        Winrate de la partie (pas de la lane) · moyenne {data.avgWr !== null ? pct(data.avgWr) : "—"} sur{" "}
        {data.sample.toLocaleString("fr-FR")} parties · source u.gg, émeraude+
      </p>
    </div>
  );
}
