# Feature Specification: Railways of the Lost Atlas

**Feature Branch**: `004-railways-lost-atlas`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "I want to add support for a new game, Railways of the Lost Atlas, I added two pdf rulebooks for this game in the /docs/rules folder docs/rules/Railways-EN-2nd-Rulebook.pdf. One for the base game and one for the landmarks expansion docs/rules/Landmarks-EN-Rulebook.pdf. I'm not sure how much of an impact the expansion may have on the parameters that his application handles, but it's worth checking if we need to account for anything"

## Background

Railways of the Lost Atlas (Asterisk Games, 2nd edition, 2024; "RotLA" below) is an 18xx-style game that differs from the games the app supports today (1830, 1848, 21Moon) in ways that affect money, shares, and the market. Sources: `docs/rules/Railways-EN-2nd-Rulebook.pdf` (base, pages cited as "B p.N") and `docs/rules/Landmarks-EN-Rulebook.pdf` (expansion, "L p.N").

**What is new compared with the games the app already supports**

| Area | RotLA rule | Source |
|---|---|---|
| Company types | 12 **minor companies** (5 shares, 20% each; president's certificate = 2 shares) start the game. 6 **major corporations** (10 shares, 10% each; president's certificate = 2 shares) only appear by **merging two minors**. | B p.4, 11, 15, 18 |
| Launching | A minor is launched by an **auction for the right to choose** an available minor. Minimum bid 120, steps of 5. The **whole winning bid goes into the minor's treasury**. The winner gets the president's certificate and the other 3 shares go to the minor's treasury. | B p.10 |
| Starting price | Half the winning bid, rounded down to the nearest printed value on the stock track, limited by phase: 60–90 (yellow), 60–110 (green), 60–135 (purple, grey). | B p.10, 16 |
| Capitalization | Incremental. Shares are bought from the company treasury (money to the company) or from the bank pool (money to the bank), at the current price. | B p.4, 11 |
| Stock round | Each turn: start an auction, **or** sell any shares (one sale) and/or buy **one** share, **or** pass. The SR ends when all players pass in a row. | B p.10–11 |
| Limits | No certificate limit. At most 60% of a company per player. At most 50% of a company in the pool. A minor's shares cannot be sold before it has operated. | B p.10–11 |
| Market | A **1-D stock track** with 27 spaces: 0 (closed), 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150, 165, 180, 200, 220, 245, 270, 300, 330, 360, 400, 450, 500. Tokens on the same space stack in arrival order, and operating order is highest price first, top of stack first. | B p.2, 11, 12 |
| Price moves | Sale: −1 per sale (not per share). Issue: −1. Withhold or no train: −1. Paid out > 0 but below the price: no move, but the token **goes to the bottom of its stack**. Paid ≥ price: +1. Paid ≥ 2× price: +2. Fully owned by players at the end of the SR: +1. | B p.2, 11, 14–15 |
| Closure at 0 | A company whose price reaches 0 is **dissolved**: its shares leave the game, its treasury goes to the bank, its trains go to the bank pool. | B p.11 |
| Operating round | Optional leadoff train (first OR of a new minor), then **issue or redeem one share**, lay track, place tokens, run, pay out or withhold (no half-pay in the base game), buy trains. | B p.12–17 |
| Dividends | Per share = payout ÷ 5 (minor) or ÷ 10 (major). Shares in the company's own treasury pay the company. Pool shares pay no one. | B p.15 |
| Trains | 2 (100), 3 (200), 4 (300), 5 (450), 6 (550), 7 (750), ∞ (1,000, or 800 plus trading in any non-rusted train). 7 and ∞ are two faces of the same "7/∞" card, which is in unlimited supply. 4 rusts 2s, 6 rusts 3s, the first 7/∞ rusts 4s. | B p.16–17 |
| Phases | Yellow (2s), green (first 3), purple (first 5), grey (first 7/∞). Train limits **differ for minors and majors**: 2/– (2-train), 2/4 (3-train), 2/3 (4-train), 1/2 (5-train onward). Trains over the limit go to the bank pool. | B p.16 |
| Round structure | Fixed **cycles**: Stock Round → OR 1 → OR 2 → **Merger Round** (only once the first green train has been bought or exported; an export that starts green comes after this slot) → **Export a train** → next cycle. The game ends after 4 cycles (Short) or 6 cycles (Long). | B p.11, 18–19 |
| Export | Before each new SR, the top train of the stack leaves the game (all remaining 2-trains together if it is a 2). An export can rust trains and change the phase exactly as a purchase does. | B p.19 |
| Merger | Two minors merge into a major: each minor share becomes one major share (the other minor's president's certificate becomes 2 single shares). Treasuries and trains are combined. The new price is the average of the two, rounded down. The president is the player with the most shares of the two minors (tie: the president of the minor that operates first). Both minors are retired. | B p.18 |
| Forced purchase | A company with no train must buy one. If its treasury is short, its president pays the rest and sells shares if needed (prices drop once per company, after all sales). If that is not enough, the president goes bankrupt. | B p.17 |
| Player bankruptcy | The bankrupt player is eliminated. Every company they preside over is removed. Their trains go to the pool. Other players exchange their shares in those companies for the final price, paid by the bank. Usually ends the game. | B p.17 |
| End and scoring | Score = cash + value of shares at the current price. Treasuries do not count. Tie: the president of the company that acts earliest wins. | B p.19 |
| Bank | No total is stated (285 money cards). The bank is treated as unlimited, except in the Bank Break variant (8,000). | B p.2, 21 |
| Starting cash | 2 players 450 (Short only), 3 players 300, 4 players 275, 5 players 220 (Long only). Micro games: 225. The app uses this one table for Short and Long, so an off-mode count (Short with 5, Long with 2) still gets a value (see Clarifications). | B p.7, 22–23 |

