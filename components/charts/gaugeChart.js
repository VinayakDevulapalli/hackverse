import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, Legend } from 'recharts';

// A reusable Gauge chart component
export default function GaugeChart({ name, value, target, color, unit = '' }) {
  const percentageValue = (value / target) * 100;
  const data = [{ name, value: percentageValue > 100 ? 100 : percentageValue }]; // Cap at 100% for visual
  const endAngle = 360 * (percentageValue / 100);

  // Determine color based on performance against target
  const statusColor = value >= target ? '#10B981' : '#EF4444'; // Green for good, Red for bad

  return (
    <div className="w-full h-80 relative flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="90%"
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={20}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background
            dataKey="value"
            angleAxisId={0}
            fill={statusColor}
            cornerRadius={10}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute flex flex-col items-center justify-center">
        <p className="text-4xl font-bold text-gray-800" style={{ color: statusColor }}>
          {value}{unit}
        </p>
        <p className="text-sm font-medium text-gray-500">{name}</p>
        <p className="text-xs text-gray-400">Target: {target}{unit}</p>
      </div>
    </div>
  );
}
