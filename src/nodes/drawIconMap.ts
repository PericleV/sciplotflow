// The icons of the Figure Drawing editor's tools: Lucide's (ISC licence) and, where it has none, our own (drawIcons).
import type { ReactNode } from 'react';
import { ChartPie, SquareRoundCorner, Circle, Hexagon, Image, MessageSquare, MousePointer2, MoveHorizontal, MoveRight, PenTool, RectangleHorizontal, RulerDimensionLine, Slash, Star, Type, type LucideProps } from 'lucide-react';
import { Arc, Brace, Bracket, CurvedArrow, ElbowArrow, Equilibrium, Polygon, Polyline, Retro } from './drawIcons.tsx';

// their size on the buttons (px) and line width
export const ICON = { size: 16, strokeWidth: 1.75 } as const;
export type ToolIcon = (p: LucideProps) => ReactNode;
export const TOOL_ICONS: Record<string, ToolIcon> = {
  select: MousePointer2,
  pen: PenTool,
  corner: SquareRoundCorner,
  image: Image,
  text: Type,
  line: Slash,
  arrow: MoveRight,
  double: MoveHorizontal,
  curved: CurvedArrow,
  elbow: ElbowArrow,
  equilibrium: Equilibrium,
  retro: Retro,
  dimension: RulerDimensionLine,
  rect: RectangleHorizontal,
  ellipse: Circle,
  polygon: Polygon,
  polyline: Polyline,
  star: Star,
  regular: Hexagon,
  arc: Arc,
  pie: ChartPie,
  bracket: Bracket,
  brace: Brace,
  callout: MessageSquare,
};
