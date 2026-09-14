import { useMemo, useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProficiencyCode } from "../domain/constants";
import { computeCadetProgress, bestCompletionForObjective, getObjectiveStatus } from "../domain/progress";
import { CompletionEntryDialog } from "../components/CompletionEntryDialog";
import { ObjectiveExplanationDialog } from "../components/ObjectiveExplanationDialog";
import { CadetCombobox } from "../components/CadetCombobox";
import type { CompletionInput } from "../hooks/useCompletions";
import type { Cadet, Completion, PmtEvent, ProgramLearningOutcomeSection, TrainingObjective } from "../domain/types";

interface Props {
  cadetId: string;
  cadets: Cadet[];
  sections: ProgramLearningOutcomeSection[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  createCompletion: (input: CompletionInput) => Promise<Completion>;
  updateCompletion: (id: string, input: CompletionInput) => Promise<Completion>;
  onSelectCadet: (cadetId: string) => void;
}

export function CadetDetailScreen({ cadetId, cadets, sections, completions, pmtEvents, createCompletion, updateCompletion, onSelectCadet }: Props) {
  const cadet = cadets.find((c) => c.id === cadetId);
  const [dialogObjective, setDialogObjective] = useState<TrainingObjective | undefined>();
  const [explanationObjective, setExplanationObjective] = useState<TrainingObjective | undefined>();

  const cadetCompletions = useMemo(() => completions.filter((c) => c.cadetId === cadetId), [completions, cadetId]);
  const catalog = useMemo(() => sections.flatMap((s) => s.subAreas.flatMap((sa) => sa.objectives)), [sections]);
  const progress = useMemo(
    () => computeCadetProgress(cadet?.devLevel, catalog, cadetCompletions, pmtEvents),
    [cadet, catalog, cadetCompletions, pmtEvents]
  );

  const sectionsWithRequirement = useMemo(() => {
    if (!cadet?.devLevel) return [];
    const level = cadet.devLevel;
    return sections.filter((s) => s.subAreas.some((sa) => sa.objectives.some((o) => o.graded && o.proficiencyByLevel[level] !== ""))).map((s) => s.plo);
  }, [sections, cadet?.devLevel]);

  if (!cadet) {
    return <p>Cadet not found.</p>;
  }

  const activeCompletion = dialogObjective ? bestCompletionForObjective(dialogObjective.id, cadetCompletions) : undefined;
  const activeRequiredProficiency =
    dialogObjective && cadet.devLevel ? (dialogObjective.proficiencyByLevel[cadet.devLevel] as ProficiencyCode) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <CadetCombobox cadets={cadets} value={cadet.id} onChange={onSelectCadet} />
        <h2 className="text-2xl font-semibold">{cadet.name}</h2>
        <Badge variant="outline">{cadet.devLevel ?? "No dev level set"}</Badge>
        <Badge variant="outline">{cadet.asClass ?? "No AS class set"}</Badge>
        <div className="flex min-w-56 items-center gap-2">
          <Progress value={progress.percent} className="w-40" />
          <span className="text-sm">
            {progress.completedCount}/{progress.requiredCount} ({progress.percent}%)
          </span>
        </div>
      </div>

      {!cadet.devLevel && (
        <p className="mb-4 text-sm text-muted-foreground">This cadet has no dev level set, so no Training Objectives are required yet. Set it from the Roster screen.</p>
      )}

      <Accordion type="multiple" defaultValue={sectionsWithRequirement}>
        {sections.map((section) => (
          <AccordionItem key={section.plo} value={section.plo}>
            <AccordionTrigger>{section.plo}</AccordionTrigger>
            <AccordionContent>
              {section.subAreas.map((subArea) => (
                <div key={subArea.subArea} className="mb-4">
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">{subArea.subArea}</h4>
                  <Table aria-label={`Training Objectives for ${subArea.subArea}`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Number</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-24">Required</TableHead>
                        <TableHead className="w-64">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subArea.objectives.map((objective) => {
                        const required = cadet.devLevel ? objective.proficiencyByLevel[cadet.devLevel] : "";
                        const applicable = objective.graded && required !== "";
                        const info = cadet.devLevel ? getObjectiveStatus(objective, cadet.devLevel, pmtEvents, cadetCompletions) : undefined;
                        const nextOccurrence = info?.occurrences.find((e) => new Date(e.eventDate).getTime() > Date.now());
                        const lastOccurrence = [...(info?.occurrences ?? [])].reverse()[0];

                        return (
                          <TableRow
                            key={objective.id}
                            className={cn(applicable ? "cursor-pointer" : "text-muted-foreground")}
                            onClick={() => applicable && setDialogObjective(objective)}
                          >
                            <TableCell>{objective.number}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5">
                                {objective.title}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExplanationObjective(objective);
                                  }}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TableCell>
                            <TableCell>{objective.graded ? required || "N/A" : "—"}</TableCell>
                            <TableCell>
                              {!objective.graded ? (
                                <Badge variant="outline">Reference only — not graded</Badge>
                              ) : !applicable ? (
                                <span className="text-sm text-muted-foreground">Not required at this level</span>
                              ) : info?.status === "completed" ? (
                                <span className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                  {info.bestCompletion?.proficiencyAchieved} on {info.bestCompletion?.dateCompleted?.slice(0, 10)}
                                </span>
                              ) : info?.status === "missed" ? (
                                <span className="flex items-center gap-2 text-sm text-destructive">
                                  <TriangleAlert className="h-4 w-4" />
                                  Missed — last PMT was {lastOccurrence && new Date(lastOccurrence.eventDate).toLocaleDateString()}
                                </span>
                              ) : info?.status === "due" ? (
                                <span className="flex items-center gap-2 text-sm">
                                  <Circle className="h-4 w-4 text-warning" />
                                  Due — click to log
                                  {nextOccurrence && ` (next PMT ${new Date(nextOccurrence.eventDate).toLocaleDateString()})`}
                                </span>
                              ) : info?.status === "upcoming" ? (
                                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Clock className="h-4 w-4" />
                                  Upcoming — {nextOccurrence && new Date(nextOccurrence.eventDate).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">Not yet scheduled</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {dialogObjective && activeRequiredProficiency && (
        <CompletionEntryDialog
          open
          onClose={() => setDialogObjective(undefined)}
          cadet={cadet}
          cadets={cadets}
          objective={dialogObjective}
          requiredProficiency={activeRequiredProficiency}
          existingCompletion={activeCompletion}
          onSave={async (input) => {
            if (activeCompletion) {
              await updateCompletion(activeCompletion.id, input);
            } else {
              await createCompletion(input);
            }
          }}
        />
      )}

      {explanationObjective && <ObjectiveExplanationDialog open onClose={() => setExplanationObjective(undefined)} objective={explanationObjective} />}
    </div>
  );
}
