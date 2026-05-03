// ═══════════════════════════════════════════════════
// JENNA AI MATCHING ENGINE v1
// ═══════════════════════════════════════════════════
// This file handles all AI matching logic for AskJenna
// It collects group interests, scores them, and calls
// the Claude API to generate personalized itineraries

const JENNA = {

  // ── SCORE GROUP INTERESTS ──────────────────────
  // Takes array of member interest arrays and returns
  // a weighted score for each interest category
  scoreGroupInterests(members) {
    const scores = {};
    const total = members.length;

    members.forEach(member => {
      if(!member.interests) return;
      member.interests.forEach(interest => {
        scores[interest] = (scores[interest] || 0) + 1;
      });
    });

    // Convert to weighted scores (0-100)
    const weighted = {};
    Object.keys(scores).forEach(k => {
      weighted[k] = Math.round((scores[k] / total) * 100);
    });

    // Sort by score descending
    return Object.entries(weighted)
      .sort((a,b) => b[1]-a[1])
      .reduce((acc,[k,v]) => ({...acc,[k]:v}), {});
  },

  // ── BUILD JENNA PROMPT ─────────────────────────
  // Creates the AI prompt from trip + group data
  buildPrompt(trip, members, scores) {
    const topInterests = Object.entries(scores)
      .filter(([,v]) => v >= 50)
      .map(([k,v]) => `${k} (${v}% of group)`)
      .join(', ');

    const partialInterests = Object.entries(scores)
      .filter(([,v]) => v > 0 && v < 50)
      .map(([k,v]) => `${k} (${v}% of group)`)
      .join(', ');

    const memberCount = members.length + 1; // +1 for host
    const dest = trip.destination || 'the destination';
    const budget = {
      budget: 'budget-friendly (under $500 per person)',
      moderate: 'moderate ($500-$1,500 per person)',
      comfortable: 'comfortable ($1,500-$3,000 per person)',
      luxury: 'luxury ($3,000+ per person)'
    }[trip.budget] || 'flexible budget';

    const days = trip.start_date && trip.end_date
      ? Math.ceil((new Date(trip.end_date) - new Date(trip.start_date)) / (1000*60*60*24))
      : 3;

    return `You are Jenna, an expert AI travel planner known for finding experiences that satisfy every member of a group. You are warm, knowledgeable, and specific — never generic.

TRIP DETAILS:
- Destination: ${dest}
- Group size: ${memberCount} travelers
- Duration: ${days} days
- Budget: ${budget}
- Trip name: "${trip.name}"

GROUP INTERESTS (what the whole group loves):
- Everyone or most agree on: ${topInterests || 'still being collected'}
- Some members also enjoy: ${partialInterests || 'various activities'}

YOUR TASK:
Generate a personalized group itinerary with exactly 6 specific activity suggestions for ${dest}. Each suggestion must:
1. Be a REAL, specific type of experience (not generic like "visit a museum" — say WHAT kind)
2. Include why it works for THIS specific group based on their interests
3. Include a group match percentage (how many % of the group will love it)
4. Be varied — mix food, culture, activity, nightlife, etc.

Respond ONLY with a JSON array. No preamble, no markdown, no explanation. Just the JSON:

[
  {
    "name": "specific experience name",
    "category": "Food & Drink|Culture|Outdoors|Nightlife|Shopping|Entertainment",
    "emoji": "single relevant emoji",
    "description": "2 sentence description explaining why this is perfect for this group",
    "duration": "e.g. 2-3 hours",
    "price": "Free|$|$$|$$$|$$$$",
    "matchScore": 85,
    "matchReason": "short reason why the group will love this"
  }
]`;
  },

  // ── CALL CLAUDE API ───────────────────────────
  async getSuggestions(trip, members, apiKey) {
    const scores = this.scoreGroupInterests(members);
    const prompt = this.buildPrompt(trip, members, scores);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if(!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Parse JSON response
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  },

  // ── RENDER SUGGESTIONS ────────────────────────
  renderSuggestions(suggestions, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;

    const categoryColors = {
      'Food & Drink': '#FFF3CD',
      'Culture': '#E8F5E9',
      'Outdoors': '#E0F7FA',
      'Nightlife': '#EEF0FB',
      'Shopping': '#FDE8E0',
      'Entertainment': '#F3E5F5'
    };

    container.innerHTML = suggestions.map(s => {
      const color = categoryColors[s.category] || '#F5F0E8';
      const scoreClass = s.matchScore >= 80 ? 'pct-high' : 'pct-med';
      return `
        <div class="sug-item">
          <div class="sug-icon" style="background:${color}">${s.emoji}</div>
          <div class="sug-body">
            <div class="sug-name">${s.name}</div>
            <div class="sug-meta">${s.category} · ${s.duration} · ${s.price}</div>
            <div class="sug-desc">${s.description}</div>
            <div class="sug-reason">✦ ${s.matchReason}</div>
          </div>
          <div class="sug-pct ${scoreClass}">${s.matchScore}%</div>
        </div>
      `;
    }).join('');
  },

  // ── RENDER MATCH SCORES ───────────────────────
  renderMatchCard(members, containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;

    const total = members.length + 1;
    const hasInterests = members.filter(m => m.interests && m.interests.length > 0).length;
    const completionPct = Math.round((hasInterests / total) * 100);

    // Calculate overall match score based on interest overlap
    const scores = this.scoreGroupInterests(members);
    const topScores = Object.values(scores).filter(v => v >= 50);
    const avgMatch = topScores.length > 0
      ? Math.round(topScores.reduce((a,b) => a+b, 0) / topScores.length)
      : 0;

    if(members.length === 0) {
      container.innerHTML = `
        <div class="match-waiting">
          <span>⏳</span>
          Waiting for your crew to join and add their interests...
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="match-score-big">${avgMatch || '--'}%</div>
      <div class="match-score-label">Group compatibility</div>
      <div class="match-score-sub">${
        avgMatch >= 80 ? 'Excellent — everyone will love most activities' :
        avgMatch >= 60 ? 'Great match — most activities satisfy the group' :
        avgMatch >= 40 ? 'Good start — more members joining will help' :
        'Getting started — invite more crew!'
      }</div>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.1)">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem">Interests submitted</div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div style="flex:1;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
            <div style="width:${completionPct}%;height:100%;background:var(--teal2);border-radius:2px;transition:width 0.5s ease"></div>
          </div>
          <span style="font-size:0.72rem;color:rgba(255,255,255,0.4)">${hasInterests}/${total}</span>
        </div>
      </div>
    `;
  }
};
