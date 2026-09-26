import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ExternalLink, Link2, Flame, Mail, FolderGit2 } from "lucide-react";

const LINKS = [
  {
    label: "Firebase Console",
    description: "Firestore data, Storage, Authentication, and the Cloud Functions this hub depends on.",
    href: "https://console.firebase.google.com/project/afrotc-traning-tracker/overview",
    icon: Flame,
  },
  {
    label: "GitHub Repository",
    description: "Source code for this hub -- issues, commit history, and the deploy workflow.",
    href: "https://github.com/Gorjanski11/afrotc-training-tracker",
    icon: FolderGit2,
  },
  {
    label: "Resend Dashboard",
    description: "Delivery logs for every automated email this hub sends (memo assignments, reminders, escalations).",
    href: "https://resend.com/emails",
    icon: Mail,
  },
];

export function QuickLinksScreen() {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <Link2 className="h-5 w-5 text-primary" />
        Quick Links
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ label, description, href, icon: Icon }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" className="block">
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
