import { useEffect, useState } from "react";
import Fiches from "./Fiches";
import Picks from "./Picks";
import Weights from "./Weights";

export default function App() {
  const [riotId, setRiotId] = useState(() => localStorage.getItem("riotId") ?? "");
  const [inputValue, setInputValue] = useState(riotId);
  const [view, setView] = useState<"picks" | "fiches" | "calculs">("picks");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    localStorage.setItem("riotId", riotId);
  }, [riotId]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>LolPicker</h1>
          <nav className="views">
            <button className={view === "picks" ? "active" : ""} onClick={() => setView("picks")}>
              Picks
            </button>
            <button className={view === "fiches" ? "active" : ""} onClick={() => setView("fiches")}>
              Fiches
            </button>
            <button className={view === "calculs" ? "active" : ""} onClick={() => setView("calculs")}>
              Calculs
            </button>
          </nav>
        </div>
        {view === "picks" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setRiotId(inputValue.trim());
            }}
          >
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Pseudo#TAG"
              spellCheck={false}
            />
            <button type="submit">OK</button>
            <button
              type="button"
              className="refresh"
              title="Forcer le rafraîchissement des stats perso"
              onClick={() => setRefreshToken((t) => t + 1)}
            >
              ⟳
            </button>
          </form>
        )}
      </header>

      {view === "picks" && <Picks riotId={riotId} refreshToken={refreshToken} />}
      {view === "fiches" && <Fiches />}
      {view === "calculs" && <Weights />}
    </div>
  );
}
