'use strict';

function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Teal: Remote is a separate metadata row from Contractor; preview line 1 uses location.
 * @param {object} md role.metadata from Teal extract
 * @param {object} [role] optional position row fallback
 */
function resolveTealRoleLocation(md, role = {}) {
  const locVal = normText((md.location && md.location.value) || role.location || '');
  const locIncluded = md.location ? md.location.included !== false : true;
  if (locVal) {
    return { location: locVal, locationIncluded: locIncluded };
  }
  const remoteVal = normText(md.remote && md.remote.value);
  if (remoteVal && md.remote.included !== false) {
    return { location: remoteVal, locationIncluded: true };
  }
  return { location: '', locationIncluded: locIncluded };
}

/** Teal line 2: employment type (Contractor, Full-time, …) — not Remote. */
function resolveTealEmploymentType(md, role = {}) {
  const typeVal = normText(md.employmentType && md.employmentType.value);
  if (typeVal) {
    if (md.employmentType.included === false) {
      return { employmentType: '', employmentTypeIncluded: false };
    }
    return { employmentType: typeVal, employmentTypeIncluded: true };
  }
  const contractorVal = normText(md.contractor && md.contractor.value);
  if (contractorVal) {
    if (md.contractor.included === false) {
      return { employmentType: '', employmentTypeIncluded: false };
    }
    return { employmentType: contractorVal, employmentTypeIncluded: true };
  }
  const fallback = normText(role.employmentType || '');
  return {
    employmentType: fallback,
    employmentTypeIncluded: Boolean(fallback)
  };
}

function splitTealDates(datesRaw) {
  const dates = normText(datesRaw);
  if (!dates) return { startDate: '', endDate: '' };
  const parts = dates.split(/\s*-\s*/);
  if (parts.length >= 2) {
    return { startDate: parts[0].trim(), endDate: parts.slice(1).join(' - ').trim() };
  }
  return { startDate: dates, endDate: '' };
}

function mapTealWorkExperienceCompanies(tealCompanies, uid) {
  return (tealCompanies || []).map((company, ci) => ({
    id: uid(`company-${ci}`),
    name: normText(company.name),
    description: normText(company.description),
    included: company.included !== false,
    nameIncluded: true,
    descriptionIncluded: company.descriptionIncluded === true,
    roles: (company.positions || []).map((role, ri) => {
      const md = role.metadata || {};
      const { location, locationIncluded } = resolveTealRoleLocation(md, role);
      const { employmentType, employmentTypeIncluded } = resolveTealEmploymentType(md, role);
      const { startDate, endDate } = splitTealDates(role.dates || (md.dates && md.dates.value) || '');
      return {
        id: uid(`role-${ci}-${ri}`),
        position: normText(role.title),
        location,
        employmentType,
        employmentTypeIncluded,
        positionIncluded: true,
        locationIncluded,
        startDate,
        endDate,
        included: role.included !== false,
        bulletPoints: (role.bullets || []).map((b, bi) => ({
          id: uid(`bullet-${ci}-${ri}-${bi}`),
          text: normText(b.text),
          included: b.included === true
        }))
      };
    })
  }));
}

module.exports = {
  normText,
  resolveTealRoleLocation,
  resolveTealEmploymentType,
  splitTealDates,
  mapTealWorkExperienceCompanies
};
