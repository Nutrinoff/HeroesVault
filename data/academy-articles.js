// ==========================================
// NEXUS ACADEMY ARTICLES DATA
// ==========================================

const ACADEMY_ARTICLES = [
    {
        id: 'stutter-stepping-basics',
        title: 'Stutter Stepping & Attack Canceling',
        category: 'Mechanics',
        level: 'Basic',
        readTime: '4 min',
        tags: ['mechanics', 'orb walking', 'auto attack', 'kiting', 'chasing'],
        summary: 'Move between auto-attack cooldowns so you can kite, chase, and dodge skillshots without standing still.',
        markdown: `
### Why Stutter Stepping Matters
Standing completely still while auto-attacking makes you an easy target for skillshots and lets enemies walk away or dive you for free.

- **Kiting:** Keep distance while hitting melee or slower targets chasing you.
- **Chasing:** Close the gap between attacks so enemies cannot slip out of range.
- **Dodging:** Sidestep incoming skillshots right after your attack launches.

### The Core Rhythm
Every hero has a wind-up before an attack fires, a release point where the attack/projectile goes out, and a brief cooldown until the next attack is ready.

1. Issue an **Attack** (or Attack-Move) command.
2. As soon as the attack or projectile fires, issue a **Move** command in the direction you want to go.
3. Repeat in sync with your hero's attack speed.

> **Tip:** Don't spam-click movement too early during the wind-up—canceling before the attack fires means zero damage and wasted time.
        `.trim()
    },
    {
        id: 'alt-self-cast-hotkeys',
        title: 'Alt Self-Casting & Quick Cast Habits',
        category: 'Mechanics',
        level: 'Basic',
        readTime: '3 min',
        tags: ['mechanics', 'alt cast', 'self cast', 'hotkeys', 'shields', 'heals'],
        summary: 'Cast shields, heals, speed buffs, and defensive abilities on yourself or key targets faster under pressure.',
        markdown: `
### Casting on Yourself Without Losing the Cursor
In chaotic teamfights, moving your mouse back onto your own hero just to shield or heal yourself costs precious reaction time.

- Use **Alt + Ability Key** (e.g. \`Alt + Q/W/E\`) for instant self-cast on abilities that support it.
- Keep your cursor aimed at threats, teammates, or escape paths while still protecting yourself.

### Practical Habits
- Practice **Alt-casting** defensive tools while dodging skillshots so it becomes muscle memory.
- Check your hotkey settings so abilities you need to aim land cleanly without awkward extra clicks.

> **Note:** Not every ability supports self-cast—test your main heroes in Try Mode to see which spells feel best with Quick Cast vs. On Release.
        `.trim()
    },
    {
        id: 'soaking-and-lane-safety',
        title: 'Minion XP Soaking & Safe Lane Positioning',
        category: 'Laning',
        level: 'Basic',
        readTime: '5 min',
        tags: ['laning', 'soaking', 'xp', 'experience', 'waves', 'early game'],
        summary: 'Why early lane XP decides objective fights, and how to soak waves without feeding ganks.',
        markdown: `
### XP Is King Early
In the early game, **minion wave XP** is the most reliable way to hit level tiers first—especially **Level 10** (Heroics) and **Level 20** (Storm talents).

- Missing a full wave in an empty lane hands free XP to the enemy team.
- Winning a minor skirmish means very little if your team drops two lanes of soak while fighting over nothing.

### Safe Positioning Rules
- Watch the minimap before pushing past the halfway mark of a lane.
- If multiple enemies are missing from the map and you lack escape tools, play closer to your towers and still collect XP safely.
- **Never** die just to clear one extra wave—being dead loses both the wave and map pressure.
        `.trim()
    },
    {
        id: 'draft-roles-and-order',
        title: 'Draft Fundamentals: Roles, Counters & Win Conditions',
        category: 'Drafting',
        level: 'Basic',
        readTime: '5 min',
        tags: ['drafting', 'composition', 'tank', 'healer', 'offlane', 'counters'],
        summary: 'How to put together a functional team comp and avoid drafting glaring weaknesses.',
        markdown: `
### Core Jobs Your Team Needs Covered
A reliable HotS composition usually needs clear answers to these jobs:

- **Tank:** Initiates fights, peels for backliners, checks bushes, and anchors vision.
- **Healer:** Sustains the team through poke and saves targets from burst.
- **Offlaner / Solo:** Holds a side lane, soaks reliably, and brings macro/dueling presence.
- **Damage & Waveclear:** Clears waves/camps efficiently and deals consistent or burst damage in fights.

### Simple Draft Checklist
1. Make sure you aren't missing **waveclear** or **hard engage/peel**.
2. Avoid stacking too many fragile heroes with zero way to stop enemy dive.
3. Hover early and communicate so your draft builds toward a clear **win condition** (early push, macro rotations, or late-game scaling).
        `.trim()
    },
    {
        id: 'wave-manipulation-and-merc-timing',
        title: 'Wave States, Rotations & Mercenary Timing',
        category: 'Laning',
        level: 'Advanced',
        readTime: '6 min',
        tags: ['laning', 'advanced', 'macro', 'mercenaries', 'camps', 'rotations', 'push'],
        summary: 'Time camps around objectives, manage wave push/freeze states, and punish enemy rotations.',
        markdown: `
### Timing Camps Before Objectives
Taking a Siege or Bruiser camp at random times often just gives the enemy free XP or an easy clear. Taking it **30–45 seconds before an objective spawns** forces a real choice:

- Enemies either send someone to clear the pushing camp/structure and show up late to the objective, **or**
- They ignore the camp and lose structure damage/fort pressure while contesting.

### Wave & Rotation Discipline
- **Fast clear + rotate:** Clear your wave cleanly, then look for rotation value, camp setup, or a numbers advantage—don't linger aimlessly in an empty lane.
- **Punish over-rotations:** If the enemy team commits four or five players to one side of the map, push opposite waves and take free structures or camps.

> **Advanced Habit:** Glance at the objective timer and death timers before starting a camp so you don't get caught alone right as a fight breaks out.
        `.trim()
    },
    {
        id: 'body-blocking-and-combat-spacing',
        title: 'Body Blocking, Bush Control & Cooldown Tracking',
        category: 'Mechanics',
        level: 'Advanced',
        readTime: '6 min',
        tags: ['mechanics', 'advanced', 'body block', 'vision', 'cooldowns', 'teamfights'],
        summary: 'Use hero collision, fog of war, and enemy cooldown windows to outplay skirmishes.',
        markdown: `
### Body Blocking & Pathing Control
Heroes have physical collision with other heroes. Stepping slightly ahead of a fleeing or diving target can trap them against terrain, walls, or minions.

- Pair small movement steps with your attacks so you stay in front of the target's escape path without overextending past their team.
- Watch out for getting **body-blocked yourself** when backing up through tight choke points.

### Playing Around Cooldowns & Vision
- **Bush / fog control:** Unchecked bushes let enemies set up ambushes or dodge vision; use abilities, summons, or safe scouting to check them.
- **Punish spent cooldowns:** Once an enemy Tank or Bruiser burns their main engage, stun, or escape, your team has a temporary window to step up and trade aggressively.
        `.trim()
    },
    {
        id: 'drafting-for-maps-and-win-conditions',
        title: 'Map-Aware Drafting & Late-Draft Adaptation',
        category: 'Drafting',
        level: 'Advanced',
        readTime: '6 min',
        tags: ['drafting', 'advanced', 'maps', 'win condition', 'counters', 'scaling'],
        summary: 'Match hero strengths to battleground layouts, objective pacing, and enemy picks.',
        markdown: `
### Match Heroes to the Battleground
Different maps reward very different strengths:

- **Multi-lane / heavy macro maps:** Value strong waveclear, double-soak or fast rotations, and camp pressure.
- **Tight objective / skirmish maps:** Value strong teamfight synergy, sustain/peel, or objective-control tools.

### Adapting to the Enemy Draft
- Look at what actually threatens your backline or frontline—don't lock a comfort pick blindly if it makes your comp completely helpless against the enemy's main game plan.
- Identify **who wins early vs. who scales harder** so your team knows whether to force tempo early or play patient and soak until key talent tiers.
        `.trim()
    }
];
