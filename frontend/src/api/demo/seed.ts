import type { Account, Category, Payee, Transaction, User } from "@/lib/types";

// Fictional demo data. "Harbourline Bank" is not a real bank.

export const DEMO_USER: User = { id: "u-1", name: "Alex Tan", email: "alex.tan@demo.harbourline.sg" };
export const DEMO_PASSWORD = "Demo@1234";

export const DEMO_PAYEES: Payee[] = [
  { id: "p-1", name: "Mei Ling Wong", bankName: "Harbourline Bank", accountNumber: "204-55821-3" },
  { id: "p-2", name: "Rajesh Kumar", bankName: "Coastal Savings Bank", accountNumber: "018-662417-0" },
  { id: "p-3", name: "Sunrise Property Mgmt", bankName: "Strait Commerce Bank", accountNumber: "731-20094-8" },
];

type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, min: number, max: number) => Math.round(min + rng() * (max - min));
const pick = <T,>(rng: Rng, items: readonly T[]) => items[Math.floor(rng() * items.length)];

const MERCHANTS: Partial<Record<Category, string[]>> = {
  groceries: ["Neighbourhood Supermarket", "Wet Market Produce", "Online Grocery Delivery"],
  dining: ["Hawker Centre", "Kopitiam", "Bubble Tea Shop", "Food Delivery", "Café Brunch"],
  transport: ["MRT / Bus Fare", "Ride-hail Trip", "Petrol Station"],
  shopping: ["Online Marketplace", "Electronics Store", "Department Store", "Bookshop"],
  entertainment: ["Cinema", "Music Streaming", "Video Streaming", "Badminton Court Booking"],
  health: ["GP Clinic", "Pharmacy", "Dental Clinic"],
};

interface Draft {
  accountId: string;
  postedAt: Date;
  description: string;
  category: Category;
  amountCents: number;
  reference: string | null;
}

/** Builds ~6 months of realistic activity ending at `now`. Deterministic for a given seed. */
export function buildSeed(now: Date, seed = 42): { accounts: Account[]; transactions: Transaction[] } {
  const rng = createRng(seed);
  const accounts: Account[] = [
    { id: "a-cur", name: "Everyday Current", type: "current", accountNumber: "201-34567-8", currency: "SGD", balanceCents: 0 },
    { id: "a-sav", name: "Bonus Saver", type: "savings", accountNumber: "201-90412-6", currency: "SGD", balanceCents: 0 },
    { id: "a-goal", name: "Travel Goal", type: "savings", accountNumber: "201-77153-2", currency: "SGD", balanceCents: 0 },
  ];
  const opening: Record<string, number> = { "a-cur": 1_200_000, "a-sav": 2_150_000, "a-goal": 180_000 };

  const drafts: Draft[] = [];
  const add = (d: Draft) => {
    if (d.postedAt <= now) drafts.push(d);
  };
  const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h, between(rng, 0, 59));

  for (let back = 5; back >= 0; back--) {
    const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const y = month.getFullYear();
    const m = month.getMonth();
    const days = new Date(y, m + 1, 0).getDate();

    add({ accountId: "a-cur", postedAt: at(y, m, 1, 9), description: "Rent — Sunrise Property Mgmt", category: "housing", amountCents: -240_000, reference: "RENT" });
    add({ accountId: "a-cur", postedAt: at(y, m, 5), description: "Electricity & Water", category: "utilities", amountCents: -between(rng, 9_000, 16_000), reference: null });
    add({ accountId: "a-cur", postedAt: at(y, m, 8), description: "Mobile & Broadband Plan", category: "utilities", amountCents: -6_490, reference: null });
    add({ accountId: "a-cur", postedAt: at(y, m, 25, 8), description: "Salary — Peerline Tech Pte Ltd", category: "salary", amountCents: 620_000, reference: "SALARY" });
    add({ accountId: "a-cur", postedAt: at(y, m, 26), description: "Transfer to Travel Goal", category: "transfer", amountCents: -50_000, reference: "SAVINGS" });
    add({ accountId: "a-goal", postedAt: at(y, m, 26), description: "Transfer from Everyday Current", category: "transfer", amountCents: 50_000, reference: "SAVINGS" });
    add({ accountId: "a-cur", postedAt: at(y, m, 26), description: "Transfer to Bonus Saver", category: "transfer", amountCents: -100_000, reference: "SAVINGS" });
    add({ accountId: "a-sav", postedAt: at(y, m, 26), description: "Transfer from Everyday Current", category: "transfer", amountCents: 100_000, reference: "SAVINGS" });
    add({ accountId: "a-sav", postedAt: at(y, m, days, 23), description: "Bonus Interest", category: "other", amountCents: between(rng, 3_000, 5_500), reference: null });

    const spend: [Category, number, number, number][] = [
      // category, count, min cents, max cents
      ["groceries", between(rng, 5, 7), 2_500, 16_000],
      ["dining", between(rng, 12, 18), 450, 6_500],
      ["transport", between(rng, 15, 22), 120, 2_800],
      ["shopping", between(rng, 2, 5), 1_500, 25_000],
      ["entertainment", between(rng, 2, 4), 990, 4_500],
      ["health", between(rng, 0, 2), 2_000, 9_000],
    ];
    for (const [category, count, min, max] of spend) {
      for (let i = 0; i < count; i++) {
        add({
          accountId: "a-cur",
          postedAt: at(y, m, between(rng, 1, days), between(rng, 8, 21)),
          description: pick(rng, MERCHANTS[category] ?? ["Purchase"]),
          category,
          amountCents: -between(rng, min, max),
          reference: null,
        });
      }
    }
  }

  drafts.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
  const running = { ...opening };
  const transactions: Transaction[] = drafts.map((d, i) => {
    running[d.accountId] += d.amountCents;
    return {
      id: `t-${String(i + 1).padStart(5, "0")}`,
      accountId: d.accountId,
      postedAt: d.postedAt.toISOString(),
      description: d.description,
      category: d.category,
      amountCents: d.amountCents,
      balanceAfterCents: running[d.accountId],
      reference: d.reference,
    };
  });
  for (const account of accounts) account.balanceCents = running[account.id];

  return { accounts, transactions: transactions.reverse() };
}
