"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { METRICS, METRIC_BY_ID, applyRelativeLift, formatMetricValue } from "@/lib/metrics";
import { riceScore, riceFormula, IMPACT_OPTIONS, sortHypotheses } from "@/lib/rice";
import { createInitialState } from "@/lib/seed";
import { exportStateJson, loadState, saveState } from "@/lib/storage";
import type { AppState, GuardrailConstraint, Hypothesis, MetricImpact } from "@/lib/types";

type Tab = "backlog" | "dashboard" | "settings";

function newId() {
  return `h-${Date.now().toString(36)}`;
}

function isLowerBetter(metricId: string) {
  return metricId === "median-ttftd" || metricId === "chargeback" || metricId === "geo-block";
}

function projectedValue(metricId: string, baseline: number, liftRel: number): number {
  return applyRelativeLift(baseline, liftRel, isLowerBetter(metricId));
}

function primaryMetricHint(h: Hypothesis): string {
  const ftd = h.primaryImpacts.find((i) => i.metricId === "ftd-7d");
  if (ftd) return `FTD ${ftd.expectedLiftRelPercent > 0 ? "+" : ""}${ftd.expectedLiftRelPercent}%`;
  const first = h.primaryImpacts[0];
  if (!first) return "No metrics linked";
  const name = METRIC_BY_ID[first.metricId]?.name ?? first.metricId;
  return `${name} ${first.expectedLiftRelPercent > 0 ? "+" : ""}${first.expectedLiftRelPercent}%`;
}

