import { Link } from 'react-router-dom';
import { BreadcrumbSchema, type BreadcrumbItem } from './seo/BreadcrumbSchema';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs = ({ items, className = '' }: BreadcrumbsProps) => (
  <>
    <BreadcrumbSchema items={items} />
    <nav aria-label="breadcrumb" className={`text-xs text-gray-500 mb-4 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-gray-300" aria-hidden="true">›</span>}
              {isLast || !item.path ? (
                <span className="text-gray-700 font-medium" aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              ) : (
                <Link to={item.path} className="hover:text-blue-600 hover:underline transition-colors">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  </>
);
