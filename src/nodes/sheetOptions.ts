// The choice of a workbook's sheet, the same in every node: the sheets by their names, the first one standing for “none
// chosen” (it follows the first sheet, whatever its name: a Batch's files), then every sheet when the node can take them
// all; a sheet chosen that is no longer there, marked. via: the source shows a sheet of its own (the one shown there).
export function sheetOptions(sheets: string[], value: string, o: { every?: boolean; via?: boolean } = {}): { value: string; options: [string, string][] } {
  const missing: [string, string][] = value && value !== '*' && !sheets.includes(value) ? [[value, `${value} (missing)`]] : [];
  if (o.via) return { value, options: [['', 'the one shown in the source'], ...sheets.map((nm): [string, string] => [nm, nm]), ...missing] };
  return {
    // (the first sheet chosen by its name: the same as none chosen)
    value: value === sheets[0] ? '' : value,
    options: [['', sheets[0] ?? 'the first sheet'], ...sheets.slice(1).map((nm): [string, string] => [nm, nm]), ...(o.every ? [['*', 'every sheet (a workbook out)'] as [string, string]] : []), ...missing],
  };
}
