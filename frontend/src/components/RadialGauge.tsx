import { PieChart, Pie, Cell } from "recharts";

interface RadialGaugeProps {
  /** 0-100. null desenha o anel vazio (cinza) - "sem dados", nao "zero". */
  value: number | null;
  color: string;
  size?: number;
  trackColor?: string;
}

/** Anel de progresso compacto (MTBF/disponibilidade/cumprimento etc.) - usa PieChart com
 * dois segmentos em vez de RadialBarChart porque o angulo de inicio/fim e' mais previsivel
 * entre versoes do recharts. So' o anel; o numero no centro e' responsabilidade de quem usa. */
export function RadialGauge({ value, color, size = 56, trackColor = "#e5e7ea" }: RadialGaugeProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const data = [
    { name: "value", v: pct },
    { name: "rest", v: 100 - pct },
  ];
  const thickness = Math.max(4, Math.round(size * 0.14));

  return (
    <PieChart width={size} height={size}>
      <Pie
        data={data}
        dataKey="v"
        cx="50%"
        cy="50%"
        innerRadius={size / 2 - thickness}
        outerRadius={size / 2}
        startAngle={90}
        endAngle={-270}
        stroke="none"
        isAnimationActive={false}
      >
        <Cell fill={value == null ? trackColor : color} />
        <Cell fill={trackColor} />
      </Pie>
    </PieChart>
  );
}
