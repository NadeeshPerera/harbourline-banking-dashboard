import { TransferFlow } from "@/components/transfer/TransferFlow";

export const metadata = { title: "Transfer" };

export default function TransferPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Transfer money</h1>
      <TransferFlow />
    </div>
  );
}
