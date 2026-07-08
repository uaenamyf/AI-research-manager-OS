/** Paper Intelligence Card 展示组件。 */
import type { PaperIntelligenceCard } from "@/types";
import { CardField } from "./CardField";

export function PaperCard({ card }: { card: PaperIntelligenceCard }) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-bold text-gray-900">
        Paper Intelligence Card
      </h2>

      {(card.title || card.authors || card.year || card.journal) && (
        <div className="border-b border-gray-100 pb-4">
          {card.title && (
            <p className="text-lg font-semibold text-gray-900">
              {card.title}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-600">
            {[card.authors, card.year, card.journal]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <CardField label="Research Question" value={card.researchQuestion} />
        <CardField label="Method" value={card.method} />
        <CardField label="Dataset" value={card.dataset} />
        <CardField label="Main Findings" value={card.mainFindings} />
        <CardField label="Innovation" value={card.innovation} />
        <CardField label="Limitation" value={card.limitation} />
        <CardField label="Future Direction" value={card.futureDirection} />
      </div>
    </div>
  );
}
