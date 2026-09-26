import { useEffect, useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, RotateCcw, Save } from "lucide-react";
import type { EmailTemplate } from "../../hooks/useEmailTemplates";

interface Props {
  templates: Record<string, EmailTemplate>;
  saveTemplate: (id: string, subject: string, body: string) => Promise<void>;
}

interface TemplateDef {
  id: string;
  label: string;
  trigger: string;
  placeholders: string[];
  defaultSubject: string;
  defaultBody: string;
}

// Defaults mirror the built-in fallbacks baked into the Cloud Functions (afrotc-functions repo) --
// a template here overrides that default; nothing here needs to exist for the emails to work.
const TEMPLATE_DEFS: TemplateDef[] = [
  {
    id: "absence-assigned",
    label: "Absence Memo assigned",
    trigger: "Sent the instant a cadet is marked Absent in Accountability.",
    placeholders: ["cadetName", "pmtSessionLabel", "sessionEndTime", "deadline", "submitLink", "commanderTitle"],
    defaultSubject: "Absence Memorandum required -- 72 hours to submit",
    defaultBody:
      "Good Morning, {{cadetName}},<br><br>" +
      "You were marked absent for {{pmtSessionLabel}}. You have 72 hours from the end of that session ({{sessionEndTime}}) " +
      "to submit an Absence Memorandum, or the absence will stand as unexcused.<br><br>" +
      "Your deadline is on {{deadline}}<br><br>" +
      "Submit here: {{submitLink}}<br><br>" +
      "For any questions and concerns contact your {{commanderTitle}}.<br><br>" +
      "<strong>This is an automated message, DO NOT reply to this email.</strong>",
  },
  {
    id: "absence-returned",
    label: "Absence Memo returned",
    trigger: "Sent when cadre returns an Absence Memo for fixes.",
    placeholders: ["greeting", "cadetName", "returnReason", "deadline", "submitLink", "commanderTitle"],
    defaultSubject: "Your Absence Memorandum was returned -- 48 hours to resubmit",
    defaultBody:
      "{{greeting}}, {{cadetName}},<br><br>" +
      "Your absence memorandum was returned for the following reason:<br>" +
      "{{returnReason}}<br><br>" +
      "Please fix it and resubmit within 48 hours.<br><br>" +
      "Your new deadline is on {{deadline}}<br><br>" +
      "Submit here: {{submitLink}}<br><br>" +
      "For any questions and concerns contact your {{commanderTitle}}.<br><br>" +
      "<strong>This is an automated message, DO NOT reply to this email.</strong>",
  },
  {
    id: "deviation-assigned",
    label: "Deviation Memo assigned",
    trigger: "Sent the instant a cadre member assigns a Deviation Memo to a cadet.",
    placeholders: ["cadetName", "reason", "dueDate", "submitLink", "commanderTitle"],
    defaultSubject: "Deviation Memorandum required",
    defaultBody:
      "Good Morning, {{cadetName}},<br><br>" +
      "You have been assigned a Deviation Memorandum for the following reason:<br>" +
      "{{reason}}<br><br>" +
      "Your deadline to submit is on {{dueDate}}<br><br>" +
      "Submit here: {{submitLink}}<br><br>" +
      "For any questions and concerns contact your {{commanderTitle}}.<br><br>" +
      "<strong>This is an automated message, DO NOT reply to this email.</strong>",
  },
  {
    id: "deviation-returned",
    label: "Deviation Memo returned",
    trigger: "Sent when cadre returns a Deviation Memo for fixes.",
    placeholders: ["greeting", "cadetName", "returnReason", "deadline", "submitLink", "commanderTitle"],
    defaultSubject: "Your Deviation Memorandum was returned -- 48 hours to resubmit",
    defaultBody:
      "{{greeting}}, {{cadetName}},<br><br>" +
      "Your deviation memorandum was returned for the following reason:<br>" +
      "{{returnReason}}<br><br>" +
      "Please fix it and resubmit within 48 hours.<br><br>" +
      "Your new deadline is on {{deadline}}<br><br>" +
      "Submit here: {{submitLink}}<br><br>" +
      "For any questions and concerns contact your {{commanderTitle}}.<br><br>" +
      "<strong>This is an automated message, DO NOT reply to this email.</strong>",
  },
];

function TemplateEditor({
  def,
  saved,
  saveTemplate,
}: {
  def: TemplateDef;
  saved: EmailTemplate | undefined;
  saveTemplate: (id: string, subject: string, body: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState(saved?.subject ?? def.defaultSubject);
  const [body, setBody] = useState(saved?.body ?? def.defaultBody);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setSubject(saved?.subject ?? def.defaultSubject);
    setBody(saved?.body ?? def.defaultBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.subject, saved?.body]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTemplate(def.id, subject, body);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSubject(def.defaultSubject);
    setBody(def.defaultBody);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{def.trigger}</p>
      <p className="text-xs text-muted-foreground">
        Available placeholders: {def.placeholders.map((p) => `{{${p}}}`).join(", ")}
      </p>
      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Body (basic HTML, e.g. &lt;br&gt; for line breaks)</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </Button>
        {savedFlash && <span className="text-sm text-success">Saved.</span>}
      </div>
    </div>
  );
}

export function MemorandumTemplatesScreen({ templates, saveTemplate }: Props) {
  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <Mail className="h-5 w-5 text-primary" />
        Memorandum Templates
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Templates for the automated emails sent by the Absence/Deviation Memo lifecycle. Editing here takes effect immediately -- no redeploy needed.
      </p>

      <Card>
        <CardContent className="pt-4">
          <Accordion type="multiple" defaultValue={[TEMPLATE_DEFS[0].id]}>
            {TEMPLATE_DEFS.map((def) => (
              <AccordionItem key={def.id} value={def.id}>
                <AccordionTrigger>{def.label}</AccordionTrigger>
                <AccordionContent>
                  <TemplateEditor def={def} saved={templates[def.id]} saveTemplate={saveTemplate} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
