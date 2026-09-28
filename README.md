# Spice Market

A fully local, in-browser 2-player trading card game, with six bot difficulties (up to an AlphaZero-style Grandmaster) and a bot-vs-bot spectate mode. No network needed at runtime.

## Run it

```bash
npm install
npm run dev          # → http://localhost:5173
```

`npm run build && npm run preview` serves an optimized build instead. `npm run build:site` builds it into a sibling site folder.

## Playing

On your turn, click cards, then press the action button (or **Enter**). **Esc** clears your selection.

| You want to… | Click |
|---|---|
| Take one good | one market good |
| Take all camels | any market camel (selects them all) |
| Sell | one or more hand cards of a single type |
| Exchange | 2+ market goods, plus the same number of hand cards and/or herd camels |

You can **drag your hand cards** into any order (new cards arrive on the right; **Sort** restores the default order). Every move — yours and the bot's — plays out on the table: the bot first highlights the cards it picked with a caption, then cards fly between the market, hands, herd and token piles, coins fly to the seller with a `+N` popup, and new cards deal from the deck. Each player shows a “last move” pill, and the log uses card icons.

With **Show cards you've seen them take** (menu, off by default), opponent cards you watched them pick up get an eye marker; click one to flip it face-up. Each player's score can be hidden behind a toggle that shows only how many commodity and bonus tokens they hold.

The action bar previews the move (e.g. `Sell 4 Leather (+7 + bonus)`) and explains why an illegal selection is refused.

Rules are the standard ones: 7-card hand limit (camels don't count), precious goods (diamond/gold/silver) sell in 2s or more, 3/4/5+ card sales earn hidden bonus tokens, a round ends when three token piles are empty or the deck can't refill the market, the bigger herd gets the 5-rupee camel token, and the first to 2 Seals of Excellence wins. The loser of a round starts the next.

**House rule (menu toggle, on by default):** on a tied score the camel-token holder takes the seal; otherwise the official tiebreaks apply (more bonus tokens, then more goods tokens).

## Analysis panel

Toggle **Analysis** in the top bar. On your turn (or for the side to move in spectate) it searches the position from that player's point of view only — it never peeks at hidden cards — and updates live for up to 60 s:

- **Eval bar** — chance to win this round with the best move.
- **Best / 2nd / 3rd** (+ three more) — each with round-win % (± 95% band), **EV** (expected rupee margin at round end), and a **likely line**: the most-explored continuation (you → them → you). Later cards in a line depend on the draw.
- **Strong opp.** assumes the opponent always finds its best reply (worst case); **Typical opp.** has them play like the Medium bot with some noise.
- Click a suggestion to select its cards.

Under the hood it is the Grandmaster's search (below) run on several workers and merged, including its read of the opponent's hand from their moves.

## Bots

| Tier | How it plays | Thinks for |
|---|---|---|
| Easy | 35% of the time plays like Medium, otherwise a random move | instant |
| Medium | One-move lookahead with a hand-tuned evaluation: set value with growth, camel herd/majority, what the market leaves for the opponent | instant |
| Hard | Information-set MCTS ([Cowling, Powley & Whitehouse](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf)): samples the hidden cards consistent with everything it has seen (card counting included); quick evaluations early in the round, endgame-aware playouts late | ~1 s |
| Expert | The same search with a self-play-trained value network as the evaluation, plus an exact endgame solver (sample hidden worlds, alpha-beta to the end in each) | ~4 s |
| Master | Expert on several CPU cores (root-parallel search, merged) with double the time | ~8 s |
| Grandmaster | AlphaZero-style, from three rounds of self-play training: a policy network ranks the candidate moves (PUCT), a value network on richer features judges positions, and a whole-hand model reads the opponent's hidden cards from what they took, passed on, traded and sold this round; exact endgame solver | ~8 s |

Bots only ever receive a `PlayerView` (what that player may legally know) and run in Web Workers so the UI stays smooth.

Measured bot-vs-bot (single rounds, seats and starting player alternated; ± is a 95% interval):

| Matchup | Rounds | Result |
|---|---|---|
| Medium vs Easy | 200 | Medium wins 98% |
| Hard vs Medium | 60 | Hard wins 72% |
| Expert (value net + solver) vs the previous search-only Expert | 48 | 71% at 1 s/move, 56% at 4 s |
| Grandmaster vs Master, 8 s per move | 104 | **Grandmaster wins 62% ± 9** (65–39) |
| Grandmaster vs Medium | 24 | Grandmaster wins 92% |

The game has real luck in the draw, so even the strongest bot drops rounds; a best-of-3 match is a better measure.

### How the networks were trained

`scripts/selfplay.ts` plays the bot against itself and records, for each position: the features, the final result and the search's own win estimate (value targets), how often the search visited each candidate move (policy targets), and each player's true hidden cards next to the public information (hand-model targets). It uses AlphaZero/KataGo-style tricks: root Dirichlet noise, visit-proportional moves in the opening, and playout-cap randomization (most moves get a cheap search; only full searches become policy targets). `training/train.py` fits the networks (value, policy, belief2) and exports JSON weights into `src/bots/weights/`. Three generations of this loop produced the shipped v7 networks. `scripts/duel.ts` runs the head-to-head tests.

## Development

```bash
npm test                                   # engine, bots, selection logic (Vitest)
npm run typecheck
npm run bench -- <tierA> <tierB> [rounds=200] [budgetScale=1]
```

```
src/engine/   pure rules engine: state, moves, scoring, match flow, player views
src/bots/     easy / medium (heuristic); ISMCTS search, endgame solver, value / policy / hand-model networks + weights
src/worker/   Web Worker host + cancellable client
src/ui/       React table, SVG card art, menu, spectate controls
scripts/      bench.ts (tier-vs-tier), duel.ts (A/B tests), selfplay.ts (training data)
training/     train.py (PyTorch trainer for the networks)
```