**Game modes and base-game variants** (B p.6–7, 20–23): Short Game (8 minors; Adaptive, Bridging, Overnight and Spacious are left out; one train of each type is removed except 7/∞; 2–4 players; 4 cycles), Long Game (12 minors; 3–5 players; 6 cycles), 2- and 3-player Micro games (4 or 6 minors, a fixed train stack of 3/3/3 or 5/4/4 trains of types 2/3/4, 225 each, 4 cycles, no export). Variants that change money or market rules: **Stock-drops per share** (−1 per share sold), **Bank Break** (8,000 bank, the game ends when the bank runs out, after the current set of ORs; certificate limits 16/12/10 for 3/4/5 players; any bankruptcy ends the game), **Hostile Mergers** (mergers decided by a share vote; the result is still a merger), **Headquarters** (once placed, a major's headquarters pays it 50% of the city's printed value from the bank at the start of each of its ORs; "Tax Break" pays 80 once). Variants with no effect on the app: different Distant Destinations, randomized minors (only changes which minors are in play), cut-throat local trains, custom maps.

**Minor company abilities that move money or trains** (B p.3, 13–16, 24): Tunneling (the bank pays 60 to the company each time it lays a mountain tile; the 40 tile cost is still paid), Expansive (an extra token placed for 40), Spacious (+1 train limit), Resourceful (rusted trains are kept and run one more time, then removed; they do not count towards the train limit). The other abilities only change the map or the route and are out of scope.

**Landmarks expansion: impact on what the app handles** (the user asked us to check)

