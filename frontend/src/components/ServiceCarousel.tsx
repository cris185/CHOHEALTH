'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { services as servicesApi, Service } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ServiceCard from './ServiceCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ServiceCarouselProps {
  showBookButton?: boolean;
  clickable?: boolean;
}

export default function ServiceCarousel({ showBookButton = true, clickable = false }: ServiceCarouselProps) {
  const t = useTranslations();
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    servicesApi.list()
      .then(setServicesList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [servicesList]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 320;
    const scrollAmount = direction === 'left' ? -cardWidth : cardWidth;
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex gap-6 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-[300px] shrink-0 space-y-3">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (servicesList.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t('services.noServices')}
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Left arrow */}
      {canScrollLeft && (
        <div className="absolute -left-5 top-1/2 z-20 -translate-y-1/2">
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <div className="absolute -right-5 top-1/2 z-20 -translate-y-1/2">
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Gradient edges */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16" style={{ background: 'linear-gradient(to right, var(--background), transparent)' }} />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16" style={{ background: 'linear-gradient(to left, var(--background), transparent)' }} />
      )}

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {servicesList.map((service) => (
          <div key={service.sid} className="w-[300px] shrink-0">
            <ServiceCard service={service} showBookButton={showBookButton} clickable={clickable} />
          </div>
        ))}
      </div>
    </div>
  );
}