function SortableTableRow({
  hypothesis,
  active,
  onOpen,
  rank,
  onRiceChange,
}: {
  hypothesis: Hypothesis;
  active: boolean;
  onOpen: () => void;
  rank: number;
  onRiceChange: (rice: Hypothesis["rice"]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: hypothesis.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const score = riceScore(hypothesis);
  const formula = riceFormula(hypothesis);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <tr ref={setNodeRef} style={style} className={`${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}>
      <td>
        <div className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
        </div>
      </td>
      <td className="rank-cell">#{rank + 1}</td>
      <td>
        <p className="row-title" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
          {hypothesis.title}
        </p>
        <div className="row-submeta">
          <span className={`pill status-${hypothesis.status}`}>{hypothesis.status}</span>
          {hypothesis.quarter && <span className="pill quarter">{hypothesis.quarter}</span>}
          <span className="list-hint">{primaryMetricHint(hypothesis)}</span>
        </div>
      </td>
      <td className="rice-cell" onClick={stop}>
        <input
          className="cell-input"
          type="number"
          min={0}
          value={hypothesis.rice.reach}
          aria-label="Reach"
          onChange={(e) => onRiceChange({ ...hypothesis.rice, reach: Number(e.target.value) })}
        />
      </td>
      <td className="rice-cell" onClick={stop}>
        <select
          className="cell-input select"
          value={hypothesis.rice.impact}
          aria-label="Impact"
          onChange={(e) => onRiceChange({ ...hypothesis.rice, impact: Number(e.target.value) })}
        >
          {IMPACT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value}
            </option>
          ))}
        </select>
      </td>
      <td className="rice-cell" onClick={stop}>
        <input
          className="cell-input"
          type="number"
          min={0}
          max={100}
          value={hypothesis.rice.confidence}
          aria-label="Confidence percent"
          onChange={(e) => onRiceChange({ ...hypothesis.rice, confidence: Number(e.target.value) })}
        />
      </td>
      <td className="rice-cell" onClick={stop}>
        <input
          className="cell-input"
          type="number"
          min={0.5}
          step={0.5}
          value={hypothesis.rice.effort}
          aria-label="Effort person-weeks"
          onChange={(e) => onRiceChange({ ...hypothesis.rice, effort: Number(e.target.value) })}
        />
      </td>
      <td className="rice-total">
        <div className="rice-total-box">
          <div className="score-lg">{score.toFixed(1)}</div>
          <div className="formula-sm" title="RICE breakdown">
            {formula}
          </div>
        </div>
      </td>
    </tr>
  );
}

function buildFtdChartData(
  baseline: number,
  hypotheses: Hypothesis[],
  selectedId: string | null,
  cumulative: boolean
) {
  const points: { label: string; current: number; projected: number }[] = [
    { label: "Today", current: baseline, projected: baseline },
  ];

  const ordered = sortHypotheses(hypotheses, false).filter((h) =>
    h.primaryImpacts.some((i) => i.metricId === "ftd-7d")
  );

  let running = baseline;
  ordered.forEach((h) => {
    const ftdImpact = h.primaryImpacts.find((i) => i.metricId === "ftd-7d");
    if (!ftdImpact) return;
    const lift = ftdImpact.expectedLiftRelPercent;
    const next = cumulative ? running * (1 + lift / 100) : baseline * (1 + lift / 100);
    if (cumulative) running = next;
    const showProjected = cumulative || h.id === selectedId;
    points.push({
      label: h.title.length > 20 ? `${h.title.slice(0, 18)}…` : h.title,
      current: baseline,
      projected: showProjected ? (cumulative ? running : next) : baseline,
    });
  });

  if (selectedId) {
    const sel = hypotheses.find((h) => h.id === selectedId);
    const ftdImpact = sel?.primaryImpacts.find((i) => i.metricId === "ftd-7d");
    if (ftdImpact && !ordered.find((h) => h.id === selectedId)) {
      points.push({
        label: "Selected",
        current: baseline,
        projected: baseline * (1 + ftdImpact.expectedLiftRelPercent / 100),
      });
    }
  }

  return points;
}

function emptyHypothesis(sortOrder: number): Hypothesis {
  return {
    id: newId(),
    title: "New hypothesis",
    description: "",
    status: "idea",
    quarter: "Q2",
    primaryImpacts: [{ metricId: "ftd-7d", expectedLiftRelPercent: 5 }],
    guardrails: [{ metricId: "chargeback", maxWorseningRelPercent: 5 }],
    rice: { reach: 5000, impact: 1, confidence: 50, effort: 2 },
    sortOrder,
  };
}

export function GrowthBacklogApp() {
  const [state, setState] = useState<AppState>(createInitialState);
  const [tab, setTab] = useState<Tab>("backlog");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cumulativeFtd, setCumulativeFtd] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const ordered = useMemo(
    () => sortHypotheses(state.hypotheses, state.settings.useManualOrder),
    [state.hypotheses, state.settings.useManualOrder]
  );

  const selected = selectedId ? state.hypotheses.find((h) => h.id === selectedId) ?? null : null;
  const sidebarOpen = tab === "backlog" && selected !== null;

  const ftdBaseline = state.settings.baselines["ftd-7d"] ?? 12;
  const ftdChartData = useMemo(
    () => buildFtdChartData(ftdBaseline, state.hypotheses, selectedId, cumulativeFtd),
    [ftdBaseline, state.hypotheses, selectedId, cumulativeFtd]
  );

  const updateHypothesis = useCallback((id: string, patch: Partial<Hypothesis>) => {
    setState((s) => ({
      ...s,
      hypotheses: s.hypotheses.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }, []);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((h) => h.id === active.id);
    const newIndex = ordered.findIndex((h) => h.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ordered, oldIndex, newIndex).map((h, i) => ({ ...h, sortOrder: i }));
    setState((s) => ({
      ...s,
      settings: { ...s.settings, useManualOrder: true },
      hypotheses: s.hypotheses.map((h) => reordered.find((r) => r.id === h.id) ?? h),
    }));
  };

  const addHypothesis = () => {
    const h = emptyHypothesis(state.hypotheses.length);
    setState((s) => ({ ...s, hypotheses: [...s.hypotheses, h] }));
    setSelectedId(h.id);
    setTab("backlog");
  };

  const deleteHypothesis = (id: string) => {
    if (!confirm("Delete this hypothesis? This cannot be undone.")) return;
    setState((s) => ({ ...s, hypotheses: s.hypotheses.filter((h) => h.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const closeSidebar = () => setSelectedId(null);

  const exportJson = () => {
    const blob = new Blob([exportStateJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ruby-labs-growth-backlog.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetDemo = () => {
    if (!confirm("Reset all data to demo hypotheses?")) return;
    setState(createInitialState());
    setSelectedId(null);
  };

  const portfolioFtdLift = ordered
    .filter((h) => h.status !== "learned")
    .reduce((acc, h) => {
      const imp = h.primaryImpacts.find((i) => i.metricId === "ftd-7d");
      return imp ? acc * (1 + imp.expectedLiftRelPercent / 100) : acc;
    }, 1);

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Ruby Labs · Growth</span>
          <span className="brand-sub">Vegas Bonanza hypothesis backlog</span>
        </div>
        <nav className="nav-tabs" aria-label="Main">
          {(["backlog", "dashboard", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`nav-tab ${tab === t ? "active" : ""}`}
              onClick={() => {
                setTab(t);
                if (t !== "backlog") setSelectedId(null);
              }}
            >
              {t === "backlog" ? "Backlog" : t === "dashboard" ? "Dashboard" : "Settings"}
            </button>
          ))}
        </nav>
        <div className="kpi-strip">
          <div className="kpi-chip">
            <span className="k">FTD baseline</span>
            <span className="v">{ftdBaseline.toFixed(1)}%</span>
          </div>
          <div className="kpi-chip">
            <span className="k">Q target</span>
            <span className="v">+{state.settings.ftdNorthStarTargetRelPercent}%</span>
          </div>
          <div className="kpi-chip">
            <span className="k">Portfolio</span>
            <span className="v">{(ftdBaseline * portfolioFtdLift).toFixed(1)}%</span>
          </div>
        </div>
      </header>

      <div className={`main-stage ${sidebarOpen ? "sidebar-open" : ""}`}>
        {tab === "backlog" && (
          <div className="main-column-full">
            <div className="panel-head">
              <div>
                <h2>Prioritized backlog</h2>
                <p>
                  Score inline with RICE — priority {state.settings.useManualOrder ? "by drag order" : "recalculates live"}.
                  Click title for metrics & guardrails in the sidebar.
                </p>
              </div>
            </div>

            <div className="formula-banner">
              <span>
                <strong>RICE</strong> = (Reach × Impact × Confidence%) ÷ Effort
              </span>
              {!state.settings.useManualOrder && <span className="sort-live">Live sort on</span>}
            </div>

            <div className="toolbar">
              <label className="toggle-pill">
                <input
                  type="checkbox"
                  checked={state.settings.useManualOrder}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      settings: { ...s.settings, useManualOrder: e.target.checked },
                    }))
                  }
                />
                Manual drag order (freeze auto-sort)
              </label>
              <button type="button" className="btn primary" onClick={addHypothesis}>
                + New hypothesis
              </button>
              <button type="button" className="btn" onClick={exportJson}>
                Export
              </button>
            </div>

            {ordered.length === 0 ? (
              <div className="empty-state">
                No hypotheses yet.{" "}
                <button type="button" className="btn primary" onClick={addHypothesis}>
                  Add first
                </button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ordered.map((h) => h.id)} strategy={verticalListSortingStrategy}>
                  <div className="backlog-table-wrap">
                    <table className="backlog-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }} aria-label="Drag" />
                          <th style={{ width: 40 }}>#</th>
                          <th>Hypothesis</th>
                          <th className="rice-group" colSpan={4}>
                            RICE inputs (edit here)
                          </th>
                          <th className="rice-group">Score</th>
                        </tr>
                        <tr>
                          <th />
                          <th />
                          <th />
                          <th className="rice-cell">Reach</th>
                          <th className="rice-cell">Impact</th>
                          <th className="rice-cell">Conf %</th>
                          <th className="rice-cell">Effort w</th>
                          <th className="rice-total">Total + formula</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.map((h, i) => (
                          <SortableTableRow
                            key={h.id}
                            hypothesis={h}
                            rank={i}
                            active={selectedId === h.id}
                            onOpen={() => setSelectedId(h.id)}
                            onRiceChange={(rice) => updateHypothesis(h.id, { rice })}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}

        {tab === "dashboard" && (
          <div className="content-wide">
            <div className="grid-2">
              <div className="card-panel">
                <h2>FTD projection</h2>
                <p className="muted">Current vs planned impact per hypothesis.</p>
                <label className="toggle-pill" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={cumulativeFtd} onChange={(e) => setCumulativeFtd(e.target.checked)} />
                  Cumulative stack
                </label>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ftdChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,23,20,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: "#6b6560", fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={56} />
                      <YAxis tick={{ fill: "#6b6560", fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                      <Legend />
                      <ReferenceLine
                        y={ftdBaseline * (1 + state.settings.ftdNorthStarTargetRelPercent / 100)}
                        stroke="#047857"
                        strokeDasharray="4 4"
                        label="Q KPI"
                      />
                      <Line type="monotone" dataKey="current" name="Current" stroke="#9a948d" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="projected" name="Planned" stroke="#9f1239" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card-panel">
                <h2>Metric map</h2>
                <MetricMatrix hypotheses={ordered} baselines={state.settings.baselines} />
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="content-wide">
            <div className="card-panel">
              <h2>Baselines & targets</h2>
              <p className="muted">Current metric values used in projections.</p>
              <div className="rice-grid" style={{ marginTop: 16 }}>
                {METRICS.map((m) => (
                  <div key={m.id} className="field">
                    <label>{m.name}</label>
                    <input
                      type="number"
                      step={m.unit === "percent" ? 0.1 : 1}
                      value={state.settings.baselines[m.id] ?? m.defaultBaseline}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          settings: {
                            ...s.settings,
                            baselines: { ...s.settings.baselines, [m.id]: Number(e.target.value) },
                          },
                        }))
                      }
                    />
                  </div>
                ))}
                <div className="field span-2">
                  <label>Quarterly FTD KPI target (% relative)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={state.settings.ftdNorthStarTargetRelPercent}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        settings: { ...s.settings, ftdNorthStarTargetRelPercent: Number(e.target.value) },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn" onClick={resetDemo}>
                  Reset demo data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={closeSidebar}
        aria-hidden={!sidebarOpen}
      />

      <aside className={`detail-sidebar ${sidebarOpen ? "open" : ""}`} aria-hidden={!sidebarOpen}>
        {selected && (
          <>
            <div className="sidebar-header">
              <h3>{selected.title}</h3>
              <div className="sidebar-actions">
                <button type="button" className="btn icon danger" onClick={() => deleteHypothesis(selected.id)} title="Delete hypothesis" aria-label="Delete">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                  </svg>
                </button>
                <button type="button" className="btn icon ghost" onClick={closeSidebar} title="Close" aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="sidebar-scroll">
              <HypothesisDetail
                hypothesis={selected}
                baselines={state.settings.baselines}
                onChange={(patch) => updateHypothesis(selected.id, patch)}
              />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function HypothesisDetail({
  hypothesis,
  baselines,
  onChange,
}: {
  hypothesis: Hypothesis;
  baselines: Record<string, number>;
  onChange: (patch: Partial<Hypothesis>) => void;
}) {
  const score = riceScore(hypothesis);
  const setImpacts = (primaryImpacts: MetricImpact[]) => onChange({ primaryImpacts });
  const setGuardrails = (guardrails: GuardrailConstraint[]) => onChange({ guardrails });

  return (
    <>
      <div className="detail-section">
        <p className="section-label">Overview</p>
        <div className="rice-grid">
          <div className="field span-2">
            <label>Title</label>
            <input value={hypothesis.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="field span-2">
            <label>Description</label>
            <textarea value={hypothesis.description} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={hypothesis.status} onChange={(e) => onChange({ status: e.target.value as Hypothesis["status"] })}>
              <option value="idea">idea</option>
              <option value="ready">ready</option>
              <option value="running">running</option>
              <option value="shipped">shipped</option>
              <option value="learned">learned</option>
            </select>
          </div>
          <div className="field">
            <label>Quarter</label>
            <input value={hypothesis.quarter ?? ""} onChange={(e) => onChange({ quarter: e.target.value })} />
          </div>
          <div className="field span-2">
            <label>GrowthBook experiment ID</label>
            <input
              value={hypothesis.growthbookExperimentId ?? ""}
              onChange={(e) => onChange({ growthbookExperimentId: e.target.value || undefined })}
              placeholder="e.g. vb-ftd-modal-v2"
            />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <p className="section-label">RICE (read-only — edit in table)</p>
        <div className="rice-highlight">
          <span className="big">{score.toFixed(2)}</span>
          <span className="formula">{riceFormula(hypothesis)}</span>
        </div>
      </div>

      <div className="detail-section">
        <p className="section-label">Target metrics</p>
        <div className="metric-preview" style={{ marginBottom: 12 }}>
          {hypothesis.primaryImpacts.map((imp) => {
            const m = METRIC_BY_ID[imp.metricId];
            const base = baselines[imp.metricId] ?? m?.defaultBaseline ?? 0;
            const planned = projectedValue(imp.metricId, base, imp.expectedLiftRelPercent);
            return (
              <div key={imp.metricId} className="metric-preview-item">
                <span>{m?.name ?? imp.metricId}</span>
                <span>
                  {formatMetricValue(imp.metricId, base)} →{" "}
                  <span className="planned">{formatMetricValue(imp.metricId, planned)}</span>
                </span>
              </div>
            );
          })}
        </div>
        {hypothesis.primaryImpacts.map((imp, idx) => (
          <div key={idx} className="impact-row">
            <select
              value={imp.metricId}
              onChange={(e) => {
                const next = [...hypothesis.primaryImpacts];
                next[idx] = { ...imp, metricId: e.target.value };
                setImpacts(next);
              }}
            >
              {METRICS.filter((m) => m.layer !== "guardrail").map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={imp.expectedLiftRelPercent}
              title="Relative % lift"
              onChange={(e) => {
                const next = [...hypothesis.primaryImpacts];
                next[idx] = { ...imp, expectedLiftRelPercent: Number(e.target.value) };
                setImpacts(next);
              }}
            />
            <button type="button" className="btn icon danger" onClick={() => setImpacts(hypothesis.primaryImpacts.filter((_, i) => i !== idx))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setImpacts([...hypothesis.primaryImpacts, { metricId: "ftd-7d", expectedLiftRelPercent: 3 }])}>
          + Add metric
        </button>
      </div>

      <div className="detail-section">
        <p className="section-label">Guardrails</p>
        {hypothesis.guardrails.map((g, idx) => (
          <div key={idx} className="impact-row">
            <select
              value={g.metricId}
              onChange={(e) => {
                const next = [...hypothesis.guardrails];
                next[idx] = { ...g, metricId: e.target.value };
                setGuardrails(next);
              }}
            >
              {METRICS.filter((m) => m.layer === "guardrail").map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={g.maxWorseningRelPercent}
              title="Max worsening %"
              onChange={(e) => {
                const next = [...hypothesis.guardrails];
                next[idx] = { ...g, maxWorseningRelPercent: Number(e.target.value) };
                setGuardrails(next);
              }}
            />
            <button type="button" className="btn icon danger" onClick={() => setGuardrails(hypothesis.guardrails.filter((_, i) => i !== idx))}>
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => setGuardrails([...hypothesis.guardrails, { metricId: "chargeback", maxWorseningRelPercent: 5 }])}
        >
          + Add guardrail
        </button>
      </div>
    </>
  );
}

function MetricMatrix({
  hypotheses,
  baselines,
}: {
  hypotheses: Hypothesis[];
  baselines: Record<string, number>;
}) {
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Hypothesis</th>
            <th>Metric</th>
            <th>Baseline</th>
            <th>Planned</th>
            <th>RICE</th>
          </tr>
        </thead>
        <tbody>
          {hypotheses.flatMap((h) =>
            h.primaryImpacts.map((imp) => {
              const m = METRIC_BY_ID[imp.metricId];
              const base = baselines[imp.metricId] ?? m?.defaultBaseline ?? 0;
              const planned = projectedValue(imp.metricId, base, imp.expectedLiftRelPercent);
              return (
                <tr key={`${h.id}-${imp.metricId}`}>
                  <td>{h.title}</td>
                  <td>
                    <span className="pill metric">{m?.name ?? imp.metricId}</span>
                  </td>
                  <td>{formatMetricValue(imp.metricId, base)}</td>
                  <td style={{ color: "var(--success)", fontWeight: 600 }}>
                    {formatMetricValue(imp.metricId, planned)}
                    <span className="muted" style={{ marginLeft: 6 }}>
                      ({imp.expectedLiftRelPercent > 0 ? "+" : ""}
                      {imp.expectedLiftRelPercent}%)
                    </span>
                  </td>
                  <td>{riceScore(h).toFixed(1)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
