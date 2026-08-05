// Session "seed" keys used to carry a saved group into a new-game wizard.
//
// The group detail page (/home/groups/[id]) writes the group's id under one of
// these keys, then routes to the pool or tournament wizard. That wizard reads
// the key on the relevant step, loads the group's members (and, for pool, its
// saved format defaults), and clears the key — so it's consumed exactly once.
// Kept in lib (not a page) because Next.js pages may only export the component.
export const POOL_GROUP_SEED_KEY = 'pool_group_seed';
export const TOURNAMENT_GROUP_SEED_KEY = 'tournament_group_seed';
