'use strict';
function validate(raw, facts, coach = false) {
  let text = String(raw || '');
  if (coach) {
    try { text = JSON.parse(text).text; } catch { return null; }
  }
  if (typeof text !== 'string') return null;
  text = text.replace(/https?:\/\/[^\s<>]+/gi, '').replace(/www\.[^\s<>]+/gi, '').trim();
  if (!text || Array.from(text).length > (coach ? 110 : 3000)) return null;
  if (/[|\x00-\x08\x0b-\x1f]/.test(text) || /```|(?:^|\n)\s*\/(?:run|script|cast|click)\b/i.test(text)) return null;
  const positions = text.replace(/\blevels?\s+\d+(?:\s*(?:,|and|to|[-–])\s*\d+)*/gi, "")
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?=\s+(?:xp|experience|copper|silver|gold|health|mana|yards?|yd)\b)/gi, '');
  if (/\b\d{1,3}(?:\.\d+)?\s*[,;]\s*\d{1,3}(?:\.\d+)?\b|\b(?:x|y|coords?|coordinates)\s*[:=]\s*\d/i.test(positions)) return null;
  let good = true;
  let expanded = text;
  const remaining = text.replace(/\{([qnoiz]):(\d+)\}/g, (_, kind, id) => {
    if (!facts[kind]?.[id]) good = false;
    else expanded = expanded.replace(`{${kind}:${id}}`, facts[kind][id].name);
    return '';
  });
  if (/[{}]/.test(remaining)) good = false;
  return good && Array.from(expanded).length <= (coach ? 110 : 3000) ? text : null;
}
module.exports = { validate };
