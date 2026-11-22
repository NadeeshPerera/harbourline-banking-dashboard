import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";
import { MAX_REFERENCE_LENGTH, type Account, type TransferDestination } from "@/lib/types";

/** "account:<id>" or "payee:<id>" from the destination <select>. */
export function parseDestination(value: string): TransferDestination | null {
  const [type, id] = value.split(":");
  if (!id) return null;
  if (type === "account") return { type, accountId: id };
  if (type === "payee") return { type, payeeId: id };
  return null;
}

/** Built per render so the balance check uses the latest account data. */
export function makeTransferSchema(accounts: Account[]) {
  return z
    .object({
      fromAccountId: z.string().min(1, "Choose an account to pay from"),
      destination: z.string().min(1, "Choose who to pay"),
      amount: z.string().trim().min(1, "Enter an amount"),
      reference: z.string().trim().max(MAX_REFERENCE_LENGTH, `Use ${MAX_REFERENCE_LENGTH} characters or fewer`),
    })
    .superRefine((values, ctx) => {
      const cents = parseAmountToCents(values.amount);
      if (values.amount && (cents === null || cents <= 0)) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount, e.g. 120.50" });
      }
      const from = accounts.find((a) => a.id === values.fromAccountId);
      if (from && cents !== null && cents > from.balanceCents) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "This is more than the available balance" });
      }
      if (values.destination === `account:${values.fromAccountId}`) {
        ctx.addIssue({ code: "custom", path: ["destination"], message: "Choose a different account" });
      }
    });
}

export type TransferFormValues = z.infer<ReturnType<typeof makeTransferSchema>>;
