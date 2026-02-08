/**
 * Shared helpers for job-search scripts.
 * deriveTitleFromDescription: извлекает название вакансии из текста описания, если в источнике его нет.
 */
function deriveTitleFromDescription(desc) {
  if (!desc || typeof desc !== 'string' || desc.length < 20) return '';
  const s = desc.trim().slice(0, 600);
  let m = s.match(/(?:We're hiring a|We are hiring a|Hiring:)\s+([^.!?\n]+?)(?:\.|!|\?|\n|$)/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) return m[1].trim();
  m = s.match(/([A-Z][a-z].*?)\s+required\s+to\s+join/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) return m[1].trim();
  m = s.match(/(?:POSITION SUMMARY|Role:)\s*\n\s*As (?:a|an)\s+([^,!.\n]+?)(?:,|\.|\n|$)/i);
  if (m && m[1].trim().length >= 3 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/(?:As (?:a|an)\s+)([^,!.\n]+?)(?:,|\.|\n|$)/i);
  if (m && m[1].trim().length >= 3 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/(?:Job Summary|Position Summary|The Opportunity|Role):\s*\n\s*([^\n]+)/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) return m[1].trim();
  m = s.match(/([A-Z][A-Za-z\s&\-]{10,80})\s*[-–—]\s*(?:remote|location|usa|edtech)/i);
  if (m && m[1].trim().length >= 5) return m[1].trim();
  m = s.match(/^([A-Z][^\n]{15,100}?)(?:\s+\.{3}|\n\n|$)/m);
  if (m && m[1].trim().length >= 10 && m[1].trim().length <= 120) return m[1].trim();
  const firstLine = s.split('\n')[0].trim();
  if (firstLine.length >= 10 && firstLine.length <= 120 && /^[A-Za-z]/.test(firstLine) && !/^(About|We |Our |The |This |At |Why )/i.test(firstLine)) return firstLine;
  if (firstLine.length >= 10 && firstLine.length <= 120) return firstLine;
  return '';
}

module.exports = { deriveTitleFromDescription };
