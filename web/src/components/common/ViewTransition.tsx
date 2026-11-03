'use client';

import * as React from 'react';

export interface ViewTransitionProps {
  /** Shared identity. The same name on two pages morphs one into the other. */
  name?: string;
  /** Class applied to the transition when a pair forms, e.g. "morph". */
  share?: string;
  enter?: string;
  exit?: string;
  /** "none" stops this element animating during unrelated transitions. */
  default?: string;
  children: React.ReactNode;
}

/**
 * React's `<ViewTransition>`, resolved at runtime.
 *
 * The App Router bundles its own React canary (19.3.0-canary at the time of
 * writing) which exports `ViewTransition`, but the installed `@types/react`
 * for React 19.2 does not declare it yet — so importing it directly fails to
 * type-check even though it works at runtime.
 *
 * Reading it off the namespace keeps types honest, and falling back to a plain
 * passthrough means a React or browser without support renders the children
 * normally with no animation, rather than crashing.
 */
const Impl = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> })
  .ViewTransition;

export const ViewTransition: React.FC<ViewTransitionProps> = ({ children, ...props }) => {
  if (!Impl) return <>{children}</>;
  return <Impl {...props}>{children}</Impl>;
};
