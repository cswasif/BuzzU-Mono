'use client';

import React from 'react';
import type { GifCategory } from '../types';

interface CategoryGridProps {
  categories: GifCategory[];
  onCategoryClick: (category: GifCategory) => void;
  categoryHeight?: number | string;
  loading?: boolean;
}

export function CategoryGrid({ 
  categories, 
  onCategoryClick, 
  categoryHeight = 100,
  loading = false 
}: CategoryGridProps) {
  const height = typeof categoryHeight === 'number' ? `${categoryHeight}px` : categoryHeight;

  if (loading) {
    return (
      <div className="gpr-categories-loading">
        <div className="gpr-spinner" />
      </div>
    );
  }

  return (
    <div className="gpr-categories">
      {categories.map((category) => (
        <button
          key={category.searchTerm}
          className="gpr-category-item"
          onClick={() => onCategoryClick(category)}
          type="button"
          style={{ height }}
        >
          <img
            src={category.imageUrl}
            alt={category.name}
            loading="lazy"
            className="gpr-category-image"
          />
          <span className="gpr-category-name">{category.name}</span>
        </button>
      ))}
    </div>
  );
}
