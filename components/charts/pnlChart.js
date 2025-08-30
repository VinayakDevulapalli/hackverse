import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PnlTrendChart({ data }) {
  // Formatter for the Y-axis to show currency
  const formatCurrency = (value) => `₹${(value / 1000).toFixed(0)}k`;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={formatCurrency} />
        <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
        <Legend />
        <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} name="Revenue" />
        <Line type="monotone" dataKey="operating_expenses" stroke="#F97316" strokeWidth={2} name="Operating Expenses" />
      </LineChart>
    </ResponsiveContainer>
  );
}
