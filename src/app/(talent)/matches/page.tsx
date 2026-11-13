import { MatchesView } from "@/features/matching/MatchesView";

export const dynamic = "force-dynamic";

export default function MatchesPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <MatchesView />
    </main>
  );
}
