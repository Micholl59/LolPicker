import { useEffect, useState } from "react";
import type { Recommendation, Role } from "./types";

export function scoreClass(score: number): string {
  if (score >= 72) return "score high";
  if (score >= 55) return "score mid";
  return "score low";
}

interface RunePageView {
  wr: number | null;
  matches: number;
  primary: { name: string; icon: string };
  sub: { name: string; icon: string };
  keystone: { name: string; icon: string; desc: string } | null;
  primaryMinors: { name: string; icon: string }[];
  subMinors: { name: string; icon: string }[];
}

interface RunesResponse {
  page: RunePageView | null;
  hint: { keystone: { name: string; icon: string } | null; note: string } | null;
}

function Runes({ champKey, role, enemyId }: { champKey: string; role: Role; enemyId: string | null }) {
  const [data, setData] = useState<RunesResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ champ: champKey, role });
    if (enemyId) params.set("enemy", enemyId);
    fetch(`/api/runes?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [champKey, role, enemyId]);

  if (failed) return null;
  if (!data) return <p className="runes-loading">Runes…</p>;
  if (!data.page && !data.hint) return null;

  const p = data.page;
  return (
    <div className="runes">
      {p && (
        <div className="runes-page">
          {p.keystone && (
            <span className="runes-keystone" title={p.keystone.desc}>
              <img src={p.keystone.icon} alt="" />
              <b>{p.keystone.name}</b>
            </span>
          )}
          <span className="runes-minors">
            {p.primaryMinors.map((m) => (
              <img key={m.name} src={m.icon} alt={m.name} title={m.name} />
            ))}
            <i className="runes-sep" title={p.sub.name}>
              + {p.sub.name} :
            </i>
            {p.subMinors.map((m) => (
              <img key={m.name} src={m.icon} alt={m.name} title={m.name} />
            ))}
          </span>
          {p.wr !== null && (
            <span className="runes-wr">
              {p.wr.toFixed(1).replace(".", ",")} % WR · {p.matches.toLocaleString("fr-FR")} parties
            </span>
          )}
        </div>
      )}
      {data.hint && (
        <p className="runes-hint">
          {data.hint.keystone && <img src={data.hint.keystone.icon} alt="" />}
          {data.hint.note}
        </p>
      )}
    </div>
  );
}

export function Row({
  rec,
  discover,
  role,
  enemyId,
}: {
  rec: Recommendation;
  discover?: boolean;
  role?: Role;
  enemyId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`row ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="row-main">
        <span className={scoreClass(rec.score) + (discover ? " discover" : "")}>
          {rec.score}
          {rec.draftDelta !== undefined && rec.draftDelta !== 0 && (
            <em className={`delta ${rec.draftDelta > 0 ? "up" : "down"}`}>
              {rec.draftDelta > 0 ? "+" : "−"}
              {Math.abs(rec.draftDelta)}
            </em>
          )}
        </span>
        <img src={rec.icon} alt="" loading="lazy" />
        <div className="row-text">
          <p className="row-name">
            {rec.name} <span className="row-title">{rec.title}</span>
            {rec.archetype && <span className="chip">{rec.archetype}</span>}
            {rec.styleTags.map((t) => (
              <span key={t} className="chip style">
                {t}
              </span>
            ))}
          </p>
          <p className="row-reason">{rec.reason}</p>
        </div>
        <div className="row-stats">
          {rec.wrPatch !== null && <span>{rec.wrPatch.toFixed(1).replace(".", ",")} % patch</span>}
          {rec.persoWr !== null && rec.persoKda !== null && <span>{rec.persoKda} KDA</span>}
        </div>
      </div>
      {open && (
        <div className="row-detail" onClick={(e) => e.stopPropagation()}>
          {role && <Runes champKey={rec.key} role={role} enemyId={enemyId ?? null} />}
          {rec.plan ? (
            <dl className="plan">
              <dt>Early</dt>
              <dd>{rec.plan.early}</dd>
              <dt>Mid</dt>
              <dd>{rec.plan.mid}</dd>
              <dt>Late</dt>
              <dd>{rec.plan.late}</dd>
              <dt>Draft</dt>
              <dd>{rec.plan.draft}</dd>
            </dl>
          ) : (
            <p className="blurb">{rec.blurb}</p>
          )}
          {/* Tips bruts de Riot (Data Dragon) : seulement en l'absence de plan
              vérifié, car ils sont parfois anciens/imprécis */}
          {!rec.plan && rec.tips.length > 0 && (
            <ul>
              {rec.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
