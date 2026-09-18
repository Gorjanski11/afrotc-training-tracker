import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface HomeCard {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface Props {
  onEnterPoc: () => void;
  onEnterGmc: () => void;
}

export function HomeScreen({ onEnterPoc, onEnterGmc }: Props) {
  const cards: HomeCard[] = [
    {
      key: "poc",
      icon: <GraduationCap className="h-7 w-7" />,
      title: "POC TO's",
      description: "Training Objective tracking for Professional Officer Course cadets (ICL/SCL).",
      onClick: onEnterPoc,
    },
    {
      key: "gmc",
      icon: <Users className="h-7 w-7" />,
      title: "GMC TO's",
      description: "Training Objective tracking for General Military Course cadets (BC/BCL).",
      onClick: onEnterGmc,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl py-8">
      <h2 className="mb-2 text-center text-2xl font-semibold">AFROTC Training Objective Tracker</h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">Pick an area to open.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card, i) => (
          <motion.div key={card.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.05 }}>
            <Card
              role={card.disabled ? undefined : "button"}
              tabIndex={card.disabled ? undefined : 0}
              onClick={card.disabled ? undefined : card.onClick}
              onKeyDown={(e) => {
                if (!card.disabled && (e.key === "Enter" || e.key === " ")) card.onClick?.();
              }}
              className={cn(
                "h-full transition-shadow",
                card.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <CardHeader className="flex-row items-start gap-4 space-y-0 pb-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{card.icon}</span>
                <div className="grid gap-1">
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
