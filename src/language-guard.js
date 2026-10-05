// Language guard — Parakeet TDT v3 auto-detects the language on every clip and
// cannot be forced. On French dictation it sometimes drifts to English
// ("It's the fact that maintenant who have their propre abonnement...").
// This module spots that drift so stt.js can re-decode with a model forced to
// the user's native language.

// English function words that never appear as plain words in French, German or
// Spanish dictation. Ambiguous ones are deliberately left out ("a", "on", "an",
// "but", "or", "i", "he", "son"...).
const EN_MARKERS = new Set([
  'the', 'and', 'is', 'are', 'was', 'were', "it's", 'it', 'who', 'have', 'has',
  'that', 'this', 'with', 'what', 'you', 'your', 'they', 'their', 'there',
  'which', 'would', 'will', 'of', 'to', 'my', 'we', 'our', 'one', 'been',
  'because', 'not', "don't", "i'm", 'from', 'about', 'should', 'could',
  'them', 'these', 'those', 'when', 'where', 'why', 'how', 'some', 'very',
]);

// French function words. A drifted clip keeps some of them ("parce que",
// "maintenant"...), whereas a sentence dictated in English on purpose has none:
// that one must not be re-transcribed (Canary would translate it to French).
const FR_MARKERS = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'et', 'que', 'qui', 'parce', 'mais',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'est', 'pas', 'une', 'un',
  'ce', 'ça', 'pour', 'avec', 'dans', 'sur', 'maintenant', 'aussi', 'très',
  "c'est", "j'ai", "qu'il", "n'est", 'mon', 'ma', 'mes', 'leur', 'leurs',
]);

// Native languages Canary can be forced to (config name -> Canary code)
const LANG_CODES = { French: 'fr', German: 'de', Spanish: 'es', English: 'en' };

const MIN_MARKERS = 3;   // a stray "the" or "is" inside a French sentence is fine
const MIN_RATIO = 0.2;   // at least 20% of words must be English markers

function langCode(languageName) {
  return LANG_CODES[languageName] || null;
}

function looksLikeEnglishDrift(text, nativeCode = 'fr') {
  const words = text.toLowerCase().replace(/[’]/g, "'").match(/[a-zà-ÿ']+/g) || [];
  if (words.length === 0) return false;
  const hits = words.filter(w => EN_MARKERS.has(w)).length;
  if (hits < MIN_MARKERS || hits / words.length < MIN_RATIO) return false;
  // French native: only mixed FR/EN clips are drift, pure English is intentional
  return nativeCode !== 'fr' || words.some(w => FR_MARKERS.has(w));
}

module.exports = { langCode, looksLikeEnglishDrift };
