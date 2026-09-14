import { useMemo, useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Search } from "lucide-react";
import { DEV_LEVELS } from "../domain/constants";
import type { ProgramLearningOutcomeSection, TrainingObjective } from "../domain/types";

interface Props {
  sections: ProgramLearningOutcomeSection[];
}

function matchesSearch(objective: TrainingObjective, query: string): boolean {
  const haystack = [
    objective.number,
    objective.title,
    objective.requirements,
    objective.additionalInfo,
    ...objective.performanceMeasures.map((pm) => pm.text),
    ...objective.references,
    ...objective.relatedLessons,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * Pure reference view: the complete explanation for every Training Objective
 * (Requirements, Performance Measures, References, Related Lessons, Instructor,
 * Additional Information), organized Program Learning Outcome -> sub-area ->
 * objective. No login required, no completion affordance -- open to everyone.
 */
export function ReferenceLibraryScreen({ sections }: Props) {
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState<string[]>([]);

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  const filteredSections = useMemo(() => {
    if (!searching) return sections;
    return sections
      .map((section) => ({
        ...section,
        subAreas: section.subAreas
          .map((sa) => ({ ...sa, objectives: sa.objectives.filter((o) => matchesSearch(o, query)) }))
          .filter((sa) => sa.objectives.length > 0),
      }))
      .filter((section) => section.subAreas.length > 0);
  }, [sections, searching, query]);

  const openValue = searching ? filteredSections.map((s) => s.plo) : manualOpen;

  return (
    <div>
      <h2 className="mb-2 text-2xl font-semibold">Reference Library</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        The complete AFROTCI 36-2011 Vol 1 Training Objectives catalog, independent of any cadet. "Reference only — not graded" objectives
        are shown for context but are never tracked toward completion.
      </p>

      <div className="relative mb-4 w-80">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by number, title, requirements, performance measures..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Accordion type="multiple" value={openValue} onValueChange={(v) => !searching && setManualOpen(v)}>
        {filteredSections.map((section) => (
          <AccordionItem key={section.plo} value={section.plo}>
            <AccordionTrigger>{section.plo}</AccordionTrigger>
            <AccordionContent>
              {section.subAreas.map((subArea) => (
                <div key={subArea.subArea} className="mb-6">
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">{subArea.subArea}</h4>
                  <div className="grid gap-4">
                    {subArea.objectives.map((objective) => (
                      <div key={objective.id} className="rounded-lg border border-input p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h5 className="text-base font-semibold">
                            {objective.number} — {objective.title}
                          </h5>
                          {!objective.graded && <Badge variant="outline">Reference only — not graded</Badge>}
                        </div>

                        <div className="grid gap-3 text-sm">
                          {objective.requirements && (
                            <div>
                              <span className="font-medium">Requirements: </span>
                              <span className="whitespace-pre-wrap text-muted-foreground">{objective.requirements}</span>
                            </div>
                          )}

                          {objective.performanceMeasures.length > 0 && (
                            <div>
                              <span className="font-medium">Performance Measures:</span>
                              <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                                {objective.performanceMeasures.map((pm, i) => (
                                  <li key={i}>
                                    {pm.text}
                                    {pm.optional && <span className="ml-1 italic">(Optional)</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {objective.references.length > 0 && (
                            <div>
                              <span className="font-medium">References: </span>
                              <span className="text-muted-foreground">{objective.references.join("; ")}</span>
                            </div>
                          )}

                          {objective.relatedLessons.length > 0 && (
                            <div>
                              <span className="font-medium">Related Lesson/s: </span>
                              <span className="text-muted-foreground">{objective.relatedLessons.join("; ")}</span>
                            </div>
                          )}

                          {objective.instructor && (
                            <div>
                              <span className="font-medium">Instructor: </span>
                              <span className="text-muted-foreground">{objective.instructor}</span>
                            </div>
                          )}

                          {objective.additionalInfo && (
                            <div>
                              <span className="font-medium">Additional Information: </span>
                              <span className="whitespace-pre-wrap text-muted-foreground">{objective.additionalInfo}</span>
                            </div>
                          )}

                          <Table aria-label={`Proficiency requirements for Training Objective ${objective.number}`} className="mt-1">
                            <TableHeader>
                              <TableRow>
                                {DEV_LEVELS.map((lvl) => (
                                  <TableHead key={lvl} className="w-24">
                                    {lvl}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow>
                                {DEV_LEVELS.map((lvl) => (
                                  <TableCell key={lvl}>{objective.proficiencyByLevel[lvl] || "N/A"}</TableCell>
                                ))}
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {filteredSections.length === 0 && searching && (
        <p className="text-sm text-muted-foreground">No Training Objectives match "{search}".</p>
      )}
      {sections.length === 0 && !searching && (
        <p className="text-sm text-muted-foreground">
          No Training Objectives loaded yet. An admin can import the catalog from the Roster screen.
        </p>
      )}
    </div>
  );
}
