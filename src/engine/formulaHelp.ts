// Every function a formula of columns can use, by group, each with how it is written, what it does and an example: the
// menu ƒ Functions of the formula windows. A check (npm run check) makes sure every function the formulas know is here
// and every example computes.
export type FormulaFunction = { name: string; sig: string; text: string; example: string };
export type FormulaGroup = { group: string; items: FormulaFunction[] };

export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    group: 'Operators',
    items: [
      { name: '+ − * /', sig: 'A + B', text: 'Add, subtract, multiply, divide; ^ raises to a power, % is the remainder (as mod).', example: '(A - B) / B * 100' },
      { name: '< > <= >= == !=', sig: 'A > 5', text: 'Compare: 1 when true, 0 when false (= is the same as ==; ≤ ≥ ≠ can be typed too).', example: 'A * (B > 0)' },
      { name: 'and or not', sig: 'A > 1 and B < 5', text: 'Join conditions (&&, || and ! too).', example: 'if(A > 1 and B < 5, A, 0)' },
    ],
  },
  {
    group: 'Logic',
    items: [
      { name: 'if', sig: 'if(condition, value when true, value when false)', text: 'One value or another, by a condition.', example: 'if(A < 0, -A, A)' },
      { name: 'between', sig: 'between(x, low, high)', text: '1 when x is between low and high, both included (either way round), else 0.', example: 'B * if(between(A, 10, 20), 2, 1)' },
      { name: 'isin', sig: 'isin(x, a, b, c)', text: '1 when x is one of the values given, else 0.', example: 'B * if(isin(C, 2, 5, 7), 1.5, 1)' },
      { name: 'isnan', sig: 'isnan(x)', text: '1 when x is missing (an empty cell), else 0.', example: 'if(isnan(A), 0, A)' },
    ],
  },
  {
    group: 'A value from another row',
    items: [
      { name: 'at', sig: 'at(A, row)', text: 'The value of column A in that row (1 is the first; the row can be a formula of n, the number of rows).', example: 'B * at(A, 3)' },
      { name: 'first', sig: 'first(A, condition)', text: 'A in the first row where the condition is true (with one argument: the first value of A). Several rows matching: the first used, and said.', example: 'C * B * first(A, between(B, 10, 20) or B == 7)' },
      { name: 'last', sig: 'last(A, condition)', text: 'A in the last row where the condition is true (with one argument: the last value of A).', example: 'B / last(A, isin(C, 0))' },
    ],
  },
  {
    group: 'Statistics of a column',
    items: [
      { name: 'mean', sig: 'mean(A) · mean(A, condition)', text: 'The mean of column A; with a condition, of the rows where it is true (as AVERAGEIF).', example: 'A - mean(A, B > 0)' },
      { name: 'median', sig: 'median(A) · median(A, condition)', text: 'The median of column A, of all its rows or of those where the condition is true.', example: 'A / median(A)' },
      { name: 'sd', sig: 'sd(A) · sd(A, condition)', text: 'The standard deviation (n − 1) of column A, of all its rows or of those where the condition is true.', example: '(A - mean(A)) / sd(A)' },
      { name: 'sum', sig: 'sum(A) · sum(A, condition)', text: 'The sum of column A; with a condition, of the rows where it is true (as SUMIF).', example: 'A / sum(A, B == 1) * 100' },
      { name: 'count', sig: 'count(A) · count(A, condition)', text: 'How many values column A has; with a condition, in the rows where it is true (as COUNTIF).', example: 'count(A, A > 0)' },
      { name: 'min, max', sig: 'min(A) · max(A)', text: 'The smallest and the largest value of column A. With two numbers or columns, min(A, B) and max(A, B) are row by row.', example: '(A - min(A)) / (max(A) - min(A))' },
      { name: 'minif, maxif', sig: 'minif(A, condition) · maxif(A, condition)', text: 'The smallest and the largest value of column A in the rows where the condition is true.', example: 'A / maxif(A, between(B, 400, 500))' },
    ],
  },
  {
    group: 'Random values',
    items: [
      { name: 'rand', sig: 'rand() · rand(low, high)', text: 'A random number between 0 and 1, or between low and high (uniform); another in every row. The same values every time it is computed; New random values draws others.', example: 'A + rand(-0.5, 0.5)' },
      { name: 'randn', sig: 'randn() · randn(mean, sd)', text: 'A random number of a normal distribution: mean 0 and SD 1, or the mean and SD given.', example: 'A + randn(0, 0.02 * A)' },
      { name: 'randint', sig: 'randint(low, high)', text: 'A random whole number from low to high, both included.', example: 'randint(1, 6)' },
    ],
  },
  {
    group: 'Math',
    items: [
      { name: 'abs', sig: 'abs(x)', text: 'The absolute value.', example: 'abs(A - B)' },
      { name: 'sqrt', sig: 'sqrt(x)', text: 'The square root.', example: 'sqrt(A^2 + B^2)' },
      { name: 'exp', sig: 'exp(x)', text: 'e to the power x.', example: 'exp(-A / 3)' },
      { name: 'log, ln', sig: 'log(x)', text: 'The natural logarithm (log and ln are the same).', example: 'log(A)' },
      { name: 'log10, log2', sig: 'log10(x)', text: 'The logarithm in base 10 or 2.', example: '-log10(A)' },
      { name: 'pow', sig: 'pow(x, y)', text: 'x to the power y (as x^y).', example: 'pow(A, 2)' },
      { name: 'hypot', sig: 'hypot(x, y)', text: 'The square root of x² + y².', example: 'hypot(A, B)' },
      { name: 'round', sig: 'round(x) · round(x, digits)', text: 'Rounded, to a whole number or to the digits after the point given.', example: 'round(A, 2)' },
      { name: 'floor, ceil', sig: 'floor(x)', text: 'Down or up to a whole number.', example: 'floor(A / 10) * 10' },
      { name: 'sign', sig: 'sign(x)', text: '−1, 0 or 1, by the sign of x.', example: 'sign(A) * sqrt(abs(A))' },
      { name: 'mod', sig: 'mod(a, b)', text: 'The remainder of a / b, with the sign of b.', example: 'mod(i, 2)' },
      { name: 'step', sig: 'step(x)', text: 'Heaviside step: 1 for x ≥ 0, else 0.', example: 'A * step(B - 5)' },
    ],
  },
  {
    group: 'Trigonometry',
    items: [
      { name: 'sin, cos, tan, cot, ctan', sig: 'sin(x)', text: 'Of an angle in radians (cot and ctan: 1 / tan).', example: 'sin(2 * pi * A / 360)' },
      { name: 'asin, acos, atan', sig: 'atan(x)', text: 'The angle (radians) of a sine, a cosine, a tangent.', example: 'deg(atan(B / A))' },
      { name: 'atan2', sig: 'atan2(y, x)', text: 'The angle of the point (x, y), from −π to π.', example: 'deg(atan2(B, A))' },
      { name: 'sinh, cosh, tanh', sig: 'tanh(x)', text: 'The hyperbolic functions.', example: 'tanh(A)' },
      { name: 'deg, rad', sig: 'deg(x) · rad(x)', text: 'Radians to degrees, degrees to radians.', example: 'cos(rad(A))' },
    ],
  },
  {
    group: 'Rows and constants',
    items: [
      { name: 'i', sig: 'i', text: 'The number of the row (1, 2, 3 …).', example: 'A * i' },
      { name: 'n', sig: 'n', text: 'The number of rows.', example: 'i / n' },
      { name: 'pi', sig: 'pi', text: 'π = 3.14159…', example: 'pi * A^2' },
      { name: 'NaN', sig: 'NaN', text: 'An empty value.', example: 'if(A < 0, NaN, A)' },
    ],
  },
];

// every function name the groups describe (those written as “min, max” or “log, ln” too)
export const describedNames = () => new Set(FORMULA_GROUPS.flatMap((g) => g.items.flatMap((f) => f.name.split(/,\s*|\s+/).filter((x) => /^[a-z]\w*$/i.test(x)))));
