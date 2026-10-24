// Formulas ready for Math column: the usual conversions of spectroscopy, chemistry and engineering. Each writes its
// formula of the inputs (A, B …: what they must be is in `inputs`) and the name of the result.
export type MathPreset = { group: string; label: string; formula: string; name: string; inputs: string };

const HC = '1239.84193'; // h·c in eV·nm
const C_NM_THZ = '299792.458'; // c in nm·THz

export const MATH_PRESETS: MathPreset[] = [
  // ---- light ----
  { group: 'Spectroscopy', label: 'Absorbance from transmittance (0–1)', formula: '-log10(A)', name: 'Absorbance', inputs: 'A: transmittance, 0–1' },
  { group: 'Spectroscopy', label: 'Absorbance from transmittance (%)', formula: '2 - log10(A)', name: 'Absorbance', inputs: 'A: transmittance in %' },
  { group: 'Spectroscopy', label: 'Transmittance (%) from absorbance', formula: '100*10^(-A)', name: 'Transmittance (%)', inputs: 'A: absorbance' },
  { group: 'Spectroscopy', label: 'Wavenumber (cm⁻¹) from wavelength (nm)', formula: '1e7/A', name: 'Wavenumber (cm⁻¹)', inputs: 'A: wavelength in nm' },
  { group: 'Spectroscopy', label: 'Wavelength (nm) from wavenumber (cm⁻¹)', formula: '1e7/A', name: 'Wavelength (nm)', inputs: 'A: wavenumber in cm⁻¹' },
  { group: 'Spectroscopy', label: 'Photon energy (eV) from wavelength (nm)', formula: `${HC}/A`, name: 'Energy (eV)', inputs: 'A: wavelength in nm' },
  { group: 'Spectroscopy', label: 'Wavelength (nm) from photon energy (eV)', formula: `${HC}/A`, name: 'Wavelength (nm)', inputs: 'A: energy in eV' },
  { group: 'Spectroscopy', label: 'Frequency (THz) from wavelength (nm)', formula: `${C_NM_THZ}/A`, name: 'Frequency (THz)', inputs: 'A: wavelength in nm' },
  { group: 'Spectroscopy', label: 'Raman shift (cm⁻¹) from wavelength (nm), laser B (nm)', formula: '1e7/B - 1e7/A', name: 'Raman shift (cm⁻¹)', inputs: 'A: scattered wavelength in nm, B: the laser in nm (one value)' },
  { group: 'Spectroscopy', label: 'Kubelka–Munk F(R) from reflectance (0–1)', formula: '(1 - A)^2/(2*A)', name: 'F(R)', inputs: 'A: diffuse reflectance, 0–1' },
  { group: 'Spectroscopy', label: 'Tauc, direct gap: (α·hν)²: A absorbance or α, B energy (eV)', formula: '(A*B)^2', name: '(αhν)²', inputs: 'A: absorbance (or α, or F(R)), B: photon energy in eV' },
  { group: 'Spectroscopy', label: 'Tauc, indirect gap: (α·hν)^½: A absorbance or α, B energy (eV)', formula: 'sqrt(A*B)', name: '(αhν)^½', inputs: 'A: absorbance (or α, or F(R)), B: photon energy in eV' },
  { group: 'Spectroscopy', label: 'Absorption coefficient α (cm⁻¹) from absorbance, thickness B (cm)', formula: '2.302585*A/B', name: 'α (cm⁻¹)', inputs: 'A: absorbance, B: thickness in cm' },
  // ---- chemistry ----
  { group: 'Chemistry', label: 'Concentration from absorbance (Beer–Lambert), ε B, path C (cm)', formula: 'A/(B*C)', name: 'Concentration (mol/L)', inputs: 'A: absorbance, B: ε in L/(mol·cm), C: the path in cm' },
  { group: 'Chemistry', label: 'pH from [H⁺] (mol/L)', formula: '-log10(A)', name: 'pH', inputs: 'A: [H⁺] in mol/L' },
  { group: 'Chemistry', label: '[H⁺] (mol/L) from pH', formula: '10^(-A)', name: '[H⁺] (mol/L)', inputs: 'A: pH' },
  { group: 'Chemistry', label: 'Arrhenius: ln k against 1/T; 1000/T from T (K)', formula: '1000/A', name: '1000/T (1/K)', inputs: 'A: temperature in K' },
  { group: 'Chemistry', label: 'ln of a column', formula: 'ln(A)', name: 'ln', inputs: 'A: positive values' },
  // ---- engineering ----
  { group: 'Engineering', label: 'dB from a power ratio', formula: '10*log10(A)', name: 'dB', inputs: 'A: power ratio' },
  { group: 'Engineering', label: 'dB from an amplitude ratio', formula: '20*log10(abs(A))', name: 'dB', inputs: 'A: amplitude ratio (|S21|, V/V …)' },
  { group: 'Engineering', label: 'Power ratio from dB', formula: '10^(A/10)', name: 'power ratio', inputs: 'A: dB' },
  { group: 'Engineering', label: 'Magnitude from real and imaginary parts', formula: 'hypot(A, B)', name: 'magnitude', inputs: 'A: real part, B: imaginary part' },
  { group: 'Engineering', label: 'Phase (°) from real and imaginary parts', formula: 'deg(atan2(B, A))', name: 'phase (°)', inputs: 'A: real part, B: imaginary part' },
  { group: 'Engineering', label: 'Kelvin from Celsius', formula: 'A + 273.15', name: 'T (K)', inputs: 'A: °C' },
  { group: 'Engineering', label: 'Celsius from kelvin', formula: 'A - 273.15', name: 'T (°C)', inputs: 'A: K' },
  // ---- the data ----
  { group: 'Data', label: 'Normalized to its maximum', formula: 'A/max(A)', name: 'normalized', inputs: 'A: a column' },
  { group: 'Data', label: 'Scaled to 0 – 1', formula: '(A - min(A))/(max(A) - min(A))', name: 'scaled (0–1)', inputs: 'A: a column' },
  { group: 'Data', label: 'Standardized (z-score)', formula: '(A - mean(A))/sd(A)', name: 'z-score', inputs: 'A: a column' },
  { group: 'Data', label: 'Relative change (%) from the first value', formula: '100*(A - first(A))/first(A)', name: 'change (%)', inputs: 'A: a column' },
  { group: 'Data', label: 'Difference of two columns', formula: 'A - B', name: 'A − B', inputs: 'A, B: columns' },
  { group: 'Data', label: 'Ratio of two columns', formula: 'A/B', name: 'A / B', inputs: 'A, B: columns' },
];
