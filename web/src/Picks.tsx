import { useEffect, useMemo, useRef, useState } from "react";
import type { DraftResult, Role, TeamAnalysis } from "./types";
import { Row } from "./Row";

interface ChampLite {
  id: string;
  key: string;
  name: string;
  icon: string;
}

const ROLE_LABELS: Record<Role, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.round(min / 60)} h`;
}

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

function TeamPanel({
  title,
  team,
  champs,
  onRemove,
  active,
  onSelect,
}: {
  title: string;
  team: TeamAnalysis | null;
  champs: ChampLite[];
  onRemove: (id: string) => void;
  active: boolean;
  onSelect: () => void;
}) {
  const byId = useMemo(() => new Map(champs.map((c) => [c.id, c])), [champs]);
  const picks = team?.picks ?? [];
  return (
    <div className={`team ${active ? "active" : ""}`} onClick={onSelect}>
      <p className="team-title">
        {title} {active && <span className="team-hint">← clique un champion pour l'ajouter</span>}
      </p>
      <div className="team-slots">
        {[0, 1, 2, 3, 4].map((i) => {
          const c = picks[i] ? byId.get(picks[i]) : null;
          const lane = team?.lanes?.[i];
          return c ? (
            <div key={i} className="slot">
              <img
                src={c.icon}
                alt={c.name}
                title={`${c.name} — clique pour retirer`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(c.id);
                }}
              />
              <span className="slot-lane">{lane ? ROLE_LABELS[lane] : "?"}</span>
            </div>
          ) : (
            <span key={i} className="slot-empty" />
          );
        })}
      </div>
      {team && team.picks.length >= 3 && (
        <>
          <Gauge label="CC" value={team.gauges.cc} />
          <Gauge label="Frontline" value={team.gauges.frontline} />
          <Gauge label="Engage" value={team.gauges.engage} />
          <Gauge label="Peel" value={team.gauges.peel} />
          <Gauge label="% AD" value={team.gauges.adPct} />
          <div className="team-labels">
            {team.labels.map((l) => (
              <span key={l} className="chip style">
                {l}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface MatchupEntry {
  name: string;
  icon: string;
  wr: number;
  games: number;
  tips: string[];
}

// Un matchup défavorable : winrate en rouge, dépliable sur les conseils
function BadMatchup({ m }: { m: MatchupEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="th-row">
      <div className="th-head" onClick={() => setOpen(!open)}>
        <img src={m.icon} alt="" loading="lazy" />
        <span className="th-name">{m.name}</span>
        <b className="th-wr bad">{m.wr.toFixed(1).replace(".", ",")} %</b>
        <span className="th-chevron">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <ul className="th-tips">
          <li className="th-meta">
            {m.games.toLocaleString("fr-FR")} parties dans ce duel
          </li>
          {m.tips.length ? (
            m.tips.map((tip, i) => <li key={i}>{tip}</li>)
          ) : (
            <li className="th-none">Pas encore de conseil pour ce champion.</li>
          )}
        </ul>
      )}
    </div>
  );
}

// Panneau rouge : les matchups défavorables du champion sélectionné
function BadMatchups({ champKey, champName, role }: { champKey: string | null; champName: string | null; role: Role }) {
  const [data, setData] = useState<{ hardest?: MatchupEntry[]; avgWr?: number | null; sample?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!champKey) { setData(null); return; }
    setLoading(true);
    fetch(`/api/matchups?champ=${champKey}&role=${role}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [champKey, role]);

  return (
    <section className="side-card side-threats">
      <p className="side-title">
        Matchups défavorables
        {champName && <span className="side-sub"> — {champName}</span>}
      </p>
      {!champKey ? (
        <p className="side-empty">
          Clique un champion dans la liste de gauche pour voir contre qui il souffre, et comment
          jouer face à eux.
        </p>
      ) : loading ? (
        <p className="side-empty">Chargement…</p>
      ) : !data?.hardest?.length ? (
        <p className="side-empty">Pas assez de données pour ce champion à ce rôle.</p>
      ) : (
        <>
          {data.hardest.map((m) => (
            <BadMatchup key={m.name} m={m} />
          ))}
          <p className="side-foot">
            Winrate de {champName} dans le duel · moyenne{" "}
            {data.avgWr !== null && data.avgWr !== undefined
              ? `${data.avgWr.toFixed(1).replace(".", ",")} %`
              : "—"}{" "}
            · déplie une ligne pour les conseils
          </p>
        </>
      )}
    </section>
  );
}

