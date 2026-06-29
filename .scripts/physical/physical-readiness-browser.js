/**
 * Browser copy of readiness math (keep in sync with physical-readiness.cjs).
 * Loaded by dashboard.html before dashboard-payload.js.
 */
(function (g) {
  'use strict';

  function sorenessAvg(data) {
    if (!data.muscle_soreness || data.muscle_soreness.length === 0) return 1;
    return (
      data.muscle_soreness.reduce(function (s, z) {
        return s + (z.intensity || 2);
      }, 0) / data.muscle_soreness.length
    );
  }

  function tensionValue(data) {
    return data.posture_tension && data.posture_tension.length > 0 ? 5 : 2;
  }

  function calculateReadiness(data) {
    const sleepQ = data.sleep_quality ?? 5;
    const energy = data.energy ?? 5;
    const soreness = sorenessAvg(data);
    const tension = tensionValue(data);
    const nutrition = data.nutrition ?? 5;

    let base =
      (sleepQ * 0.3 +
        energy * 0.25 +
        (10 - soreness * 3) * 0.2 +
        (10 - tension) * 0.15 +
        nutrition * 0.1) *
      10;

    const stress = data.stress ?? 5;
    const mood = data.mood ?? 5;
    const mentalFatigue = data.mental_fatigue ?? 5;
    const stressAdj = (((5 - stress) + (5 - mood) + (5 - mentalFatigue)) / 3) * 2.2;

    let penalty = 0;
    if (data.illness && data.illness.active) penalty -= 18;
    if (data.alcohol && data.alcohol.had) {
      const u = Number(data.alcohol.units) || 0;
      if (u >= 4) penalty -= 10;
      else if (u >= 2) penalty -= 5;
      else penalty -= 2;
    }

    const raw = base + stressAdj + penalty;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  function explainReadiness(data) {
    const sleepQ = data.sleep_quality ?? 5;
    const energy = data.energy ?? 5;
    const soreness = sorenessAvg(data);
    const tension = tensionValue(data);
    const nutrition = data.nutrition ?? 5;
    const termSore = 10 - soreness * 3;
    const termTension = 10 - tension;
    const weighted = {
      sleepQ: sleepQ * 0.3,
      energy: energy * 0.25,
      sorenessTerm: termSore * 0.2,
      tensionTerm: termTension * 0.15,
      nutrition: nutrition * 0.1,
    };
    const baseInner =
      weighted.sleepQ +
      weighted.energy +
      weighted.sorenessTerm +
      weighted.tensionTerm +
      weighted.nutrition;
    const base = baseInner * 10;

    const stress = data.stress ?? 5;
    const mood = data.mood ?? 5;
    const mentalFatigue = data.mental_fatigue ?? 5;
    const stressAdj = (((5 - stress) + (5 - mood) + (5 - mentalFatigue)) / 3) * 2.2;

    let penalty = 0;
    const penaltyDetail = { illness: 0, alcohol: 0 };
    if (data.illness && data.illness.active) {
      penalty -= 18;
      penaltyDetail.illness = -18;
    }
    if (data.alcohol && data.alcohol.had) {
      const u = Number(data.alcohol.units) || 0;
      if (u >= 4) {
        penalty -= 10;
        penaltyDetail.alcohol = -10;
      } else if (u >= 2) {
        penalty -= 5;
        penaltyDetail.alcohol = -5;
      } else {
        penalty -= 2;
        penaltyDetail.alcohol = -2;
      }
    }

    const raw = base + stressAdj + penalty;
    const total = Math.max(0, Math.min(100, Math.round(raw)));

    return {
      date: data.date || null,
      inputs: {
        sleepQ: sleepQ,
        energy: energy,
        nutrition: nutrition,
        sorenessAvg: soreness,
        tension: tension,
        termSore: termSore,
        termTension: termTension,
      },
      weighted: weighted,
      baseInner: baseInner,
      base: base,
      psych: { stress: stress, mood: mood, mentalFatigue: mentalFatigue, stressAdj: stressAdj },
      penalty: penalty,
      penaltyDetail: penaltyDetail,
      raw: raw,
      total: total,
    };
  }

  function readinessColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  }

  g.PhysicalReadiness = {
    sorenessAvg: sorenessAvg,
    tensionValue: tensionValue,
    calculateReadiness: calculateReadiness,
    explainReadiness: explainReadiness,
    readinessColor: readinessColor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
