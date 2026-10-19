// The size of a matrix as the nodes write it: “name: m × n”.
import type { MatrixInfo } from '../engine/evaluate.ts';

export const sizeText = (info: MatrixInfo) => `${info.name ? `${info.name}: ` : ''}${info.rows} × ${info.cols}`;
