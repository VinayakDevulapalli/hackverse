// pages/deep-analytics.js

import Link from 'next/link';

export default function DeepAnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-gray-900">
        Deep Analytics Page
      </h1>
      <p className="mt-4 text-gray-600">
        This page will contain detailed analytics and visualizations.
      </p>
      <div className="mt-8">
        <Link href="/">
          <a className="text-blue-500 hover:underline">
            &larr; Back to Home
          </a>
        </Link>
      </div>
    </div>
  );
}