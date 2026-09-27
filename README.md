# Spice Market

A fully local, in-browser 2-player trading card game, with four bot difficulties and a bot-vs-bot spectate mode. No network needed at runtime.

## Run it

```bash
npm install
npm run dev          # → http://localhost:5173
```

`npm run build && npm run preview` serves an optimized build instead. `npm run build:site` builds it into `../danielqli/spice-market/` for the portfolio site.

## Playing

On your turn, click cards, then press the action button (or **Enter**). **Esc** clears your selection.

| You want to… | Click |
|---|---|
| Take one good | one market good |
| Take all camels | any market camel (selects them all) |
| Sell | one or more hand cards of a single type |
| Exchange | 2+ market goods, plus the same number of hand cards and/or herd camels |

You can **drag your hand cards** into any order (new cards arrive on the right; **Sort** restores the default order). Every move — yours and the bot's — plays out on the table: the bot first highlights the cards it picked with a caption, then cards fly between the market, hands, herd and token piles, coins fly to the seller with a `+N` popup, and new cards deal from the deck. Each player shows a “last move” pill, and the log uses card icons.

With **Show cards you've seen them take** (menu, on by default), opponent cards you watched them pick up stay face-up with an eye marker; the rest stay face-down.

The action bar previews the move (e.g. `Sell 4 Leather (+7 + bonus)`) and explains why an illegal selection is refused.

Rules are the standard ones: 7-card hand limit (camels don't count), precious goods (diamond/gold/silver) sell in 2s or more, 3/4/5+ card sales earn hidden bonus tokens, a round ends when three token piles are empty or the deck can't refill the market, the bigger herd gets the 5-rupee camel token, and the first to 2 Seals of Excellence wins. The loser of a round starts the next.

**House rule (menu toggle, off by default):** on a tied score the camel-token holder takes the seal; otherwise the official tiebreaks apply (more bonus tokens, then more goods tokens).

## Analysis panel

Toggle **Analysis** in the top bar. On your turn (or for the side to move in spectate) it searches the position from that player's point of view only — it never peeks at hidden cards — and updates live for up to 60 s:

- **Eval bar** — chance to win this round with the best move.
- **Best / 2nd / 3rd** (+ three more) — each with round-win % (± 95% band), **EV** (expected rupee margin at round end), and a **likely line**: the most-explored continuation (you → them → you). Later cards in a line depend on the draw.
- **Strong opp.** assumes the opponent always finds its best reply (worst case); **Typical opp.** has them play like the Medium bot with some noise.
- Click a suggestion to select its cards.

Under the hood it is information-set MCTS ([Cowling, Powley & Whitehouse](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf)) run on 1–4 workers and merged. Alpha-beta / Star-minimax and PIMC were considered and rejected: the game has hidden hands ([strategy fusion](https://webdocs.cs.ualberta.ca/~nathanst/papers/pimc.pdf)), a chance node on every refill, and a huge exchange branching factor (tens of thousands of distinct moves).

## Bots

| Tier | How it plays |
|---|---|
| Easy | 35% of the time plays like Medium, otherwise a random move of a random kind |
| Medium | One-move lookahead with a hand-tuned evaluation: set value with growth, camel herd/majority, what the market leaves for the opponent |
| Hard | Information-set MCTS: samples the hidden cards (opponent hand, deck order, bonus values) consistent with everything it has seen — card counting included — and searches ~1s per move |
| Expert | Same search at ~4s per move, with more exchange candidates considered deeper in the tree |

Bots only ever receive a `PlayerView` (what that player may legally know) and run in a Web Worker so the UI stays smooth.

Measured with `npm run bench` (single rounds, seats and starting player alternated):

| Matchup | Rounds | Result |
|---|---|---|
| Medium vs Easy | 200 | Medium wins 98.0% |
| Hard (½ budget) vs Medium | 60 | Hard wins 71.7% |
| Expert vs Hard (¼ budgets) | 40 | Expert wins 72.5% |

## Development

```bash
npm test                                   # engine, bots, selection logic (Vitest)
npm run typecheck
npm run bench -- <tierA> <tierB> [rounds=200] [budgetScale=1]
```

```
src/engine/   pure rules engine: state, moves, scoring, match flow, player views
src/bots/     easy / medium (heuristic) / hard + expert (ISMCTS), determinization
src/worker/   Web Worker host + cancellable client
src/ui/       React table, SVG card art, menu, spectate controls
scripts/      bench.ts (tier-vs-tier)
```
