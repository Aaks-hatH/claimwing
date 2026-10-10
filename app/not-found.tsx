import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild variant="outline">
            <Link href="/app">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
