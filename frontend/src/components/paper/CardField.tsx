/** Card 字段展示。 */
export function CardField({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
        {value}
      </dd>
    </div>
  );
}
