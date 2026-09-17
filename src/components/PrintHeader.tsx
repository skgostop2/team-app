/**
 * 종이에만 찍히는 머리글. 화면에서는 보이지 않는다.
 * 보고서로 돌아다닐 종이라 제목·소속·기준일은 반드시 있어야 한다.
 */
export default function PrintHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  return (
    <div className="print-only mb-3 border-b border-black pb-1.5">
      <div className="flex items-end justify-between">
        <h1 className="text-base font-bold">{title}</h1>
        <span className="text-xs">출력일 {stamp}</span>
      </div>
      {subtitle && <p className="text-xs mt-0.5">{subtitle}</p>}
    </div>
  );
}
