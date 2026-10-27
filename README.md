# Riddle Rally

A live, text-based clue hunt for 2–8 players. Explore five locations, solve the place riddle, reveal your private item clue, and race to find the hidden object.

**Play:** The standalone public link will appear here after the Cloudflare Worker is connected.

## Game features

- Room codes for joining a shared game
- Library, Garden, Castle, Museum, and Observatory
- 60-second hunts and a private second clue for each player
- First-place, speed-bonus, and co-op scoring options
- Target-score, fixed-hunt, and match-timer endings
- A 15-second window for other players to solve after the first find

## Build and test

From `app/`, run `bun install`, then `bun run build` or `bun run test`.

## Cloudflare hosting

Connect this GitHub repository to a Cloudflare Worker with `app/` as the root directory, `bun run build` as the build command, and `npx wrangler deploy` as the deploy command. The Worker uses Cloudflare Durable Objects for multiplayer rooms and serves a public `workers.dev` URL.