| Module | What it changes | Impact on the app |
|---|---|---|
| **Landmarks** (L p.4–5) | New map features. Most change only routes or revenue (Ancient Ruins, Cave, Grand Junction, Mirage/Deserts, Park, Void, Waterfall, Wildflower Valley). Three affect money, trains or prices: **Rock Formation** (the company's price goes up 2 steps after revenue is set and before it is paid; once per company), **Cliff** (once per OR, the company may sell the train that ran there to the bank pool for half its printed price, paid by the bank), **Canyon** (from the first 4-train, the company takes a rusted 2-train for free, and it becomes permanent; once per company). | Small: a price bonus outside the payout, a train sold to the pool by the bank, and a rusted train coming back into play. |
| **Metropolitan Transit Department** (L p.6–7) | A **neutral corporation**: no treasury and no president. All certificates are single shares, 3 × number of players in total, with no per-player limit. It enters the market at the start of the first SR after its first token is placed, at the highest current price, on top of that stack. Shares are bought at the current price, and the money goes to the bank. Sold shares go back to its supply, not to the pool, and the price drops 1. It cannot be sold in the SR where it first becomes available. Fully owned at the end of the SR: +1. It never buys trains; it **receives each exported train** (a 7/∞ arrives as a 7) under minor-company train limits, and discards its lowest train when over the limit. Its OR costs pile up as **negative earnings**. It always pays out, and **each share gets 10% of the payout whatever the number of shares**. If the payout is negative, each shareholder pays the bank that amount per share; a player who cannot pay must sell a Metropolitan share (−1 each), and then the price drops 1 for no payout. Not used in Micro games. | **Large**: a new company type with its own share supply, dividend rule, negative dividends paid by players, and train source. |
| **Events** (L p.8–9) | One event card is active per cycle (2 or 3 Town Chronicle cards plus 2, 3 or all New City Herald cards, depending on game mode). Events that touch money or the market: **CEOs Get Rich!** (each company may pay its president 20 each OR), **Rural Expansion** (extra yellow tiles at 20 each), **Stock Bonanza!** (issuing does not drop the price), **Corporate Subsidies** (minors launched this SR also get 50% of the winning bid from the bank, rounded down to 5), **Unions Win!** (half-pay allowed: half the payout rounded up to 10 goes to the treasury, half rounded down to 10 is paid to shares, and the price moves on the paid half), **Record Gains!** (payout ≥ 3× price: +3), **Tycoons Rejoice** (presidents may hold 80%), **Train Auction Today** (companies bid in secret for the Pullman Car, an asset with no value that does not take a train slot; the winner pays the bank), **Overtime!** (a third OR this cycle), **Merger Mania!** (an extra Merger Round between OR 1 and OR 2). The others (The Future Is Here!, Ghost Towns Razed!, Rapid Growth) only change the map or which minors are available. | **Medium**: rules that switch on for one cycle, extra rounds in the cycle, a half-pay mode, a +3 price move, and a new non-train asset. |
| **New Minors and Majors** (L p.10–11) | 4 minors (Circus, Coupling, Manufacturing, Twin Cities) and 2 majors. **Manufacturing** pays 50 to the bank when launched, gets a permanent "Manufacturing 2-train" that has no value and cannot be sold, and cannot buy a leadoff train. The others change only routes or the map. | Small: more companies, and one launch cost with a special train. |
| **Miscellaneous variants** (L p.12) | **6–7 player mode** (starting cash 265 / 225, 5 cycles, extra train cards, 3 Town Chronicle + 2 New City Herald events). **Launching Direct-to-Major** (purple and grey phases: an auction winner may launch a major directly, with 8 shares in its treasury, no merger, and 5 extra partner charters). **Crowded Map**, **Long Game with randomized minors** (12 or 16 minors in play), **Special Tiles**, **New Distant Destination revenues**, **Seeding the map**. | 6–7 players: out of scope for this feature (its extra train cards need the physical copy). Direct-to-Major is a second way to start a major. The rest affects only which companies are in play, or the map. |

**Expansion scope for this feature** (see Clarifications): Rock Formation, Cliff and Canyon (the only landmarks with money, train or price effects), and the 4 new minors and 2 new majors (with Manufacturing's launch cost and special train). **Not in this feature**: the Events module and the Metropolitan Transit Department (a follow-up feature), the 6–7 player mode, Launching Direct-to-Major, and the remaining miscellaneous variants. The table above records their impact so the follow-up can start from it.

**What stays out of scope** (constitution III; docs/spec.md §2.3): the map, tiles, routes, revenue calculation, Distant Destination values, minor abilities that change only routes or tile laying, landmarks that change only revenue, and the order of the face-up minor charters (the table handles which minor may be launched). The app records the resulting revenue and money.

## Clarifications

### Session 2026-10-09

- Q: Which parts of the Landmarks expansion are in scope? → A: The base game plus the expansion's small effects: Rock Formation, Cliff, Canyon, Manufacturing, and the new minors and majors. **Events and the Metropolitan Transit Department are out of scope** for this feature, to keep the first iteration simple; they are left for a follow-up feature.
- Q: Should the 6–7 player mode be included? → A: No. It is out of scope for this feature, because which of its 3 extra train cards (one 4-train, two 2-trains; L p.3) are marked 6+ or 7+ can only be checked on the physical copy. It is left for a future spec.
- Q: Train counts and missing names? → A: The user's copy has 30 train cards: 2-train × 7, 3-train × 6, 4-train × 4, 5-train × 3, 6-train × 3, 7/∞ × 7. The 3- and 6-train counts include the one extra card of each marked "4+ players" (B p.7). This matches fwtwr.com's inventory (<http://www.fwtwr.com/18xx/info/inv-rotla.asp>), which lists 29 cards before the 2026 Revision Kit: that kit added a 6-train marked "4+ players" and re-marked the extra 3-train from "5+" to "4+". The 7/∞ supply is unlimited. The second identity names of the majors are not all known yet, so the game ships with placeholder names, which the user will correct later from the physical copy through a custom game. fwtwr.com and 18xx.cat (<https://18xx.cat/joc/LostAtlas?lang=en>) list Conglomerate, Syndicate and Unlimited as major names besides Experiment, Federation and International; matching initials suggest the pairs Consortium/Conglomerate, System/Syndicate and Union/Unlimited (unverified).
- Q: Where does a train traded in for an ∞ go, and what if the purchase rusts it? → A: The traded-in train leaves the game. When a train is bought, rust is checked first: buying the first 7/∞ while trading in a 4 rusts the 4, which leaves the game as rusted and cannot be traded in (user, 2026-10-09).
- Q: What starting cash does a player count outside the chosen mode get (Short with 5, Long with 2)? → A: One table for every non-Micro mode: 2 players 450, 3 players 300, 4 players 275, 5 players 220. Micro is 225 for any count. The mode only sets the recommended player range, which gives a warning (user, 2026-10-09).
- Q: When is a Merger Round held? → A: When both ORs of the cycle are done and the first green train has been bought or exported (B p.18). An export that starts the green phase comes after the Merger Round slot, so that cycle has none (B p.19).
- Q: How is Tunneling's mountain tile recorded? → A: As one action that pays the 40 tile cost and receives the 60 bonus, so one tap is one History entry with both lines and one undo (user, 2026-10-09).
- Q: What happens at the top of the track? → A: Prices stop at 500 (user, 2026-10-09; the rulebook is silent).
- Q: What exactly happens when a player goes bankrupt? → A: The player is eliminated. Every company they preside over (not only the one that failed the forced purchase) is removed from the game: other shareholders are paid the current price per share by the bank, all its shares leave the game, its trains go to the bank pool, and its treasury goes to the bank. Any shares the player still holds in other players' companies go to the pool (no payment, no price drop), and any cash left goes to the bank. The player is then skipped and ranks last on the score sheet, as "Eliminado" (user, 2026-10-09; the rulebook does not say where treasuries and leftovers go).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up a RotLA session (Priority: P1)

A group picks "Railways of the Lost Atlas" when creating a session, chooses the game length (Short, Long, 2-player Micro, 3-player Micro) and any variants they play, and enters the players. The app gives each player the right starting cash for the mode and player count, puts the right minors into play, builds the train stack for the mode, and starts in the first Stock Round of cycle 1.

**Why this priority**: Nothing else works without a correct starting state.

**Independent Test**: Create a 3-player Long game and a 2-player Short game. Each player has 300 and 450 respectively. The Short game lists 8 minors (without Adaptive, Bridging, Overnight and Spacious). The train stack has one fewer train of each type except 7/∞. The round indicator shows cycle 1, Stock Round.

**Acceptance Scenarios**:

1. **Given** the new-session screen, **When** the user picks RotLA, Long Game, 4 players, **Then** each player starts with 275, all 12 minors are unlaunched, majors are not yet in play, the train stack includes the 4+ player extra 3- and 6-trains, and the game is in cycle 1, Stock Round.
2. **Given** RotLA is picked, **When** the user picks a mode whose player range excludes the number of players entered (for example Short Game with 5 players), **Then** the app warns about it and still allows it (the table wins).
3. **Given** the 2-player Micro game, **When** the session starts, **Then** each player has 225, the train stack is three 2-trains, three 3-trains and three 4-trains, the game lasts 4 cycles, and there is no export step.
4. **Given** the user picked a randomized-minors variant, **When** setup asks which minors are in play, **Then** the user can mark the minors that came out on the map, and only those are offered for launch.

---

### User Story 2 - Launch a minor from an auction (Priority: P1)

In a Stock Round, players auction at the table. When it ends, the banker records "Ana launches Tunneling for 140". The app takes 140 from Ana and puts it in Tunneling's treasury, gives Ana the president's certificate (2 of 5 shares), puts the other 3 shares in the treasury, and sets Tunneling's price to 70 (half the bid rounded down to a printed value in the current phase's range), at the bottom of the 70 stack.

**Why this priority**: This is how every company enters the game. It replaces "par" for this game.

**Independent Test**: In SR 1, record a launch at 165. The minor has 165 in treasury and 3 shares in it. The player has 2 shares, the price is 80, and it sits below any minor already at 80.

**Acceptance Scenarios**:

1. **Given** the yellow phase, **When** a player launches a minor for 140, **Then** the player pays 140 to the minor, holds the president's certificate, the minor holds 3 of its own shares, and its price is 70.
2. **Given** the yellow phase, **When** a launch is recorded for 200 (half = 100, above the yellow ceiling of 90), **Then** the price is set to 90, and the app shows the starting price it used so the table can change it.
3. **Given** a bid below 120 or not a multiple of 5, **When** the launch is recorded, **Then** the app warns and still records it.
4. **Given** two minors launched at the same price, **When** the operating order is shown, **Then** the one launched first operates first.
5. **Given** a launch is recorded by voice ("Ana abre Tunneling por 140"), **When** the confirmation card appears, **Then** it shows the bid, the treasury, the starting price, and the chips Ana hands over.

---

### User Story 3 - Buy and sell shares in the Stock Round (Priority: P1)

A player buys one share from a company's treasury (the money goes to the company) or from the bank pool (the money goes to the bank), at the current price. A player sells any number of shares of one or more companies in one sale; each company sold drops one space for that sale, and the money comes from the bank. The presidency changes when another player holds more shares (ties: the next player clockwise from the current president).

**Why this priority**: These are the most common actions in every Stock Round.

**Independent Test**: A player buys a minor share from the treasury at 80: the minor's treasury rises by 80. Another player sells 2 shares of a different company in one action: that company drops exactly one space.

**Acceptance Scenarios**:

1. **Given** a minor priced at 80 with shares in its treasury, **When** a player buys one from the treasury, **Then** 80 moves from the player to the minor and one share moves to the player.
2. **Given** shares of a company in the pool, **When** a player buys one from the pool, **Then** the money goes to the bank.
3. **Given** a player sells 2 shares of a major at 100, **When** the sale is recorded, **Then** the player receives 200 from the bank, both shares go to the pool, and the price drops to 90 (one step); with the "stock-drops per share" variant it drops to 80.
4. **Given** a minor that has not operated yet, **When** a player sells its shares, **Then** the app warns that it cannot be sold yet and still allows it.
5. **Given** a purchase would give a player more than 60% of a company, or a sale would put more than 50% of a company in the pool, **When** it is recorded, **Then** the app warns and still allows it.
6. **Given** a player who is not president now holds more shares than the president, **When** the purchase is recorded, **Then** the presidency moves to them in the same step.

---

### User Story 4 - End of the Stock Round (Priority: P1)

When the table starts OR 1, the app applies the SR's end step first: every company fully owned by players (no shares in its treasury or the pool) moves up one space.

**Why this priority**: These moves happen every cycle and change operating order and payouts.

**Independent Test**: A minor whose 5 shares are all held by players moves up one space when OR 1 starts, and a minor with a share left in its treasury does not move.

**Acceptance Scenarios**:

1. **Given** a company with all shares held by players, **When** OR 1 starts, **Then** its price goes up one space, once.
2. **Given** a company with one share in its treasury, **When** OR 1 starts, **Then** its price does not change.

---

### User Story 5 - Operate a company: issue/redeem, costs, run and payout (Priority: P1)

During its OR turn a company may issue one share (from its treasury to the pool; the bank pays it the current price; the price drops 1) or redeem one (it pays the bank the current price; one share goes from the pool back to its treasury; no price change). It pays track and token costs. It then runs and either pays out or withholds. The app pays each share its part (payout ÷ 5 for a minor, ÷ 10 for a major), pays the company for its treasury shares, pays nothing for pool shares, and moves the price according to the RotLA payout table, including moving the token to the bottom of its stack when the payout is above 0 but below the price.

**Why this priority**: The payout is the heart of the money the app manages, and the "bottom of stack" rule changes the operating order.

**Independent Test**: A minor at 70 with one share in its treasury runs 310 and pays out. Each share gets 62, the minor gets 62 for its treasury share, and the price rises to 90 (310 ≥ 2 × 70 → +2).

**Acceptance Scenarios**:

1. **Given** a minor at 70, **When** it pays out 310, **Then** each of the 5 shares gets 62 (to holders, or to the minor for its own shares), and the price rises two spaces to 90.
2. **Given** a major at 100, **When** it pays out 60 (above 0, below 100), **Then** each share gets 6, the price stays at 100, and the token moves to the bottom of the 100 stack, so it now operates after the other companies at 100.
3. **Given** a company at 100, **When** it withholds 200, **Then** the company gets 200 from the bank and the price drops one space to 90.
4. **Given** a company with no train, **When** its turn is recorded as a zero run, **Then** the price drops one space.
5. **Given** a company at 80 issues one share, **When** recorded, **Then** the bank pays it 80, the share goes to the pool, and the price drops to 70.
6. **Given** a company at 80 with a share in the pool redeems it, **When** recorded, **Then** the company pays the bank 80, the share returns to its treasury, and the price stays.
7. **Given** Tunneling lays a mountain tile, **When** the table records the mountain cost and the Tunneling bonus, **Then** the company pays 40 and receives 60 from the bank, both shown in its turn summary.

---

### User Story 6 - Trains, phases, rust and forced purchase (Priority: P1)

Companies buy the top train of the stack at its price, a train from the pool at its printed price, or a train from another company at an agreed price (at least 1). The first 3, 5 and 7/∞ change the phase. The first 4, 6 and 7/∞ rust 2s, 3s and 4s. Train limits apply separately to minors and majors, and trains over the limit go to the bank pool. A 7/∞ card can be bought as a 7 for 750, as an ∞ for 1,000, or as an ∞ for 800 plus trading in any non-rusted train. A company with no train and too little cash makes a forced purchase, with its president adding personal cash.

**Why this priority**: Trains are the largest expenses and drive phases, which also change the allowed starting prices and the train limits.

**Independent Test**: A company buys the first 4-train. All 2-trains in the game are removed, minor and major limits become 2/3, and any company over its limit is flagged to move a train to the pool.

**Acceptance Scenarios**:

1. **Given** the yellow phase, **When** the first 3-train is bought, **Then** the phase becomes green, starting prices up to 110 are allowed, and the major train limit becomes 4.
2. **Given** green, **When** the first 4-train is bought, **Then** every 2-train is removed from the game (except as described for Resourceful), and the limits become minor 2, major 3.
3. **Given** a company with a non-rusted 5-train, **When** it buys an ∞ with the trade-in option, **Then** it pays 800 and the 5-train leaves the game.
4. **Given** a company with no train and 150 in treasury, and its president with 400, **When** it must buy the cheapest available train at 300, **Then** the company pays 150 and the president pays 150, in one step.
5. **Given** Resourceful's trains rust, **When** the rust happens, **Then** its rusted trains stay with it, marked as rusted and not counted for the limit, until the table discards them after their last run.
6. **Given** Spacious is over the normal limit by exactly one train, **When** the phase changes, **Then** the app does not flag it as over the limit.

---

### User Story 7 - Merger Round: two minors become a major (Priority: P1)

After OR 2 of a cycle in which the green phase had already started, the app offers a Merger Round, with the minors listed in operating order. The table records "Express and Tunneling merge into Union". The app creates the major with 10 shares: each player's minor shares become the same number of major shares, the new president's certificate goes to the player with the most shares of the two minors (tie: the president of the minor that operates first), and the other minor's president's certificate becomes two single shares. Treasury shares become major treasury shares, pool shares become major pool shares. Treasuries and trains are combined, and both minors leave play. The major's price is the average of the two, rounded down to a printed value, and it enters at the bottom of that stack.

**Why this priority**: Majors exist only through mergers. Without it the game cannot be played past the first green cycle.

**Independent Test**: Two minors at 80 and 70 merge. Ana held 3 + 0 shares and Bruno held 2 + 3. Bruno held 5 of the 10 shares, so Bruno gets the president's certificate and Ana holds 3 single shares. The major is priced at 70 (75 rounded down to a printed value), and its treasury is the sum of both.

**Acceptance Scenarios**:

1. **Given** minors A (80) and B (70), **When** they merge into a major, **Then** the major's price is 70, its token is at the bottom of the 70 stack, and both minors leave the market.
2. **Given** both minors have the same president, **When** they merge, **Then** that player gets the major's president's certificate and the other minor's president's certificate becomes 2 single shares held by them.
3. **Given** two players each hold 5 shares of the merging minors, **When** they merge, **Then** the presidency goes to the player who presided over the minor that operates first.
4. **Given** the merged major has more trains than the major limit, **When** the merger is recorded, **Then** the app flags it, and the president picks a train to move to the pool.
5. **Given** a merger was recorded by mistake, **When** the table undoes it, **Then** both minors, their shares, treasuries, trains and prices are exactly as before.
6. **Given** the phase is still yellow when OR 2 ends, **When** OR 2 ends, **Then** the app goes straight to the export step without offering a Merger Round, even if that export then starts the green phase.
7. **Given** a merger is recorded, **When** the History is opened, **Then** it shows one entry with every share, money and train transfer it made.

---

### User Story 8 - Export, cycles and end of game (Priority: P1)

After the Merger Round (or after OR 2 when there is none), the app exports the top train of the stack (all remaining 2-trains when it is a 2), applying any rust or phase change it causes, then starts the next cycle's Stock Round. After the last cycle (4 in Short and Micro, 6 in Long) the app shows the final scores: each player's cash plus their shares at current prices, without company treasuries, with the tie rule.

**Why this priority**: Export is how the game's clock moves even when no one buys trains. The end-of-game total is the result the table wants.

**Independent Test**: At the end of cycle 1 in yellow, the export removes all remaining 2-trains, so the next train is a 3. When cycle 4 of a Short game ends, the app shows the final scores instead of a new Stock Round.

**Acceptance Scenarios**:

1. **Given** the top train is a 2, **When** the export runs, **Then** all remaining 2-trains leave the game and the next train is the first 3.
2. **Given** the export removes the first 3-train, **When** it runs, **Then** the phase becomes green, and the first Merger Round is offered after OR 2 of the next cycle.
3. **Given** the export removes the first 4-train, **When** it runs, **Then** all 2-trains rust as if it had been bought.
4. **Given** a Micro game, **When** a cycle ends, **Then** no train is exported.
5. **Given** the last cycle of the mode has ended, **When** the export step would follow, **Then** the app shows final scores and the winner; company treasuries are not counted.
6. **Given** the Bank Break variant, **When** the bank reaches 0 during an OR, **Then** the app announces the end trigger, and the game ends after the current set of ORs.

---

### User Story 9 - Dissolution and bankruptcy (Priority: P2)

A company whose price reaches 0 is dissolved: its shares leave the game with no payment, its treasury goes to the bank, and its trains go to the pool. A player who cannot complete a forced train purchase goes bankrupt and is eliminated. Every company they preside over is removed, those trains go to the pool, and every other shareholder is paid the final price for their shares by the bank. The table can then end the game or play on without that player.

**Why this priority**: These are rare, but when they happen the money must be right, and the steps are tedious to do by hand.

**Independent Test**: A company at 10 withholds and drops to 0. Its shares disappear from every holder, its money is back in the bank, and its trains are in the pool.

**Acceptance Scenarios**:

1. **Given** a company at 10, **When** its price moves to 0 for any reason, **Then** in the same step its shares are removed, its treasury goes to the bank, its trains go to the pool, and it leaves the operating order.
2. **Given** a player who presides over two companies is declared bankrupt, **When** it is recorded, **Then** both companies are removed (shares out of the game, trains to the pool, treasuries to the bank), other players receive the current price for each share they held in them, the player's leftover shares go to the pool and leftover cash to the bank, the player is eliminated, and the app offers to end the game.
3. **Given** the Bank Break variant, **When** a bankruptcy is recorded, **Then** the game ends and the final scores are shown.
4. **Given** a player was eliminated and the game continues, **When** a share purchase or launch is recorded, or the final scores are shown, **Then** the eliminated player is not offered as a buyer, and they are listed last as "Eliminado" with no score.

---

### User Story 10 - Voice commands for RotLA (Priority: P2)

Spanish voice commands cover the RotLA-specific actions: launching a minor from an auction, issuing and redeeming a share, merging two minors, the forced purchase, and the ∞ trade-in. They also cover the existing actions with RotLA's company and train names.

**Why this priority**: Voice is a core shortcut of the app (constitution V), but every action is also available by touch, so the game can be played without it.

**Independent Test**: The voice eval set contains RotLA fixtures and cases for launch, issue, redeem, merge and ∞ trade-in, and they meet the same accuracy target as the existing games.

**Acceptance Scenarios**:

1. **Given** a RotLA SR, **When** the banker says "Ana abre Tunneling por 140", **Then** the card proposes the launch with price 70.
2. **Given** a RotLA OR, **When** the banker says "emite una acción" or "recompra una acción", **Then** the card proposes issuing or redeeming one share for the current company.
3. **Given** a Merger Round, **When** the banker says "Express y Tunneling se fusionan en Union", **Then** the card shows the new major, its president, its price, and the share exchange.

---

### User Story 11 - Landmarks expansion effects (Priority: P3)

When the session includes the Landmarks expansion, the app can record the expansion effects that move money, trains or prices. Rock Formation gives a +2 price bonus before the payout, once per company. Cliff sells the running train to the pool for half its price. Canyon gives a free rusted 2-train that becomes permanent, once per company. Manufacturing pays 50 at launch and gets its special 2-train. The new minors and majors can be used. Events, the Metropolitan and the 6–7 player mode are not part of this feature.

**Why this priority**: The expansion is optional, and many groups play the base game. It reuses most base-game capabilities.

**Independent Test**: In a session with Landmarks, a company runs to the Rock Formation: its price rises two spaces before its payout is computed, and the company is marked so the bonus is not offered again.

**Acceptance Scenarios**:

1. **Given** a company at 80 with no Rock Formation postcard, **When** the table records the Rock Formation bonus and then a payout of 160, **Then** the price first goes to 100 (+2), and the payout move is judged against 100 (160 ≥ 100 → +1 to 110).
2. **Given** a company runs a 5-train to the Cliff, **When** the Cliff sale is recorded, **Then** the bank pays the company 225 and the 5-train goes to the pool, before the payout.
3. **Given** the 4-train has been bought and a company with no Canyon train runs to the Canyon, **When** the Canyon is recorded, **Then** a rusted 2-train goes to it as a permanent train that counts for the limit and cannot be sold.
4. **Given** Manufacturing is launched for 140, **When** the launch is recorded, **Then** its treasury is 140 − 50 = 90, it holds the Manufacturing 2-train, and the app warns if a leadoff train is bought.
5. **Given** a session created with the expansion, **When** a merger is recorded, **Then** the 2 new majors are offered alongside the 6 base majors.

---

### Edge Cases

- **Starting price at the phase ceiling**: half the bid can be above the phase's highest allowed price (for example 210 in yellow). The app uses the ceiling and shows the price it used, so the table can override it.
- **Half bid between printed values**: 165 / 2 = 82.5 → 80 (rounded down to a printed value). Above 120 the track has gaps (120, 135, 150…), so 270 / 2 = 135 but 260 / 2 = 130 → 120.
- **Merger average between printed values**: (135 + 120) / 2 = 127.5 → 120. The average of two equal prices stays the same.
- **Merger of minors with trains over the major limit**: allowed and flagged; the president moves a train to the pool.
- **Merger when one minor's president holds no shares of the other**: presidency decided by the total shares of both minors, then by operating order.
- **Price at the top of the track (500)**: further increases leave it at 500.
- **Price reaches 0 during a forced share sale**: the company is dissolved in that same step.
- **Dividends of uneven totals**: revenue is normally a multiple of 10, so per-share amounts are whole. If they are not, the per-share amount is rounded down and the remainder stays in the bank.
- **Two companies at the same price after a "bottom of the stack" move**: operating order uses the stack order, not launch order.
- **Export of the last train of the stack**: when only 7/∞ remain, the export removes one 7/∞, and the supply never runs out.
- **Rusted trains of Resourceful when another rust comes**: they leave as soon as the table marks them as run, whatever the rust event.
- **A player goes bankrupt during a forced purchase**: the partial purchase is not recorded; the table records the bankruptcy as its own action.
- **Trading in a 4 for the first 7/∞**: rust is applied first, so the 4 rusts and leaves the game, and it is not a valid trade-in. The app warns, and the ∞ costs its full price (1,000) unless the table trades in another non-rusted train.
- **Undo across a phase change caused by an export**: undoing the export restores the train stack, the rusted trains, the phase, and the limits.
- **Hostile Mergers variant**: who proposes and how votes go is handled at the table; the app records only the merger that happened, with the same exchange rules.
- **A 2-player Short game or a 5-player Long game**: player counts are valid only for those modes; the app warns about any other combination but never blocks it.

## Requirements *(mandatory)*

### Functional Requirements

**Game definition and setup**

- **FR-001**: The app MUST offer "Railways of the Lost Atlas" as a built-in game, with all its values taken from the two rulebooks and every value not yet checked against them marked as unverified (constitution III).
- **FR-002**: Setup MUST offer the game modes Short, Long, 2-player Micro and 3-player Micro. Each mode sets the minors in play, the train stack, the number of cycles, whether trains are exported, and the starting cash by player count (Background table).
- **FR-003**: Setup MUST offer the base variants that change money or market rules (Stock-drops per share, Bank Break, Headquarters, Hostile Mergers), each off by default, plus a way to mark which minors are in play when a randomized-minors variant is used.
- **FR-004**: The bank MUST be unlimited, except with Bank Break, where it holds 8,000 and the "bank broken" end trigger applies.
- **FR-005**: The train stack MUST be built per mode and player count from the 30 cards: 2-train × 7, 3-train × 6, 4-train × 4, 5-train × 3, 6-train × 3, 7/∞ × 7 (unlimited supply). One 3-train and one 6-train are used only with 4 or more players. The Short game removes one of each type except 7/∞. Micro games use their fixed stacks. With fewer than 4 players in a Long game this gives 7 / 5 / 4 / 3 / 2 / 7/∞; with 4 or 5 players, 7 / 6 / 4 / 3 / 3 / 7/∞.
- **FR-005a**: Each major MUST have two identity names, and the table chooses one at the merger. Names not confirmed from the physical components MUST ship as placeholders marked unverified. The custom-game editor MUST let the user edit both identity names of every major, so a group can correct them without a new release.

**Companies and shares**

- **FR-006**: The app MUST support two kinds of company: minors (5 shares, president's certificate of 2 shares, 4 certificates) and majors (10 shares, president's certificate of 2 shares, 9 certificates). Majors MUST start out of play.
- **FR-007**: The app MUST record a minor's launch as one action (player, minor, winning bid). The bid moves from the player to the minor, the player gets the president's certificate, the other 3 shares go to the minor's treasury, and the starting price is half the bid rounded down to a printed track value, capped by the current phase's range. It MUST warn, and never block, when the bid is below 120, not a multiple of 5, or the result is outside the range.
- **FR-008**: Share purchases MUST support buying from the company treasury (money to the company) and from the pool (money to the bank) at the current price. Sales MUST pay from the bank, send shares to the pool, and move the price down one space per sale (or per share with the variant).
- **FR-009**: The app MUST warn, and never block, on: more than one share bought in a turn, more than 60% held by a player, more than 50% in the pool, selling shares of a minor that has not operated, buying a company the player sold this SR, and (only with Bank Break) going over the certificate limit (16/12/10 for 3/4/5 players).
- **FR-010**: Presidency MUST change when another player holds more shares than the president, and ties MUST go to the next tied player clockwise from the current president.

**Market**

- **FR-011**: The market MUST be the 27-space RotLA stock track, with tokens on the same space kept in arrival order. Any token that enters a space (launch, merger, or price change) MUST go to the bottom of its stack.
- **FR-012**: The operating order MUST be highest price first, then top of the stack first, and it MUST update as prices change during an OR. A company that has already operated in this OR MUST NOT be offered again.
- **FR-013**: Payout moves MUST follow the RotLA table: withhold or zero run −1; payout above 0 and below the price, no change but move to the bottom of the stack; payout at least the price +1; payout at least twice the price +2. Issuing a share MUST move the price −1; redeeming MUST NOT move it.
- **FR-014**: At the end of each SR, every company with all its shares held by players MUST move up one space, applied once as part of starting OR 1.
- **FR-015**: A price that reaches 0 MUST dissolve the company in the same step: its shares are removed with no payment, its treasury goes to the bank, its trains go to the pool, and it leaves the operating order.

**Operating round**

- **FR-016**: Payouts MUST pay each share payout ÷ share count (5 or 10), with treasury shares paid to the company and pool shares paid to no one. Payout modes are full or withhold only, unless a later module adds half-pay.
- **FR-017**: A company MUST be able to issue one share (treasury → pool, the bank pays the current price) or redeem one (pool → treasury, the company pays the bank the current price) during its turn, with a warning, and no block, if it does both or more than one in the same OR.
- **FR-018**: Train purchases MUST support the top of the stack at its price, the pool at its printed price, and another company at any agreed price ≥ 1. The 7/∞ card MUST be buyable as a 7 (750), as an ∞ (1,000), or as an ∞ for 800 plus one non-rusted train traded in. The traded-in train leaves the game. Rust is applied before the trade-in is checked: a train that the purchase itself rusts (a 4 when the first 7/∞ is bought) leaves the game as rusted, and it cannot be traded in.
- **FR-019**: The first 3, 5 and 7/∞ MUST change the phase (green, purple, grey). The first 4, 6 and 7/∞ MUST rust 2s, 3s and 4s. These MUST apply whether the train is bought or exported.
- **FR-020**: Train limits MUST be defined separately for minors and majors per phase (2/–, 2/4, 2/3, 1/2). Companies over the limit MUST be flagged so the president moves trains of their choice to the pool. Spacious MUST have one extra slot.
- **FR-021**: A forced train purchase MUST take the company's treasury first and then the president's cash, as one step. If the president must sell shares, the sales MUST be recorded in the same group, and each affected company MUST move down only once after all the sales.
- **FR-022**: Resourceful's trains MUST be kept as "rusted, one last run" when they would rust, not counted for the limit, and removed when the table discards them.
- **FR-023**: Minor abilities that move money MUST be recordable as named actions in the turn: the Tunneling mountain tile (one action: the company pays 40 for the tile and the bank pays it 60), and the Expansive token (the company pays 40). Each is one event group. Majors' token costs and track costs use the existing pay-cost action.

**Rounds, mergers and end of game**

- **FR-024**: The round sequence MUST be cycles of Stock Round → OR 1 → OR 2 → Merger Round (only when the phase is green or later at the end of OR 2) → export → next cycle. The number of cycles comes from the mode, and the round indicator MUST show the cycle and the round.
- **FR-025**: The export step MUST remove the top train of the stack (all remaining 2-trains when it is a 2), apply the rust and phase effects that train would trigger, and be skipped in Micro games.
- **FR-026**: The app MUST record a merger of two minors into a chosen major as one undoable action that: exchanges every minor share 1:1 for a major share in the same holder (other president's certificate → 2 single shares); gives the president's certificate to the player with the most combined shares (tie: the president of the minor that operates first); moves both treasuries and all trains to the major; sets the major's price to the average of the two rounded down to a printed value, at the bottom of that stack; and removes both minors from play. The app MUST warn if the merged major is over its train limit.
- **FR-027**: During a Merger Round the app MUST show the minors in operating order and let the table record mergers or move on, without enforcing who may propose or consent.
- **FR-028**: Bankruptcy MUST be recordable as one action. It removes every company the bankrupt player presides over (pays every other holder the current price per share from the bank, sends all its shares out of the game, its trains to the pool and its treasury to the bank), then sends the player's leftover shares to the pool and leftover cash to the bank, and eliminates the player. It offers to end the game (it ends the game with Bank Break). An eliminated player MUST NOT be offered in player pickers.
- **FR-029**: At the end of the last cycle, or on any end trigger, the app MUST show each player's score (cash + shares × current price, company treasuries excluded) and the winner, using RotLA's tie rule. Eliminated players are listed last, as "Eliminado", with no score.

**Voice and history**

- **FR-030**: Every new action (launch, redeem, merge, export, bankruptcy, minor-ability bonuses, ∞ trade-in) MUST be available by touch and by Spanish voice, through the same validation path, and appear as one entry in the History with one-tap undo.
- **FR-031**: The voice eval set MUST include RotLA fixtures and cases for every new action before any voice change for RotLA is merged.

**Landmarks expansion**

- **FR-032**: When the expansion is enabled at setup, the app MUST support the expansion's money-moving effects: Rock Formation (+2 price, once per company, before the payout), Cliff (the bank pays half the train's printed price and the train goes to the pool), Canyon (a rusted 2-train becomes a permanent train of the company, once per company), Manufacturing (pays 50 at launch and gets the Manufacturing 2-train, which has no value and cannot be sold or traded in), and the new minors and majors.
- **FR-033**: The Events module, the Metropolitan Transit Department, the 6–7 player mode and Launching Direct-to-Major are out of scope. A session that uses them at the table MUST still be playable by recording their effects with the existing manual adjustments (money, price, train), and the app MUST NOT offer them as setup options.

### Key Entities *(include if feature involves data)*

- **Minor company**: a company of 5 shares launched by auction. It has a treasury, trains, a price and stack position, a "has operated" flag, and an ability (only money- or train-relevant abilities have behavior in the app).
- **Major corporation**: a company of 10 shares created by merging two minors (or, in the expansion, launched directly). It records which minors formed it, so their abilities carry over, and which of its two identities was chosen.
- **Stock track**: a 1-D list of printed prices with an ordered stack of tokens on each space, and phase-dependent starting price ranges.
- **Cycle**: a numbered group of rounds (SR, OR 1, OR 2, optional Merger Round, export). The game mode sets how many there are.
- **Train card**: a type, its price(s), its count (by mode and player count), and whether it is permanent or rusted. 7/∞ is one card with two faces and an ∞ trade-in price.
- **Game mode**: Short, Long, Micro 2p or Micro 3p. It selects the starting cash, minors, train stack, cycles and export.
- **Landmarks marker** *(expansion)*: per-company one-time flags (Rock Formation postcard, Canyon train taken).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full Short game (4 cycles) and a full Long game (6 cycles) can be played with the app handling all money, shares, prices, trains and mergers, with no manual corrections other than misheard commands or table mistakes.
- **SC-002**: The worked examples in the rulebooks give the same results in the app: the Diagram 3 launches (prices 80, 80 below, 70) and the Diagram 8 payout (310 → 62 per minor share).
- **SC-003**: A merger takes at most 3 taps or one voice command plus a confirmation, and one undo restores the state before it exactly.
- **SC-004**: Launching a minor, buying or selling a share, issuing or redeeming, and paying out each take at most 2 taps or one short voice command, as in the existing games.
- **SC-005**: Every price move and every money transfer the app makes in a RotLA game can be traced to one History entry, and the share count of every company matches its certificates after every action (no invariant warnings in a full playthrough).
- **SC-006**: RotLA voice cases in the eval set meet the same accuracy target as the existing games (≥ 90% of common OR commands correct).
- **SC-007**: The existing games (1830, 1848, 21Moon) behave exactly as before: all their existing tests and voice eval results are unchanged.

## Assumptions

- The base game rulebook is the 2nd English edition (2024). Where it and the expansion disagree, the expansion wins only when that module is enabled.
- "Rounded down to the nearest printed value" for the starting price and the merger price means the highest printed track value not above the computed amount.
- Dividends: revenue is normally a multiple of 10, so per-share amounts are whole. Where they are not, the amount is rounded down and the remainder stays in the bank (the rulebook does not say; confirmed by the user).
- At the top of the track (500), increases stop there (the rulebook does not say; confirmed by the user).
- When a company is dissolved at 0, its treasury goes to the bank (stated). When a player goes bankrupt, the treasuries of every company they presided over also go to the bank, and so does their leftover cash; their leftover shares go to the pool (the rulebook does not say; confirmed by the user).
- The order of the face-up minor charters (the 3–4 columns) is handled at the table. The app lets any unlaunched minor in play be launched, and does not warn about it.
- Map, track, token placement legality, routes, Distant Destination values, and route-only abilities and landmarks stay out of scope. The table enters the revenue.
- The token costs on the major charters (FREE, FREE, 60, 60) and the hub token costs of minors are paid with the existing pay-cost action; the app does not track token counts.
- The minor and major names come from the base rulebook (minors: Adaptive, Agricultural, Bridging, Eastern Mining, Expansive, Express, Northern Port, Overnight, Resourceful, Spacious, Suburban, Tunneling; majors: Consortium, Union, System, International, Federation, Experiment; second identities Conglomerate, Unlimited and Syndicate for the first three (inferred, unverified) and placeholders for the other three). The expansion majors are Authority and League (user-confirmed); each has a second identity (L p.3), still a placeholder. Minor colors were confirmed by the user from B p.24 (Adaptive light purple, Overnight black, Bridging aqua/light blue, Spacious light green, Expansive pink, Suburban light pink, Resourceful light brown, Agricultural green, Tunneling gray, Eastern Mining brown, Northern Port blue, Express red). Authority is light gray or white and League is dark gray or gray (user-confirmed). Base majors (user-confirmed): Consortium red, Union orange, System yellow, International light blue/cyan, Federation green, Experiment purple. Expansion minors (user-confirmed): Twin Cities light blue, Circus purple, Coupling cyan, Manufacturing mustard. Second identities with no known name ship as placeholders ("<name> II") by the user's decision and may be updated in a future spec.
- Per-share dividends always round down. The remainder stays in the bank (user-confirmed).
- The game prints no money symbol; the app shows `$`.
- This feature brings **mergers** into scope. docs/spec.md §2.2 lists them as a later iteration ("Mergers, conversions, and company closures (18CZ, Railways of the Lost Atlas)"), and constitution VII allows them now that a supported game needs them. docs/spec.md MUST be updated in the same change.
- The UI and voice remain in Spanish, as in the rest of the app. Company names are kept in English, with Spanish aliases for voice.

## Dependencies

- Values not printed in the rulebooks come from the user's physical copy (train counts, confirmed in Clarifications) or stay as unverified placeholders until then: the second identity names of the majors (three pairs inferred from fwtwr.com and 18xx.cat; none known for International, Federation, Experiment, Authority and League).
- The existing end-of-round mechanism (feature 003) is reused for the end-of-SR step and extended to the Merger Round and export steps.
