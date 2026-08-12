/** Paper Intelligence Card 展示组件：标题、作者、关键词、摘要、研究流程。 */
import type { PaperIntelligenceCard } from "@/types";
import { CardField } from "./CardField";

export function PaperCard({ card }: { card: PaperIntelligenceCard }) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-bold text-gray-900">
        Paper Intelligence Card
      </h2>

      {(card.title || card.authors) && (
        <div className="border-b border-gray-100 pb-4">
          {card.title && (
            <p className="text-lg font-semibold text-gray-900">
              {card.title}
            </p>
          )}
          {card.authors && (
            <p className="mt-1 text-sm text-gray-600">{card.authors}</p>
          )}
        </div>
      )}

      {card.keywords && card.keywords.length > 0 && (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Keywords
          </dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {card.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {k}
              </span>
            ))}
          </dd>
        </div>
      )}

      <div className="space-y-3">
        <CardField label="Abstract" value={card.abstract} />
        <CardField label="Research Workflow" value={card.workflow} />
      </div>
    </div>
  );
}
