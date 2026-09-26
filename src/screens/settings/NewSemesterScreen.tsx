import { Card, CardContent } from "@/components/ui/card";
import { CalendarPlus } from "lucide-react";

/** Placeholder -- further instructions to come later. */
export function NewSemesterScreen() {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <CalendarPlus className="h-5 w-5 text-primary" />
        New Semester
      </h2>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Rememeber to finish</CardContent>
      </Card>
    </div>
  );
}
