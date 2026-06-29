/**
 * Shared dashboard series + aggregates from daily logs (Node + browser).
 * Depends on window.PhysicalReadiness in the browser (load physical-readiness-browser.js first).
 */
'use strict';

function num(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

function psychOr5(l, field, numFn) {
  const v = numFn(l[field]);
  return v !== null ? v : 5;
}

function avgArr(arr) {
  const vals = arr.filter(function (v) {
    return v !== null;
  });
  return vals.length === 0 ? null : vals.reduce(function (a, b) {
    return a + b;
  }, 0) / vals.length;
}

function inclusiveCalendarDays(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const a = new Date(fromStr + 'T12:00:00').getTime();
  const b = new Date(toStr + 'T12:00:00').getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function buildDashboardPayload(displayLogs, ctx) {
  const sorenessAvg = ctx.sorenessAvg;
  const tensionValue = ctx.tensionValue;
  const calculateReadiness = ctx.calculateReadiness;
  const explainReadiness = ctx.explainReadiness;
  const SPARK_MODAL_DAYS = ctx.SPARK_MODAL_DAYS || 90;
  const calendarToday = ctx.calendarToday || '';
  const dateFrom = ctx.dateFrom || '';
  const dateTo = ctx.dateTo || '';

  const windowCalendarDays = inclusiveCalendarDays(dateFrom, dateTo);

  function sorenessForChart(l) {
    if (l.muscle_soreness === undefined) return null;
    return sorenessAvg(l);
  }
  function tensionForChart(l) {
    if (l.posture_tension === undefined) return null;
    return tensionValue(l);
  }

  const emptySpark = {
    dates: [],
    labelsShort: [],
    sleepQ: [],
    energy: [],
    nutrition: [],
    sorenessAvg: [],
    tensionScore: [],
    stress: [],
    mood: [],
    mentalFatigue: [],
    readiness: [],
  };

  if (!displayLogs.length) {
    return {
      data: {
        dates: [],
        readiness: [],
        energy: [],
        sleepH: [],
        sleepQ: [],
        nutrition: [],
        steps: [],
        hrv: [],
        restingHr: [],
        weightKg: [],
        hasWeightSeries: false,
        sorenessAvg: [],
        tensionScore: [],
        stress: [],
        mood: [],
        mentalFatigue: [],
        todayExplain: null,
        sparkTrend: emptySpark,
        isLatestCalendarToday: false,
        calendarToday: calendarToday,
        avgStepsNum: null,
        stepsDaysWithData: 0,
      },
      topSoreness: [],
      topTension: [],
      avgReadiness: 0,
      avgEnergy: null,
      avgSleep: null,
      avgSleepQ: '—',
      avgNutrition: null,
      avgHrv: null,
      avgRhr: null,
      lastWeight: null,
      hasWeightSeries: false,
      hasVitalsSeries: false,
      lastReadiness: 0,
      lastReadinessColor: '#ef4444',
      latestDateStr: '',
      todayExplain: null,
      isLatestCalendarToday: false,
      windowCalendarDays: windowCalendarDays,
      sparkModalDays: SPARK_MODAL_DAYS,
    };
  }

  const dates = displayLogs.map(function (l) {
    return l.date;
  });
  const readiness = displayLogs.map(function (l) {
    return l.readiness_score ?? 0;
  });
  const energy = displayLogs.map(function (l) {
    return num(l.energy);
  });
  const sleepH = displayLogs.map(function (l) {
    return num(l.sleep_hours);
  });
  const sleepQ = displayLogs.map(function (l) {
    return num(l.sleep_quality);
  });
  const nutrition = displayLogs.map(function (l) {
    return num(l.nutrition);
  });
  const steps = displayLogs.map(function (l) {
    return num(l.steps);
  });
  const hrv = displayLogs.map(function (l) {
    return num(l.hrv);
  });
  const restingHr = displayLogs.map(function (l) {
    return num(l.resting_hr);
  });
  const weightKg = displayLogs.map(function (l) {
    return num(l.weight_kg);
  });

  const sorenessAvgSeries = displayLogs.map(sorenessForChart);
  const tensionScoreSeries = displayLogs.map(tensionForChart);
  const stressSeries = displayLogs.map(function (l) {
    return num(l.stress);
  });
  const moodSeries = displayLogs.map(function (l) {
    return num(l.mood);
  });
  const mentalFatigueSeries = displayLogs.map(function (l) {
    return num(l.mental_fatigue);
  });

  const avgReadiness =
    readiness.length > 0
      ? Math.round(
          readiness.reduce(function (a, b) {
            return a + b;
          }, 0) / readiness.length,
        )
      : 0;
  const avgEnergy = avgArr(energy);
  const avgSleep = avgArr(sleepH);
  const avgNutrition = avgArr(nutrition);
  const avgHrv = avgArr(hrv);
  const avgRhr = avgArr(restingHr);

  const sleepQVals = sleepQ.filter(function (v) {
    return v !== null;
  });
  const avgSleepQ =
    sleepQVals.length > 0
      ? (sleepQVals.reduce(function (a, b) {
          return a + b;
        }, 0) / sleepQVals.length).toFixed(1)
      : '—';

  const lastWeightLog = displayLogs
    .slice()
    .reverse()
    .find(function (l) {
      return typeof l.weight_kg === 'number';
    });
  const lastWeight = lastWeightLog ? lastWeightLog.weight_kg : null;

  const hasWeightSeries = weightKg.some(function (w) {
    return w !== null;
  });
  const hasVitalsSeries =
    hrv.some(function (v) {
      return v !== null;
    }) ||
    restingHr.some(function (v) {
      return v !== null;
    });

  const lastLog = displayLogs[displayLogs.length - 1] || {};
  const lastReadiness = lastLog.readiness_score || 0;
  const latestDateStr = lastLog.date || '';
  const isLatestCalendarToday = Boolean(latestDateStr && latestDateStr === calendarToday);
  const todayExplain = displayLogs.length ? explainReadiness(lastLog) : null;

  const recentSoreness = {};
  const recentTension = {};
  for (const log of displayLogs.slice(-14)) {
    for (const s of log.muscle_soreness || []) {
      recentSoreness[s.zone] = (recentSoreness[s.zone] || 0) + 1;
    }
    for (const t of log.posture_tension || []) {
      recentTension[t] = (recentTension[t] || 0) + 1;
    }
  }
  const topSoreness = Object.entries(recentSoreness)
    .sort(function (a, b) {
      return b[1] - a[1];
    })
    .slice(0, 5);
  const topTension = Object.entries(recentTension)
    .sort(function (a, b) {
      return b[1] - a[1];
    })
    .slice(0, 5);

  const stepsData = steps.filter(function (s) {
    return s !== null;
  });
  const stepsDaysWithData = stepsData.length;
  const avgStepsNum =
    stepsData.length > 0
      ? Math.round(
          stepsData.reduce(function (a, b) {
            return a + b;
          }, 0) / stepsData.length,
        )
      : null;

  const sparkLogs = displayLogs.slice(-SPARK_MODAL_DAYS);
  const sparkTrend = {
    dates: sparkLogs.map(function (l) {
      return l.date;
    }),
    labelsShort: sparkLogs.map(function (l) {
      return l.date && l.date.length >= 10 ? l.date.slice(5) : l.date;
    }),
    sleepQ: sparkLogs.map(function (l) {
      const v = num(l.sleep_quality);
      return v !== null ? v : 5;
    }),
    energy: sparkLogs.map(function (l) {
      const v = num(l.energy);
      return v !== null ? v : 5;
    }),
    nutrition: sparkLogs.map(function (l) {
      const v = num(l.nutrition);
      return v !== null ? v : 5;
    }),
    sorenessAvg: sparkLogs.map(function (l) {
      return sorenessAvg(l);
    }),
    tensionScore: sparkLogs.map(function (l) {
      return tensionValue(l);
    }),
    stress: sparkLogs.map(function (l) {
      return psychOr5(l, 'stress', num);
    }),
    mood: sparkLogs.map(function (l) {
      return psychOr5(l, 'mood', num);
    }),
    mentalFatigue: sparkLogs.map(function (l) {
      return psychOr5(l, 'mental_fatigue', num);
    }),
    readiness: sparkLogs.map(function (l) {
      return typeof l.readiness_score === 'number' ? l.readiness_score : calculateReadiness(l);
    }),
  };

  const data = {
    dates: dates,
    readiness: readiness,
    energy: energy,
    sleepH: sleepH,
    sleepQ: sleepQ,
    nutrition: nutrition,
    steps: steps,
    hrv: hrv,
    restingHr: restingHr,
    weightKg: weightKg,
    hasWeightSeries: hasWeightSeries,
    sorenessAvg: sorenessAvgSeries,
    tensionScore: tensionScoreSeries,
    stress: stressSeries,
    mood: moodSeries,
    mentalFatigue: mentalFatigueSeries,
    todayExplain: todayExplain,
    sparkTrend: sparkTrend,
    isLatestCalendarToday: isLatestCalendarToday,
    calendarToday: calendarToday,
    avgStepsNum: avgStepsNum,
    stepsDaysWithData: stepsDaysWithData,
  };

  return {
    data: data,
    topSoreness: topSoreness,
    topTension: topTension,
    avgReadiness: avgReadiness,
    avgEnergy: avgEnergy,
    avgSleep: avgSleep,
    avgSleepQ: avgSleepQ,
    avgNutrition: avgNutrition,
    avgHrv: avgHrv,
    avgRhr: avgRhr,
    lastWeight: lastWeight,
    hasWeightSeries: hasWeightSeries,
    hasVitalsSeries: hasVitalsSeries,
    lastReadiness: lastReadiness,
    lastReadinessColor: ctx.readinessColor ? ctx.readinessColor(lastReadiness) : lastReadiness,
    latestDateStr: latestDateStr,
    todayExplain: todayExplain,
    isLatestCalendarToday: isLatestCalendarToday,
    windowCalendarDays: windowCalendarDays,
    sparkModalDays: SPARK_MODAL_DAYS,
  };
}

/** HTML for formula breakdown block (server + browser refresh). */
function buildFormulaBreakdownHtml(todayExplain, options) {
  const calendarToday = options.calendarToday || '';
  const periodFrom = options.periodFrom || '';
  const periodTo = options.periodTo || '';
  const windowCalendarDays = options.windowCalendarDays || 0;
  const isLatestCalendarToday = options.isLatestCalendarToday;
  const latestDateStr = options.latestDateStr || '';

  if (!todayExplain) {
    return '<p class="empty-state">No log data.</p>';
  }
  const ex = todayExplain;
  const w = ex.weighted;
  const p = ex.psych;
  const pd = ex.penaltyDetail;
  const logDateLine = ex.date || latestDateStr || '—';
  const latestLogContext = isLatestCalendarToday
    ? 'Calendar <strong>' +
      calendarToday +
      '</strong>: this breakdown matches the <strong>newest</strong> log in the chart window (same day as today).'
    : 'The <strong>newest</strong> daily log in the <strong>selected period</strong> (' +
      windowCalendarDays +
      ' calendar days, ' +
      periodFrom +
      ' → ' +
      periodTo +
      ') is <strong>' +
      logDateLine +
      '</strong> — not necessarily “today” if you skipped a check-in.';
  return (
    '<p class="breakdown-section-title" style="margin-top:0">Formula detail · log date <span class="param-latest">' +
    logDateLine +
    '</span></p>' +
    '<p class="readiness-modal__hint" style="margin-bottom:10px">' +
    latestLogContext +
    '</p>' +
    '<p class="readiness-modal__hint">The five numbers below are <strong>weighted terms</strong> (each row is “scaled input × weight”). Sleep, energy, nutrition use your 0–10 answers; soreness and tension use the formulas on the left. They <strong>sum to inner ' +
    ex.baseInner.toFixed(2) +
    '</strong>; multiply by <strong>10</strong> → base <strong>' +
    ex.base.toFixed(1) +
    '</strong> on the 0–100 scale. Then stress adjustment and penalties are added; the line below is the <strong>rounded</strong> total.</p>' +
    '<p class="readiness-modal__hint" style="margin-top:6px"><strong>Weighted base</strong> (inner ' +
    ex.baseInner.toFixed(2) +
    ' → ×10 = ' +
    ex.base.toFixed(1) +
    ')</p>' +
    '<dl class="breakdown-dl">' +
    '<dt>Sleep Q × 30%</dt><dd>' +
    w.sleepQ.toFixed(2) +
    '</dd>' +
    '<dt>Energy × 25%</dt><dd>' +
    w.energy.toFixed(2) +
    '</dd>' +
    '<dt>(10 − 3·sore) × 20%</dt><dd>' +
    w.sorenessTerm.toFixed(2) +
    '</dd>' +
    '<dt>(10 − tension) × 15%</dt><dd>' +
    w.tensionTerm.toFixed(2) +
    '</dd>' +
    '<dt>Nutrition × 10%</dt><dd>' +
    w.nutrition.toFixed(2) +
    '</dd>' +
    '</dl>' +
    '<p class="breakdown-section-title">Psych + penalties → total</p>' +
    '<p class="readiness-modal__hint" style="margin-top:-4px;margin-bottom:8px">Same log (<strong>' +
    logDateLine +
    '</strong>): stress/mood/fatigue are 1–10 from check-in; adjustment and penalties apply to the base above.</p>' +
    '<dl class="breakdown-dl">' +
    '<dt>Stress / mood / mental fatigue</dt><dd>' +
    p.stress +
    ' / ' +
    p.mood +
    ' / ' +
    p.mentalFatigue +
    '</dd>' +
    '<dt>Stress adjustment</dt><dd>' +
    (p.stressAdj >= 0 ? '+' : '') +
    p.stressAdj.toFixed(2) +
    '</dd>' +
    '<dt>Illness penalty</dt><dd>' +
    (pd.illness !== 0 ? pd.illness : '0') +
    '</dd>' +
    '<dt>Alcohol penalty</dt><dd>' +
    (pd.alcohol !== 0 ? pd.alcohol : '0') +
    '</dd>' +
    '<dt><strong>Total readiness</strong></dt><dd><strong>' +
    ex.total +
    '</strong></dd>' +
    '</dl>'
  );
}

/** kind: 'soreness' | 'tension' */
function buildRecurringZonesHtml(entries, kind) {
  if (!entries || entries.length === 0) {
    return kind === 'tension'
      ? '<div class="empty-state">No recurring tension 🎉</div>'
      : '<div class="empty-state">No recurring soreness 🎉</div>';
  }
  const li = entries
    .map(function (row) {
      const zone = row[0];
      const count = row[1];
      const w = Math.round((count / 14) * 80);
      const barStyle =
        kind === 'tension' ? 'width: ' + w + 'px; background: var(--orange)' : 'width: ' + w + 'px';
      return (
        '<li>' +
        '<span>' +
        zone +
        '</span>' +
        '<div class="pattern-bar">' +
        '<div class="bar" style="' +
        barStyle +
        '"></div>' +
        '<span class="bar-count">' +
        count +
        'd</span>' +
        '</div>' +
        '</li>'
      );
    })
    .join('');
  return '<ul class="pattern-list">' + li + '</ul>';
}

/** Badge snippets match generate-dashboard paramBadge for vitals row. */
function badgeHealth() {
  return (
    '<span class="param-source param-source--health" title="Synced from Apple Health JSON export (Watch, iPhone, or devices that write to Health, e.g. Xiaomi scale via Xiaomi Home)">Apple Health</span>'
  );
}

function buildVitalsSummaryInnerHtml(p) {
  const n = p.displayCount != null ? p.displayCount : 0;
  const parts = [];
  if (p.avgHrv != null) {
    parts.push(
      '<div class="card">' +
        '<div class="card-title">Avg HRV (' +
        n +
        'd) ' +
        badgeHealth() +
        '</div>' +
        '<div class="stat-value" style="color: var(--green); font-size: 28px;">' +
        p.avgHrv.toFixed(1) +
        '</div>' +
        '<div class="stat-label">ms</div>' +
        '</div>',
    );
  }
  if (p.avgRhr != null) {
    parts.push(
      '<div class="card">' +
        '<div class="card-title">Avg Resting HR ' +
        badgeHealth() +
        '</div>' +
        '<div class="stat-value" style="color: #f472b6; font-size: 28px;">' +
        p.avgRhr.toFixed(0) +
        '</div>' +
        '<div class="stat-label">bpm</div>' +
        '</div>',
    );
  }
  if (p.lastWeight != null) {
    parts.push(
      '<div class="card">' +
        '<div class="card-title">Latest weight ' +
        badgeHealth() +
        '</div>' +
        '<div class="stat-value" style="color: var(--text); font-size: 28px;">' +
        p.lastWeight +
        '</div>' +
        '<div class="stat-label">kg · last export day · scales (e.g. Xiaomi) usually sync via Apple Health</div>' +
        '</div>',
    );
  }
  const html = parts.join('');
  return { html: html, hasAny: parts.length > 0 };
}

function buildStepsSummaryParagraphHtml(stepsDaysWithData, avgStepsNum) {
  if (stepsDaysWithData <= 0 || avgStepsNum == null) {
    return '';
  }
  return (
    '<p style="font-size: 11px; margin: 0 0 10px 0; line-height: 1.45; color: var(--text-muted);"><strong style="color: #86efac;">Average ' +
    avgStepsNum.toLocaleString() +
    ' steps/day</strong> · <strong>' +
    stepsDaysWithData +
    '</strong> day(s) with step data in this window. Yellow dashed line = period average.</p>'
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildDashboardPayload: buildDashboardPayload,
    inclusiveCalendarDays: inclusiveCalendarDays,
    buildFormulaBreakdownHtml: buildFormulaBreakdownHtml,
    buildRecurringZonesHtml: buildRecurringZonesHtml,
    buildVitalsSummaryInnerHtml: buildVitalsSummaryInnerHtml,
    buildStepsSummaryParagraphHtml: buildStepsSummaryParagraphHtml,
  };
}
if (typeof window !== 'undefined') {
  window.buildDashboardPayload = buildDashboardPayload;
  window.inclusiveCalendarDays = inclusiveCalendarDays;
  window.buildFormulaBreakdownHtml = buildFormulaBreakdownHtml;
  window.buildRecurringZonesHtml = buildRecurringZonesHtml;
  window.buildVitalsSummaryInnerHtml = buildVitalsSummaryInnerHtml;
  window.buildStepsSummaryParagraphHtml = buildStepsSummaryParagraphHtml;
}
