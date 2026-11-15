"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// One card (280px) plus one connector (32px).
const STEP = 312;

export default function RouteCardRow({
  children,
  itemCount,
}: {
  children: ReactNode;
  itemCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setEdges((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    };
    row.addEventListener("scroll", update, { passive: true });
    // Fires once on observe, so the initial state needs no separate call.
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [itemCount]);

  const scroll = (direction: 1 | -1) =>
    ref.current?.scrollBy({ left: direction * STEP, behavior: "smooth" });
  const arrow =
    "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-base leading-none text-slate-700 shadow-md hover:border-blue-500 hover:text-blue-700";

  return (
    <div className="relative mt-3 w-fit max-w-full">
      <div
        ref={ref}
        className="flex max-w-full snap-x snap-mandatory items-stretch overflow-x-auto pb-2"
        aria-label="Route locations"
      >
        {children}
      </div>
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 bottom-2 w-16 bg-linear-to-l from-white to-transparent"
        />
      )}
      {edges.left && (
        <button
          type="button"
          className={`${arrow} left-1`}
          aria-label="Scroll to previous location"
          onClick={() => scroll(-1)}
        >
          ‹
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          className={`${arrow} right-1`}
          aria-label="Scroll to next location"
          onClick={() => scroll(1)}
        >
          ›
        </button>
      )}
    </div>
  );
}
