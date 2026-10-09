/** Action builders for stock-round tests. */

export const par = (player: string, company: string, price: number) => ({ type: "parCompany", player, company, price });

export const buy = (buyer: string, company: string, source: "ipo" | "pool" | "treasury" = "ipo", count: number | null = null) => ({
  type: "buyShare",
  buyer: buyer.includes(":") ? buyer : `player:${buyer}`,
  company,
  source,
  count,
});

export const sell = (seller: string, company: string, count: number) => ({
  type: "sellShares",
  seller: seller.includes(":") ? seller : `player:${seller}`,
  company,
  count,
});

export const endSR = { type: "endSR" } as const;
export const startSR = { type: "startSR" } as const;