export default function Picks({ riotId, refreshToken }: { riotId: string; refreshToken: number }) {
  const [champs, setChamps] = useState<ChampLite[]>([]);
  const [ally, setAlly] = useState<string[]>([]);
  const [enemy, setEnemy] = useState<string[]>([]);
  const [activeTeam, setActiveTeam] = useState<"ally" | "enemy">("enemy");
  const [role, setRole] = useState<Role>(() => (localStorage.getItem("role") as Role) ?? "top");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lcuOn, setLcuOn] = useState(() => localStorage.getItem("lcuOn") === "1");
  const [lcuStatus, setLcuStatus] = useState<"off" | "waiting" | "noclient" | "live">("off");
  const debounce = useRef<number>();
  const lastRefresh = useRef(refreshToken);

  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChamps(d.champions))
      .catch(() => setError("Impossible de charger les champions"));
  }, []);

  useEffect(() => {
    localStorage.setItem("role", role);
  }, [role]);

  // Synchronisation avec le champ select du client LoL (LCU, serveur local)
  useEffect(() => {
    localStorage.setItem("lcuOn", lcuOn ? "1" : "0");
    if (!lcuOn) {
      setLcuStatus("off");
      return;
    }
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/lcu/draft");
        const d = await res.json();
        if (stop) return;
        if (!d.connected) setLcuStatus("noclient");
        else if (!d.inChampSelect) setLcuStatus("waiting");
        else {
          setLcuStatus("live");
          setAlly((prev) => (JSON.stringify(prev) === JSON.stringify(d.ally) ? prev : d.ally));
          setEnemy((prev) => (JSON.stringify(prev) === JSON.stringify(d.enemy) ? prev : d.enemy));
          if (d.myRole) setRole((prev) => (prev === d.myRole ? prev : d.myRole));
        }
      } catch {
        if (!stop) setLcuStatus("noclient");
      }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [lcuOn]);

  useEffect(() => {
    const isRefresh = refreshToken !== lastRefresh.current;
    lastRefresh.current = refreshToken;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      if (isRefresh) setRefreshing(true);
      try {
        const params = new URLSearchParams({
          ally: ally.join(","),
          enemy: enemy.join(","),
          role,
          riotId,
        });
        if (isRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/draft?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setResult(json);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setRefreshing(false);
      }
    }, 250);
    return () => window.clearTimeout(debounce.current);
  }, [ally, enemy, role, riotId, refreshToken]);

  const picked = useMemo(() => new Set([...ally, ...enemy]), [ally, enemy]);
  const filtered = useMemo(
    () => champs.filter((c) => !picked.has(c.id) && norm(c.name).includes(norm(query))).slice(0, 24),
    [champs, picked, query],
  );

  const add = (id: string) => {
    if (activeTeam === "ally" && ally.length < 5) setAlly([...ally, id]);
    if (activeTeam === "enemy" && enemy.length < 5) setEnemy([...enemy, id]);
  };

  const p = result?.player;
  const draftEmpty = ally.length + enemy.length === 0;

  // Adversaire probable de ta lane (pour les conseils de runes)
  const enemyLaner = useMemo(() => {
    if (!result) return null;
    const i = result.enemy.lanes.findIndex((l) => l === role);
    return i >= 0 ? result.enemy.picks[i] : null;
  }, [result, role]);

  const LCU_LABELS: Record<typeof lcuStatus, string> = {
    off: "Auto : client LoL",
    noclient: "Client LoL non détecté",
    waiting: "En attente d'un champ select…",
    live: "Champ select suivi en direct",
  };

  // Champion sélectionné dans la liste de gauche : pilote le panneau rouge.
  // Par défaut, la meilleure recommandation.
  const recos = useMemo(
    () => [...(result?.recommendations.pool ?? []), ...(result?.recommendations.discover ?? [])],
    [result],
  );
  const selected = useMemo(
    () => recos.find((r) => r.key === selectedKey) ?? recos[0] ?? null,
    [recos, selectedKey],
  );

  return (
    <div className="picks-layout">
      <div className="picks-main">
      {result && (
        <p className="status">
          <span className="patch-inline">Patch {result.patch.display}</span>
          {p?.personalAvailable ? (
            <>
              {" · "}
              {p.analyzedMatches} parties analysées pour {p.riotId} · stats perso{" "}
              {timeAgo(p.fetchedAt)}
              {p.pendingMatches > 0 && (
                <> · encore {p.pendingMatches} parties à récupérer — clique ⟳ dans ~2 min</>
              )}
              {p.profile && p.profile.topTags.length > 0 && (
                <> · ton style : {p.profile.topTags.join(" / ")}</>
              )}
            </>
          ) : (
            <>
              {" · "}
              <span className="warn">
                Stats perso indisponibles{p?.personalError ? ` : ${p.personalError}` : ""} — scores
                basés sur le patch.
              </span>
            </>
          )}
          {refreshing && (
            <>
              {" · "}
              <em>actualisation…</em>
            </>
          )}
        </p>
      )}

      <div className="lcu-bar">
        <button className={`lcu-toggle ${lcuOn ? lcuStatus : ""}`} onClick={() => setLcuOn(!lcuOn)}>
          {lcuOn ? "● " : "○ "}
          {LCU_LABELS[lcuOn ? lcuStatus : "off"]}
        </button>
        {lcuOn && lcuStatus === "noclient" && (
          <span className="lcu-help">lance le client LoL sur ce PC, la draft se remplira toute seule</span>
        )}
      </div>

      <div className="draft-teams">
        <TeamPanel
          title="Ton équipe"
          team={result?.ally ?? null}
          champs={champs}
          onRemove={(id) => setAlly(ally.filter((x) => x !== id))}
          active={activeTeam === "ally"}
          onSelect={() => setActiveTeam("ally")}
        />
        <TeamPanel
          title="Ennemis"
          team={result?.enemy ?? null}
          champs={champs}
          onRemove={(id) => setEnemy(enemy.filter((x) => x !== id))}
          active={activeTeam === "enemy"}
          onSelect={() => setActiveTeam("enemy")}
        />
      </div>

      <p className="draft-hint">
        {draftEmpty
          ? "Score général du patch. Ajoute les champions de la draft ci-dessus pour ajuster les scores à la partie en cours."
          : "Scores ajustés à la draft en cours (le chiffre coloré indique l'écart avec le score général)."}
      </p>

      <input
        className="fiche-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Ajouter un champion (${activeTeam === "ally" ? "ton équipe" : "ennemis"})…`}
        spellCheck={false}
      />
      {query && (
        <div className="fiche-grid draft-picker">
          {filtered.map((c) => (
            <button key={c.id} className="tile" onClick={() => add(c.id)}>
              <img src={c.icon} alt="" loading="lazy" />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="roles">
        {ROLES.map((r) => (
          <button key={r} className={r === role ? "active" : ""} onClick={() => setRole(r)}>
            {ROLE_LABELS[r]}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}
      {!result && !error && <p className="loading">Chargement…</p>}

      {result && (
        <main>
          {result.recommendations.pool.length > 0 && (
            <>
              <h2>Ton pool</h2>
              {result.recommendations.pool.map((rec) => (
                <Row
                  key={rec.key}
                  rec={rec}
                  role={role}
                  enemyId={enemyLaner}
                  selected={rec.key === selected?.key}
                  onSelect={() => setSelectedKey(rec.key)}
                />
              ))}
            </>
          )}
          <h2>À découvrir</h2>
          {result.recommendations.discover.map((rec) => (
            <Row
              key={rec.key}
              rec={rec}
              discover
              role={role}
              enemyId={enemyLaner}
              selected={rec.key === selected?.key}
              onSelect={() => setSelectedKey(rec.key)}
            />
          ))}
        </main>
      )}
      </div>

      <aside className="picks-side">
        <section className="side-card side-items">
          <p className="side-title">Objets</p>
          <p className="side-empty">
            Recommandations d'achat selon la draft — à venir.
          </p>
        </section>

        <BadMatchups champKey={selected?.key ?? null} champName={selected?.name ?? null} role={role} />
      </aside>
    </div>
  );
}
