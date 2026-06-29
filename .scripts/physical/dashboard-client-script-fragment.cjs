'use strict';

/**
 * Inline <script> body for dashboard.html (embedded by generate-dashboard.cjs).
 * Interpolates ALL_LOGS and RANGE_META JSON only.
 */
function buildDashboardClientScript(allLogsJson, rangeMetaJson) {
  return `<script>
(function () {
  'use strict';
  const ALL_LOGS = ${allLogsJson};
  const RANGE_META = ${rangeMetaJson};
  const chartRegistry = { main: [], modal: [] };

  function destroyCharts(arr) {
    while (arr.length) {
      const c = arr.pop();
      try {
        c.destroy();
      } catch (e) {}
    }
  }

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8892a4', font: { size: 11 } } },
      tooltip: {
        backgroundColor: '#22263a',
        borderColor: '#2d3148',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#8892a4',
      },
    },
    scales: {
      x: {
        ticks: { color: '#8892a4', font: { size: 10 }, maxTicksLimit: 12 },
        grid: { color: '#2d3148' },
      },
      y: {
        ticks: { color: '#8892a4', font: { size: 11 } },
        grid: { color: '#2d3148' },
      },
    },
  };

  function filterLogsByRange(logs, from, to) {
    return logs.filter(function (l) {
      return l.date >= from && l.date <= to;
    });
  }

  function clampRange(from, to) {
    const dm = RANGE_META.dataMin;
    const dx = RANGE_META.dataMax;
    let f = from < dm ? dm : from;
    let t = to > dx ? dx : to;
    if (f > t) f = t;
    return { from: f, to: t };
  }

  function buildPayload(from, to) {
    const logs = filterLogsByRange(ALL_LOGS, from, to);
    return window.buildDashboardPayload(logs, {
      sorenessAvg: window.PhysicalReadiness.sorenessAvg,
      tensionValue: window.PhysicalReadiness.tensionValue,
      calculateReadiness: window.PhysicalReadiness.calculateReadiness,
      explainReadiness: window.PhysicalReadiness.explainReadiness,
      SPARK_MODAL_DAYS: RANGE_META.sparkModalDays,
      calendarToday: RANGE_META.calendarToday,
      dateFrom: from,
      dateTo: to,
      readinessColor: window.PhysicalReadiness.readinessColor,
    });
  }

  function readinessPill(score) {
    if (score >= 80) return '🟢 High';
    if (score >= 60) return '🟡 Moderate';
    if (score >= 40) return '🟠 Low';
    return '🔴 Very Low';
  }

  function updateDom(payload, from, to) {
    const d = payload.data;
    const n = d.dates.length;
    const sub = document.getElementById('dashboard-subtitle');
    if (sub) {
      sub.textContent =
        n +
        ' day' +
        (n !== 1 ? 's' : '') +
        ' in view · ' +
        from +
        ' → ' +
        to +
        ' · full vault embedded (' +
        ALL_LOGS.length +
        ' day' +
        (ALL_LOGS.length !== 1 ? 's' : '') +
        ')';
    }
    const elV = document.getElementById('stat-today-readiness-value');
    if (elV) {
      elV.textContent = String(payload.lastReadiness);
      elV.style.color = payload.lastReadinessColor;
    }
    const elD = document.getElementById('stat-today-readiness-date');
    if (elD) elD.textContent = payload.latestDateStr || '—';
    const elP = document.getElementById('stat-today-readiness-pill');
    if (elP) {
      elP.textContent = readinessPill(payload.lastReadiness);
      elP.style.background = payload.lastReadinessColor + '22';
      elP.style.color = payload.lastReadinessColor;
    }
    const elAvgL = document.getElementById('stat-avg-readiness-label');
    if (elAvgL) elAvgL.textContent = 'Avg Readiness (' + n + 'd)';
    const elAvgV = document.getElementById('stat-avg-readiness-value');
    if (elAvgV) {
      elAvgV.textContent = String(payload.avgReadiness);
      elAvgV.style.color = window.PhysicalReadiness.readinessColor(payload.avgReadiness);
    }
    const elEn = document.getElementById('stat-avg-energy-value');
    if (elEn) elEn.textContent = payload.avgEnergy != null ? payload.avgEnergy.toFixed(1) : '—';
    const elSl = document.getElementById('stat-avg-sleep-value');
    if (elSl) elSl.textContent = payload.avgSleep != null ? payload.avgSleep.toFixed(1) + 'h' : '—';
    const elSq = document.getElementById('stat-avg-sleep-label');
    if (elSq) elSq.textContent = 'per night · quality ' + payload.avgSleepQ + '/10';

    const vitRow = document.getElementById('vitals-summary-row');
    if (vitRow) {
      const vit = window.buildVitalsSummaryInnerHtml({
        avgHrv: payload.avgHrv,
        avgRhr: payload.avgRhr,
        lastWeight: payload.lastWeight,
        displayCount: n,
      });
      vitRow.innerHTML = vit.html;
      vitRow.style.display = vit.hasAny ? '' : 'none';
    }

    const stepsWrap = document.getElementById('steps-summary-wrap');
    if (stepsWrap) {
      stepsWrap.innerHTML = window.buildStepsSummaryParagraphHtml(d.stepsDaysWithData, d.avgStepsNum);
    }

    const rs = document.getElementById('recurring-soreness-body');
    if (rs) rs.innerHTML = window.buildRecurringZonesHtml(payload.topSoreness, 'soreness');
    const rt = document.getElementById('recurring-tension-body');
    if (rt) rt.innerHTML = window.buildRecurringZonesHtml(payload.topTension, 'tension');

    const bd = document.getElementById('readiness-dynamic-breakdown');
    if (bd) {
      bd.innerHTML = window.buildFormulaBreakdownHtml(payload.todayExplain, {
        calendarToday: RANGE_META.calendarToday,
        periodFrom: from,
        periodTo: to,
        windowCalendarDays: payload.windowCalendarDays,
        isLatestCalendarToday: payload.isLatestCalendarToday,
        latestDateStr: payload.latestDateStr,
      });
    }

    const ml = document.getElementById('readiness-modal-latest');
    if (ml) ml.textContent = payload.latestDateStr || '—';
    const note = document.getElementById('readiness-modal-today-note');
    if (note) {
      note.innerHTML = payload.isLatestCalendarToday
        ? ''
        : ' · calendar today is <strong>' + RANGE_META.calendarToday + '</strong>';
    }
    const sparkN = document.getElementById('spark-modal-day-count');
    if (sparkN) sparkN.textContent = String(d.sparkTrend.dates.length);

    const wcard = document.getElementById('weight-chart-card');
    if (wcard && RANGE_META.anyWeightInVault) {
      wcard.style.display = d.hasWeightSeries ? '' : 'none';
    }
  }

  function buildMainCharts(data) {
    destroyCharts(chartRegistry.main);

    chartRegistry.main.push(
      new Chart(document.getElementById('readinessChart'), {
        type: 'line',
        data: {
          labels: data.dates,
          datasets: [
            {
              label: 'Readiness',
              data: data.readiness,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: data.readiness.map(function (v) {
                return v >= 80 ? '#22c55e' : v >= 60 ? '#eab308' : v >= 40 ? '#f97316' : '#ef4444';
              }),
              pointBorderColor: 'transparent',
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            ...chartDefaults.scales,
            y: {
              ...chartDefaults.scales.y,
              min: 0,
              max: 100,
              ticks: { ...chartDefaults.scales.y.ticks, stepSize: 20 },
            },
          },
        },
      }),
    );

    chartRegistry.main.push(
      new Chart(document.getElementById('readinessBaseChart'), {
        type: 'line',
        data: {
          labels: data.dates,
          datasets: [
            {
              label: 'Sleep quality',
              data: data.sleepQ,
              borderColor: '#f9a8d4',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              spanGaps: false,
            },
            {
              label: 'Energy',
              data: data.energy,
              borderColor: '#60a5fa',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              spanGaps: false,
            },
            {
              label: 'Nutrition',
              data: data.nutrition,
              borderColor: '#34d399',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              spanGaps: false,
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 10 } },
        },
      }),
    );

    chartRegistry.main.push(
      new Chart(document.getElementById('bodyLoadChart'), {
        type: 'line',
        data: {
          labels: data.dates,
          datasets: [
            {
              label: 'Soreness avg (intensity)',
              data: data.sorenessAvg,
              borderColor: '#fb923c',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              spanGaps: false,
              yAxisID: 'y',
            },
            {
              label: 'Tension score',
              data: data.tensionScore,
              borderColor: '#a855f7',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              spanGaps: false,
              yAxisID: 'y',
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            x: chartDefaults.scales.x,
            y: {
              ...chartDefaults.scales.y,
              min: 0,
              max: 6,
              title: {
                display: true,
                text: 'Soreness ~1–3 · Tension 2 or 5',
                color: '#8892a4',
                font: { size: 10 },
              },
            },
          },
        },
      }),
    );

    function psychLine(canvasId, label, series, borderColor) {
      chartRegistry.main.push(
        new Chart(document.getElementById(canvasId), {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [
              {
                label: label,
                data: series,
                borderColor: borderColor,
                backgroundColor: 'transparent',
                tension: 0.35,
                pointRadius: 2,
                spanGaps: false,
              },
            ],
          },
          options: {
            ...chartDefaults,
            scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 10 } },
          },
        }),
      );
    }
    psychLine('psychChartStress', 'Stress', data.stress, '#f87171');
    psychLine('psychChartMood', 'Mood', data.mood, '#fbbf24');
    psychLine('psychChartMentalFatigue', 'Mental fatigue', data.mentalFatigue, '#38bdf8');

    chartRegistry.main.push(
      new Chart(document.getElementById('sleepChart'), {
        type: 'bar',
        data: {
          labels: data.dates,
          datasets: [
            {
              label: 'Sleep Hours',
              data: data.sleepH,
              backgroundColor: 'rgba(167, 139, 250, 0.6)',
              borderColor: '#a78bfa',
              borderWidth: 1,
              yAxisID: 'y',
            },
            {
              label: 'Sleep Quality',
              data: data.sleepQ,
              type: 'line',
              borderColor: '#f9a8d4',
              backgroundColor: 'transparent',
              tension: 0.4,
              pointRadius: 2,
              yAxisID: 'y2',
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            x: chartDefaults.scales.x,
            y: {
              ...chartDefaults.scales.y,
              min: 0,
              max: 12,
              position: 'left',
              title: { display: true, text: 'Hours', color: '#8892a4', font: { size: 10 } },
            },
            y2: {
              ...chartDefaults.scales.y,
              min: 0,
              max: 10,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Quality', color: '#8892a4', font: { size: 10 } },
            },
          },
        },
      }),
    );

    (function stepsChart() {
      const ds = [
        {
          label: 'Steps',
          data: data.steps,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          spanGaps: false,
        },
      ];
      if (data.avgStepsNum != null && data.dates && data.dates.length > 0) {
        ds.push({
          label: 'Period avg',
          data: data.dates.map(function () {
            return data.avgStepsNum;
          }),
          borderColor: 'rgba(250, 204, 21, 0.9)',
          backgroundColor: 'transparent',
          borderDash: [8, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
          spanGaps: true,
        });
      }
      chartRegistry.main.push(
        new Chart(document.getElementById('stepsChart'), {
          type: 'line',
          data: { labels: data.dates, datasets: ds },
          options: {
            ...chartDefaults,
            scales: {
              ...chartDefaults.scales,
              y: {
                ...chartDefaults.scales.y,
                min: 0,
                title: { display: true, text: 'Steps', color: '#8892a4', font: { size: 10 } },
              },
            },
          },
        }),
      );
    })();

    chartRegistry.main.push(
      new Chart(document.getElementById('vitalsChart'), {
        type: 'line',
        data: {
          labels: data.dates,
          datasets: [
            {
              label: 'HRV (ms)',
              data: data.hrv,
              borderColor: '#34d399',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              yAxisID: 'y',
              spanGaps: false,
            },
            {
              label: 'Resting HR (bpm)',
              data: data.restingHr,
              borderColor: '#f472b6',
              backgroundColor: 'transparent',
              tension: 0.35,
              pointRadius: 2,
              yAxisID: 'y2',
              spanGaps: false,
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            x: chartDefaults.scales.x,
            y: {
              ...chartDefaults.scales.y,
              position: 'left',
              title: { display: true, text: 'HRV (ms)', color: '#8892a4', font: { size: 10 } },
            },
            y2: {
              ...chartDefaults.scales.y,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Resting HR', color: '#8892a4', font: { size: 10 } },
            },
          },
        },
      }),
    );

    const wEl = document.getElementById('weightChart');
    if (data.hasWeightSeries && wEl) {
      chartRegistry.main.push(
        new Chart(wEl, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [
              {
                label: 'Weight (kg)',
                data: data.weightKg,
                borderColor: '#94a3b8',
                backgroundColor: 'rgba(148, 163, 184, 0.12)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                spanGaps: false,
              },
            ],
          },
          options: {
            ...chartDefaults,
            scales: {
              ...chartDefaults.scales,
              y: {
                ...chartDefaults.scales.y,
                title: { display: true, text: 'kg', color: '#8892a4', font: { size: 10 } },
              },
            },
          },
        }),
      );
    }
  }

  function buildModalCharts(ex, spark) {
    const xLabels =
      spark.labelsShort && spark.labelsShort.length === spark.dates.length
        ? spark.labelsShort
        : spark.dates.map(function (d) {
            return typeof d === 'string' && d.length >= 10 ? d.slice(5) : d;
          });
    const axisX = {
      ticks: {
        color: '#8892a4',
        maxRotation: 0,
        minRotation: 0,
        autoSkip: true,
        autoSkipPadding: 8,
        maxTicksLimit: 12,
        font: { size: 10 },
      },
      grid: { display: false },
    };
    const axisY = function (min, max) {
      return {
        ticks: { color: '#8892a4' },
        min: min,
        max: max,
        grid: { color: 'rgba(45,49,72,0.5)' },
      };
    };

    if (ex) {
      chartRegistry.modal.push(
        new Chart(document.getElementById('modalWeightedBar'), {
          type: 'bar',
          data: {
            labels: ['Sleep Q×30%', 'Energy×25%', '(10−3·sore)×20%', '(10−tens)×15%', 'Nut×10%'],
            datasets: [
              {
                data: [
                  ex.weighted.sleepQ,
                  ex.weighted.energy,
                  ex.weighted.sorenessTerm,
                  ex.weighted.tensionTerm,
                  ex.weighted.nutrition,
                ],
                backgroundColor: ['#f9a8d4', '#60a5fa', '#fb923c', '#a855f7', '#34d399'],
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#8892a4' }, grid: { display: false } },
              y: {
                beginAtZero: true,
                ticks: { color: '#8892a4' },
                grid: { color: 'rgba(45,49,72,0.5)' },
              },
            },
          },
        }),
      );
    }

    function miniLine(id, label, series, color, yMin, yMax) {
      chartRegistry.modal.push(
        new Chart(document.getElementById(id), {
          type: 'line',
          data: {
            labels: xLabels,
            datasets: [
              {
                label: label,
                data: series,
                borderColor: color,
                backgroundColor: 'transparent',
                tension: 0.35,
                pointRadius: 0,
                borderWidth: 2,
                spanGaps: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: function (items) {
                    const i = items[0] && items[0].dataIndex;
                    return i != null && spark.dates[i] ? spark.dates[i] : '';
                  },
                },
              },
            },
            scales: { x: axisX, y: axisY(yMin, yMax) },
          },
        }),
      );
    }

    miniLine('modalSparkSleep', 'Sleep Q', spark.sleepQ, '#f9a8d4', 0, 10);
    miniLine('modalSparkEnergy', 'Energy', spark.energy, '#60a5fa', 0, 10);
    miniLine('modalSparkNutrition', 'Nutrition', spark.nutrition, '#34d399', 0, 10);
    miniLine('modalSparkSoreness', 'Soreness', spark.sorenessAvg, '#fb923c', 0, 4);
    miniLine('modalSparkTension', 'Tension', spark.tensionScore, '#a855f7', 0, 6);
    miniLine('modalSparkReadiness', 'Readiness', spark.readiness, '#22c55e', 0, 100);
    miniLine('modalSparkStress', 'Stress', spark.stress, '#f87171', 0, 10);
    miniLine('modalSparkMood', 'Mood', spark.mood, '#fbbf24', 0, 10);
    miniLine('modalSparkMentalFatigue', 'Mental fatigue', spark.mentalFatigue, '#38bdf8', 0, 10);
  }

  function destroyModalCharts() {
    destroyCharts(chartRegistry.modal);
  }

  function refreshDashboard(from, to) {
    const c = clampRange(from, to);
    const fromIn = document.getElementById('range-from');
    const toIn = document.getElementById('range-to');
    if (fromIn) fromIn.value = c.from;
    if (toIn) toIn.value = c.to;
    const payload = buildPayload(c.from, c.to);
    window.__physDashLatestPayload = payload;
    destroyCharts(chartRegistry.main);
    destroyModalCharts();
    updateDom(payload, c.from, c.to);
    buildMainCharts(payload.data);
  }

  const errEl = document.getElementById('range-error');
  function showRangeErr(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || '';
  }

  const applyBtn = document.getElementById('range-apply');
  const resetBtn = document.getElementById('range-reset');
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      const f = document.getElementById('range-from') && document.getElementById('range-from').value;
      const t = document.getElementById('range-to') && document.getElementById('range-to').value;
      if (!f || !t) {
        showRangeErr('Choose both dates.');
        return;
      }
      if (f > t) {
        showRangeErr('From must be before or equal to To.');
        return;
      }
      showRangeErr('');
      refreshDashboard(f, t);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      showRangeErr('');
      refreshDashboard(RANGE_META.defaultFrom, RANGE_META.defaultTo);
    });
  }

  (function readinessModal() {
    const modal = document.getElementById('readiness-modal');
    const openEl = document.getElementById('today-readiness-card');
    const backdrop = document.getElementById('readiness-modal-backdrop');
    const closeBtn = document.getElementById('readiness-modal-close');
    const expandBtn = document.getElementById('readiness-modal-expand');
    const panel = document.getElementById('readiness-modal-panel');
    if (!modal || !openEl) return;

    function openModal() {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
      const payload = window.__physDashLatestPayload;
      const spark = payload && payload.data && payload.data.sparkTrend;
      if (typeof Chart === 'undefined' || !spark || !spark.dates || !spark.dates.length) return;
      destroyModalCharts();
      buildModalCharts(payload.todayExplain, spark);
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.classList.remove('readiness-modal--fullscreen');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (expandBtn) {
        expandBtn.setAttribute('aria-pressed', 'false');
        expandBtn.setAttribute('title', 'Full screen');
      }
      destroyModalCharts();
      openEl.focus();
    }

    openEl.addEventListener('click', openModal);
    openEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal();
      }
    });
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (expandBtn) {
      expandBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const fs = modal.classList.toggle('readiness-modal--fullscreen');
        expandBtn.setAttribute('aria-pressed', fs ? 'true' : 'false');
        expandBtn.setAttribute('title', fs ? 'Exit full screen' : 'Full screen');
      });
    }
    if (panel) {
      panel.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
  })();

  refreshDashboard(RANGE_META.defaultFrom, RANGE_META.defaultTo);
})();
</script>`;
}

module.exports = { buildDashboardClientScript };
