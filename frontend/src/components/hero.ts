import { css, html } from "lit";

/**
 * Calm garden scene used as the hero image. Colours come from CSS classes
 * (see `heroStyles`) because CSS variables are not reliable in SVG attributes.
 * The element using it must put it inside a container with class "hero".
 */
export const heroIllustration = html`
  <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="pg-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="sky-top" />
        <stop offset="1" class="sky-bottom" />
      </linearGradient>
    </defs>
    <rect width="800" height="220" fill="url(#pg-sky)" />
    <circle cx="660" cy="62" r="30" class="sun" />
    <path class="hill-back" d="M0 150 C 140 110 260 120 400 140 S 660 110 800 132 V220 H0 Z" />
    <path class="hill-front" d="M0 178 C 160 150 300 160 440 176 S 680 158 800 170 V220 H0 Z" />
    <path class="soil" d="M0 204 C 200 190 420 196 800 200 V220 H0 Z" />
    <g class="leaf" transform="translate(220 150)">
      <rect x="-2" y="-46" width="4" height="50" rx="2" />
      <path d="M0 -30 C -26 -34 -40 -54 -38 -70 C -18 -66 -4 -52 0 -30 Z" />
      <path d="M0 -40 C 22 -46 38 -66 36 -84 C 14 -78 2 -62 0 -40 Z" />
    </g>
    <g class="leaf small" transform="translate(540 160)">
      <rect x="-1.5" y="-30" width="3" height="34" rx="1.5" />
      <path d="M0 -18 C -18 -22 -26 -34 -25 -46 C -12 -42 -2 -32 0 -18 Z" />
      <path d="M0 -24 C 16 -28 26 -42 24 -54 C 10 -50 1 -38 0 -24 Z" />
    </g>
    <g class="water">
      <path d="M332 92 c 0 0 -8 10 -8 15 a 8 8 0 0 0 16 0 c 0 -5 -8 -15 -8 -15 z" />
      <path d="M356 112 c 0 0 -6 8 -6 12 a 6 6 0 0 0 12 0 c 0 -4 -6 -12 -6 -12 z" />
    </g>
  </svg>
`;

export const heroStyles = css`
  .hero .sky-top {
    stop-color: var(--pg-sky-top);
  }
  .hero .sky-bottom {
    stop-color: var(--pg-sky-bottom);
  }
  .hero .sun {
    fill: var(--pg-sun);
    opacity: 0.85;
  }
  .hero .hill-back {
    fill: var(--pg-leaf-soft);
  }
  .hero .hill-front {
    fill: var(--pg-leaf);
    opacity: 0.55;
  }
  .hero .soil {
    fill: var(--pg-soil);
    opacity: 0.5;
  }
  .hero .leaf {
    fill: var(--pg-leaf);
  }
  .hero .leaf.small {
    opacity: 0.8;
  }
  .hero .water {
    fill: var(--pg-water);
    opacity: 0.7;
  }
`;
