---
name: Sentinel Console
colors:
  surface: '#0e1419'
  surface-dim: '#0e1419'
  surface-bright: '#343a3f'
  surface-container-lowest: '#090f13'
  surface-container-low: '#161c21'
  surface-container: '#1a2025'
  surface-container-high: '#252b30'
  surface-container-highest: '#2f353a'
  on-surface: '#dde3e9'
  on-surface-variant: '#c1c7d2'
  inverse-surface: '#dde3e9'
  inverse-on-surface: '#2b3136'
  outline: '#8b919b'
  outline-variant: '#414750'
  surface-tint: '#a1c9ff'
  primary: '#b1d2ff'
  on-primary: '#00325a'
  primary-container: '#7cb7ff'
  on-primary-container: '#00477e'
  inverse-primary: '#1660a3'
  secondary: '#77db8a'
  on-secondary: '#003915'
  secondary-container: '#027b36'
  on-secondary-container: '#adffb7'
  tertiary: '#ffbfbd'
  on-tertiary: '#601218'
  tertiary-container: '#ff9695'
  on-tertiary-container: '#7d282b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#a1c9ff'
  on-primary-fixed: '#001c37'
  on-primary-fixed-variant: '#004880'
  secondary-fixed: '#93f8a4'
  secondary-fixed-dim: '#77db8a'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005322'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b1'
  on-tertiary-fixed: '#410007'
  on-tertiary-fixed-variant: '#7f292c'
  background: '#0e1419'
  on-background: '#dde3e9'
  surface-variant: '#2f353a'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-code:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  gutter: 12px
  margin: 20px
---

## Brand & Style

This design system is built for the high-stakes environment of automated job acquisition. It adopts a **Corporate-Modern** aesthetic fused with the density of an **Operational Console**. The personality is serious, technical, and hyper-efficient, prioritizing information throughput over white space. 

The visual direction avoids decorative flourishes in favor of a "utility-first" interface. By utilizing a dark, low-refractive color palette, the system reduces eye strain during long monitoring sessions. The emotional goal is to evoke a sense of professional command and control, making the user feel like a pilot navigating a complex data landscape.

## Colors

The color palette is strictly functional. The deep charcoal and obsidian base layers establish a low-luminance environment where the primary content resides on elevated panels. 

- **Primary Blue (#7cb7ff)**: Used for active states, primary actions, and progress indicators.
- **Semantic Accents**: The "Good Green" and "Bad Red" are tuned for high saturation to ensure that status changes are immediately perceivable against the dark background.
- **Borders**: The border color is kept close to the panel background to provide structure without creating visual noise, maintaining the system's dense, integrated feel.

## Typography

This design system utilizes **Inter** as its primary typeface to ensure maximum legibility at small sizes, crucial for the dense data tables and property sheets typical of an automation dashboard. 

For logs, terminal outputs, and technical data, **Space Grotesk** (or a system monospace) is used to provide the necessary character alignment and technical vibe. Type scales are intentionally conservative; the difference between a header and body text is conveyed through weight and color (primary vs. muted) rather than drastic size shifts, preserving vertical space.

## Layout & Spacing

The layout follows a **fluid grid** model optimized for wide-screen monitoring. A 12-column system is recommended for the main dashboard, with fixed-width sidebars for navigation and configuration.

Spacing is governed by a tight 4px baseline grid. Padding within panels and components is kept to a minimum (`8px` to `12px`) to maximize "above-the-fold" data density. Gutters between cards and panels are narrow (`12px`) to create a cohesive, interlocking "console" appearance rather than a collection of floating islands.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Low-Contrast Outlines**. Instead of traditional shadows, which can appear muddy in dark interfaces, this design system uses color-based stacking:

1.  **Floor**: The darkest layer (#0f1114).
2.  **Panels**: Raised surfaces (#181c22) with a subtle 1px border (#2a3139) to define edges.
3.  **Active/Hover States**: Elements that are interactive use a slightly lighter background or the primary accent color to "lift" towards the user.

Depth is communicated through structure and perimeter definition rather than atmospheric diffusion.

## Shapes

The shape language balances the "serious" nature of the tool with modern UI expectations. A standard corner radius of **8px** is applied to panels and major containers. Smaller components like buttons, input fields, and tags utilize a **4px-6px** radius to maintain a precise, engineered look. Status indicators (dots) and specific toggle components may utilize pill shapes to distinguish them from structural layout elements.

## Components

- **Buttons**: Primary buttons are solid Blue (#7cb7ff) with dark text for maximum contrast. Secondary buttons are outlined with the border color.
- **Status Chips**: High-density tags using background tints of "Good Green" or "Bad Red" with high-contrast text. These should be compact, with no more than 4px vertical padding.
- **Data Grids**: Rows should feature subtle hover states and use the muted text color for secondary data points. Borders should be used only for horizontal separation to keep the horizontal flow clean.
- **Log Viewer**: A dedicated container using the `mono-code` style. Background should be slightly darker than the panel color (#121418) to create an "inset" effect.
- **Input Fields**: Dark backgrounds (#121418) with a 1px border. Focus states are indicated by a 1px primary blue border—never a glow or shadow.
- **Cards**: Used for job application summaries. They should contain a header area, a dense body section for metadata, and a footer for quick actions.