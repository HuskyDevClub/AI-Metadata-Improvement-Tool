// Collapse morphological variants of portal tags so the generated tag set never
// contains two spellings of the same concept ("school"/"schools").
//
// The backend already removes variants from the vocabulary it serves
// (_fetch_socrata_tags in backend/socrata.py), so normally the model cannot even
// see two variants. This module is the client-side safety net for the cases that
// slip through: a stale 24h tag cache, variants surviving the category+global
// list merge, a user-edited prompt template, or the model rewording a tag.
//
// stemTagToken / tagStemKey MUST stay in sync with _stem_tag_token /
// _tag_stem_key in backend/socrata.py. The stemmer is deliberately naive and
// conservative: a missed merge just leaves today's behavior, while an
// over-aggressive merge would hide a real tag (e.g. "care" must not become
// "car"), so every rule is length-guarded.
function stemTagToken(token: string): string {
    let t = token;
    if (t.endsWith('ies') && t.length - 3 >= 3) {
        return t.slice(0, -3) + 'y';
    }
    // Plural family first ("crossings" -> "crossing"), then -ing/-ed on the
    // result ("crossing" -> "cross"), so stemming a plural matches stemming
    // its singular.
    if (t.endsWith('sses')) {
        t = t.slice(0, -2);
    } else if (t.endsWith('ss')) {
        // "class", "business" — final s is not a plural marker
    } else if (t.endsWith('es') && t.length - 2 >= 3 && /(?:s|x|z|sh|ch)$/.test(t.slice(0, -2))) {
        // Epenthetic -es after a sibilant: "buses" -> "bus", "taxes" -> "tax".
        // Elsewhere the e belongs to the stem ("wages" -> "wage", not "wag").
        t = t.slice(0, -2);
    } else if (t.endsWith('s') && t.length - 1 >= 3) {
        t = t.slice(0, -1);
    }
    for (const [suffix, minStem] of [['ing', 3], ['ed', 4]] as const) {
        if (t.endsWith(suffix) && t.length - suffix.length >= minStem) {
            t = t.slice(0, -suffix.length);
            // Undouble "planning" -> "plann" -> "plan", but keep l/s/z doubles
            // ("pass", "fall") whose final letter is part of the stem.
            if (t.length >= 3 && t[t.length - 1] === t[t.length - 2] && !'aeiouslz'.includes(t[t.length - 1])) {
                t = t.slice(0, -1);
            }
            break;
        }
    }
    // Fold silent-e stems together ("license"/"licensing" -> "licens"), but only
    // on longer words — at 4 letters this caused real collisions ("care" -> "car").
    if (t.length >= 5 && t.endsWith('e')) {
        t = t.slice(0, -1);
    }
    return t;
}

export function tagStemKey(tag: string): string {
    return tag
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map(stemTagToken)
        .join(' ');
}

// Enforce that generated tags come ONLY from the portal's existing vocabulary,
// with at most one tag per variant family. The tags prompt instructs the model
// to pick from the supplied list, but this is the hard guarantee:
// - a tag the model reworded into a variant ("schools") resolves to the
//   vocabulary's canonical spelling ("school");
// - a tag with no variant in the vocabulary at all is dropped;
// - when several tags share a stem, only the first survives, and each resolves
//   to the variant ranked highest in `rankedVocabulary` (the caller pre-ranks it
//   by usage, matching the "prefer the more popular variant" rule in the prompt).
// When `rankedVocabulary` is empty (e.g. the portal tag list failed to load), we
// cannot enforce membership, so tags pass through — still de-duplicated by stem
// — as a graceful fallback.
export function resolveTagsAgainstVocabulary(tags: string[], rankedVocabulary: string[]): string[] {
    const canonicalByStem = new Map<string, string>();
    for (const candidate of rankedVocabulary) {
        const key = tagStemKey(candidate) || candidate.toLowerCase();
        if (!canonicalByStem.has(key)) {
            canonicalByStem.set(key, candidate);
        }
    }
    const result: string[] = [];
    const seenStems = new Set<string>();
    for (const tag of tags) {
        const key = tagStemKey(tag) || tag.toLowerCase();
        const resolved = rankedVocabulary.length === 0 ? tag : canonicalByStem.get(key);
        if (resolved === undefined || seenStems.has(key)) continue;
        seenStems.add(key);
        result.push(resolved);
    }
    return result;
}
