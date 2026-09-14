import type { CriticalityClass } from "../api/types";

const CLASS_STYLE: Record<CriticalityClass, string> = {
  A: "bg-safety-red text-white border-safety-red",
  B: "bg-amber-400 text-navy-950 border-amber-400",
  C: "bg-graphite-200 text-graphite-700 border-graphite-200",
};

const CLASS_TITLE: Record<CriticalityClass, string> = {
  A: "Critico",
  B: "Importante",
  C: "Comum",
};

/**
 * Quadrado colorido com a letra da classe, no estilo do mockup de referencia (nao o pill
 * arredondado do StatusBadge - aqui a classe e' o dado mais importante da linha, precisa
 * saltar aos olhos antes do resto).
 */
export function CriticalityClassBadge({ criticalityClass, size = "md" }: { criticalityClass: CriticalityClass | null | undefined; size?: "sm" | "md" }) {
  const dimensao = size === "sm" ? "h-7 w-7 text-sm" : "h-10 w-10 text-lg";

  if (!criticalityClass) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-graphite-200 bg-graphite-50 px-2.5 py-0.5 text-xs font-medium text-graphite-500">
        Dados insuficientes
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`flex ${dimensao} shrink-0 items-center justify-center rounded-md border font-bold ${CLASS_STYLE[criticalityClass]}`}
        title={CLASS_TITLE[criticalityClass]}
      >
        {criticalityClass}
      </span>
      <span className="text-xs text-graphite-500">{CLASS_TITLE[criticalityClass]}</span>
    </span>
  );
}
