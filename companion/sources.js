'use strict';
const USER_AGENT = 'AzerothCoach/0.1.0 (personal quest helper; one page for each player question)';
const DAY = 86400000;
function plain(html) {
  return String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
class Sources {
  constructor(cache, facts, { fetcher = fetch, clock = Date.now, audit = () => {} } = {}) {
    this.cache = cache; this.facts = facts; this.fetcher = fetcher; this.clock = clock; this.audit = audit;
    this.calls = { wiki: 0, wowhead: 0 }; this.used = []; this.blocked = false;
  }
  async page(key, url, label, credit) {
    let page = this.cache.get('pages', key);
    if (!page) {
      const options = { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000), redirect: 'manual' };
      let response = await this.fetcher(url, options);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get('location') || '', url);
        const original = new URL(url);
        if (!key.startsWith('wowhead:') || next.origin !== original.origin || next.search || !next.pathname.startsWith(original.pathname + '/')) throw new Error('The source redirect does not keep the same entity ID.');
        response = await this.fetcher(next.toString(), options);
      }
      if (key.startsWith('wowhead:') && [403, 429].includes(response.status)) {
        this.cache.put('breaker', 'wowhead', true, DAY); this.blocked = true; this.audit(this.snapshot());
        return { text: 'Wowhead is not available now. Use wiki_lookup for a quest.', unavailable: true };
      }
      if (response.status === 404) page = { missing: true, text: 'The source has no page for this ID.' };
      else {
        if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}.`);
        const reader = response.body.getReader(); let total = 0; const chunks = [];
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            total += value.length; if (total > 2_000_000) throw new Error('The source page is too large.');
            chunks.push(Buffer.from(value));
          }
        } finally { await reader.cancel().catch(() => {}); }
        const body = Buffer.concat(chunks).toString('utf8');
        if (key.startsWith('wiki:')) {
          const doc = JSON.parse(body);
          if (doc.error || !doc.parse?.text) page = { missing: true, text: 'The wiki has no page for this quest.' };
          else page = { text: plain(doc.parse.text['*'] || doc.parse.text).slice(0, 1180) };
        } else page = { text: plain(body.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || body).slice(0, 1180) };
      }
      this.cache.put('pages', key, page, page.missing ? DAY : 7 * DAY);
    }
    const sourceUrl = key.startsWith('wiki:') ? 'https://warcraft.wiki.gg/wiki/' + encodeURIComponent(this.facts.q[key.split(':')[1]].name.replace(/ /g, '_')) : url;
    const source = { label: credit ? `${label} · ${credit}` : label, url: sourceUrl };
    if (!page.missing && !this.used.some(x => x.url === source.url)) this.used.push(source);
    this.audit(this.snapshot());
    return { text: page.text, url: sourceUrl, credit: credit || '', missing: !!page.missing };
  }
  snapshot() { return { sources: this.used, blocked: this.blocked }; }
  async wiki_lookup({ quest_id }) {
    if (!Number.isSafeInteger(quest_id) || !this.facts.q?.[quest_id]) throw new Error('Use a quest ID from the game facts.');
    if (++this.calls.wiki > 2) throw new Error('Wiki limit: two calls for each question.');
    const title = this.facts.q[quest_id].name;
    const url = new URL('https://warcraft.wiki.gg/api.php');
    url.search = new URLSearchParams({ action: 'parse', page: title, prop: 'text', redirects: '1', format: 'json' });
    return this.page(`wiki:${quest_id}`, url.toString(), 'Warcraft Wiki', 'CC BY-SA 4.0');
  }
  async wowhead_lookup({ type, id }) {
    const kind = { quest: 'q', npc: 'n', item: 'i', object: 'o' }[type];
    if (!kind || !Number.isSafeInteger(id) || !this.facts[kind]?.[id]) throw new Error('Use an entity ID from the game facts.');
    if (++this.calls.wowhead > 1) throw new Error('Wowhead limit: one call for each question.');
    if (this.cache.get('breaker', 'wowhead')) { this.blocked = true; this.audit(this.snapshot()); return { text: 'Wowhead is not available now. Use wiki_lookup for a quest.', unavailable: true }; }
    const key = `wowhead:${type}:${id}`;
    if (!this.cache.get('pages', key)) {
      const last = this.cache.get('breaker', 'wowhead-last') || 0;
      if (this.clock() - last < 5000) return { text: 'Wowhead needs a pause between requests. Use wiki_lookup for a quest.', unavailable: true };
      this.cache.put('breaker', 'wowhead-last', this.clock(), DAY);
    }
    const result = await this.page(key, `https://www.wowhead.com/forever/${type}=${id}`, `Wowhead ${type} ${id}`);
    if (result.unavailable && type === 'quest' && this.calls.wiki < 2) return this.wiki_lookup({ quest_id: id });
    return result;
  }
}
module.exports = { Sources, USER_AGENT, DAY, plain };
