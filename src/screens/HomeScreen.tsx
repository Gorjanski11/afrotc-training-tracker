import { motion } from "motion/react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface HomeCard {
  key: string;
  icon: React.ReactNode;
  title: string;
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
      onClick: onEnterPoc,
    },
    {
      key: "gmc",
      icon: <Users className="h-7 w-7" />,
      title: "GMC TO's",
      onClick: onEnterGmc,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl py-8">
      <h2 className="mb-8 text-center text-2xl font-semibold">AFROTC Training Objective Tracker</h2>
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
              <CardHeader className="flex-row items-center gap-4 space-y-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{card.icon}</span>
                <CardTitle className="text-lg">{card.title}</CardTitle>
              </CardHeader>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
