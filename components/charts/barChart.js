import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashFlowBarChart({ data }) {
   // Formatter for the Y-axis to show currency
   const formatCurrency = (value) => `₹${(value / 1000).toFixed(0)}k`;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart 
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis tickFormatter={formatCurrency}/>
        <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
        <Legend />
        <Bar dataKey="monthlyNetCashFlow" fill="#10B981" name="Net Cash Flow" />
        <Bar dataKey="emi_total" fill="#EF4444" name="EMI Payment" />
      </BarChart>
    </ResponsiveContainer>
  );
}
