/**
 * Player theme. Injected once per document; every rule is scoped to `.tl-`
 * classes and every colour is a custom property, so hosts can restyle without
 * forking the component.
 */

const STYLE_ID = 'tabloom-theme';

export const themeStyles = `
.tl-player{
  --tl-bg:#0f0f0f;
  --tl-panel:#161616;
  --tl-panel-2:#222;
  --tl-line:#333;
  --tl-line-soft:#222;
  --tl-ink:#f2f2f2;
  --tl-muted:#bbb;
  --tl-dim:#3a3a3a;
  --tl-accent:#ffcf4d;
  --tl-accent-ink:#000;
  --tl-good:#7cfc98;
  --tl-radius:8px;
  --tl-font:Consolas,Menlo,ui-monospace,monospace;
  --tl-ui-font:system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--tl-bg);
  color:var(--tl-ink);
  font-family:var(--tl-font);
  padding:0 0 24px;
}
.tl-player *{box-sizing:border-box}

.tl-header{padding:12px 12px 2px}
.tl-header h1{font-size:20px;margin:0;font-family:var(--tl-ui-font)}
.tl-sub{color:var(--tl-muted);font-size:13px;margin-top:4px;font-family:var(--tl-ui-font);line-height:1.45}

.tl-controls{
  position:sticky;top:0;z-index:5;
  background:var(--tl-bg);
  padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  border-bottom:1px solid var(--tl-line);
}
.tl-player button{
  background:var(--tl-accent);color:var(--tl-accent-ink);
  border:0;border-radius:var(--tl-radius);padding:8px 12px;
  font-weight:800;cursor:pointer;font-family:inherit;font-size:14px;
}
.tl-player button:hover{filter:brightness(1.08)}
.tl-player button.tl-ghost{background:#2c2c2c;color:#fff}
.tl-player button.tl-on{background:var(--tl-good);color:#000}
.tl-now{
  font-size:15px;background:#1c1607;border:1px solid var(--tl-accent);
  border-radius:var(--tl-radius);padding:7px 12px;
}
.tl-now b{color:var(--tl-accent);font-size:18px}
.tl-now span{color:#999;font-size:13px}

.tl-progress{height:6px;background:#262626;border-radius:99px;overflow:hidden;margin:8px 12px 0}
.tl-progress-fill{height:100%;width:0;background:var(--tl-accent);transition:width .08s linear}

.tl-fretboard{
  display:grid;gap:4px;margin:10px 12px 0;
  font-family:var(--tl-ui-font);
}
.tl-fretboard>div{background:var(--tl-panel-2);border-radius:6px;padding:6px 2px;text-align:center;font-size:12px}
.tl-fb-corner{background:transparent!important}
.tl-fb-head{font-weight:800;color:var(--tl-accent)}
.tl-fb-fret{color:var(--tl-muted);font-weight:700}
.tl-fb-cell{color:var(--tl-dim)}
.tl-fb-cell.tl-hot,.tl-fretboard>div.tl-hot{background:var(--tl-accent);color:#000;font-weight:800}

.tl-filters{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px 0;align-items:center}
.tl-filters span{color:#888;font-family:var(--tl-ui-font);font-size:13px}
.tl-filters button{padding:6px 10px;font-size:12px}

.tl-staff{padding:0 12px}
.tl-section{margin-top:14px}
.tl-section-title{
  color:var(--tl-accent);font-size:14px;margin:0 0 6px;
  display:flex;gap:8px;align-items:baseline;font-family:var(--tl-ui-font);
}
.tl-section-index{
  background:var(--tl-accent);color:#000;border-radius:4px;
  padding:0 5px;font-weight:800;font-size:12px;
}
.tl-section-count{color:#888;font-size:12px;margin-left:auto;font-weight:400}

.tl-card{background:var(--tl-panel);border:1px solid var(--tl-line);border-radius:var(--tl-radius);overflow:hidden}
.tl-card-bar{
  padding:6px 10px;color:var(--tl-good);font-weight:bold;
  border-bottom:1px solid #2a2a2a;font-size:12px;
}
.tl-scroll{overflow-x:auto}
table.tl-grid{width:100%;border-collapse:collapse;table-layout:fixed;border-spacing:0}
table.tl-grid th,table.tl-grid td{border-right:1px solid var(--tl-line-soft);text-align:center}
table.tl-grid td.tl-cell{font-size:20px;height:28px;padding:2px 1px;line-height:1.15}
table.tl-grid td.tl-bar{width:6px;padding:0;border-right:2px solid #666;background:transparent}
table.tl-grid th.tl-string{
  width:38px;color:#fff;font-size:14px;font-weight:800;
  background:#000;border-right:2px solid var(--tl-accent);
}
table.tl-grid th.tl-string.tl-hot{background:var(--tl-accent);color:#000}
.tl-note{background:var(--tl-accent);color:#000;border-radius:6px;display:inline-block;min-width:1.3em;font-weight:800}
.tl-rest{color:var(--tl-dim)}
td.tl-cur{background:#2a230f;box-shadow:inset 0 0 0 2px var(--tl-accent)}
tr.tl-beats td{font-size:11px;color:var(--tl-accent);font-weight:800;height:auto;padding:1px;font-family:var(--tl-ui-font)}
tr.tl-beats th.tl-string{color:var(--tl-accent);font-size:11px}
tr.tl-names td{font-size:11px;color:#eee;font-weight:700;height:auto;padding:2px 1px;font-family:var(--tl-ui-font);border-top:1px solid #2a2a2a}

.tl-foot{padding:18px 12px 0;color:#666;font-size:12px;font-family:var(--tl-ui-font)}
.tl-foot a{color:#8ecbff}

@media (max-width:640px){
  .tl-now{order:10;width:100%}
  table.tl-grid td.tl-cell{font-size:16px}
}
`;

/** Inject the stylesheet once into a document. */
export function ensureTheme(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return false;
  if (doc.getElementById(STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = themeStyles;
  doc.head.appendChild(style);
  return true;
}
