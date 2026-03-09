'use client';

import React from 'react';

interface TrendingTermsProps {
  terms: string[];
  onTermClick: (term: string) => void;
  title?: string;
}

export function TrendingTerms({ terms, onTermClick, title = 'Trending' }: TrendingTermsProps) {
  if (terms.length === 0) return null;

  return (
    <div className="gpr-trending-terms">
      <div className="gpr-trending-label">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <span>{title}</span>
      </div>
      <div className="gpr-trending-list">
        {terms.slice(0, 6).map((term) => (
          <button
            key={term}
            className="gpr-trending-item"
            onClick={() => onTermClick(term)}
            type="button"
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
}
