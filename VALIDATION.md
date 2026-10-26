# Validation

SciPlotFlow 1.0.0, 2026-10-26: **1558 of 1558 checks pass**.

Every computation of SciPlotFlow is checked by `npm run check`:

- **319 checks** compare a result with reference values computed in Python by established libraries (NumPy, SciPy, matplotlib, pandas, pingouin, statsmodels, contourpy, PyWavelets, scikit-learn, scikit-image, reliability, lifelines, pycwt, ruptures, pybaselines, differint, astropy). The scripts that compute them are in [`scripts/fixtures`](scripts/fixtures); their values are stored next to them as JSON, so the checks run without Python.
- **29 checks** compare with the conventions of a library or program they name (ImageJ, Origin, SciPy, NumPy, matplotlib, scikit-image), without stored values.
- **1210 checks** compare with exact values: a known answer, a formula, an identity (a transform and its inverse, the energy kept), a property (a test that must not change when the data are shifted), or the behaviour of the interface (a file read, a figure laid out, a project opened). Methods that no library does (or none does right) are written from their publications, cited in the code.

Each check states what it compares and how close the result is; one check often compares many values (the statistical tests against SciPy: one check, 267 values). This file is made by `npm run validation`, which runs every check and writes it.

## How to reproduce

```bash
npm install
npm run check
```

To compute the reference values again: a Python environment with the libraries of the table below
(`pip install scipy statsmodels pingouin lifelines scikit-learn scikit-image matplotlib contourpy PyWavelets pycwt pybaselines ruptures differint astropy reliability pandas`),
then run a script, for example `python scripts/fixtures/sigpack-ref.py`. The versions used are named in the scripts.

## Reference values

| Script | Checks | What it computes | Libraries |
|---|---:|---|---|
| [`ba-ref.py`](scripts/fixtures/ba-ref.py) | 6 / 6 | Bland–Altman node (numpy / scipy, written out from the papers). | NumPy, SciPy |
| [`bar-ref.py`](scripts/fixtures/bar-ref.py) | 7 / 7 | Bar chart node (numpy / scipy / matplotlib). | NumPy, SciPy, matplotlib |
| [`baseline-ref.py`](scripts/fixtures/baseline-ref.py) | 16 / 16 | Baselines (NumPy, SciPy's sparse solver): the iterative polynomial, asymmetric least squares, airPLS, SNIP (log-log-square-root), Shirley, Tougaard: on a spectrum of three peaks over a curved background, a little noise. | NumPy, SciPy |
| [`biostat-ref.py`](scripts/fixtures/biostat-ref.py) | 7 / 7 | Dunnett (scipy.stats.dunnett), two-way ANOVA with a factor between and one within the subjects (pingouin.mixed_anova), two-way with both factors within (statsmodels AnovaRM; pingouin.rm_anova for ε), the linear mixed model with a random intercept, REML (statsmodels MixedLM) on data with missing values. Made with SciPy 1.18, statsmodels 0.15, pingouin 0.7, pandas 3.0 (a virtual environment: pip install scipy statsmodels pingouin). | NumPy, pandas, SciPy, pingouin, statsmodels |
| [`box-ref.py`](scripts/fixtures/box-ref.py) | 10 / 10 | Box & violin node (matplotlib / scipy). | NumPy, SciPy, matplotlib |
| [`contour-ref.py`](scripts/fixtures/contour-ref.py) | 14 / 14 | Contour / heatmap node: contour lines (contourpy's serial algorithm, as matplotlib's; engine: the vertices of the lines of a level) and scattered points interpolated to a grid (scipy griddata, linear) | NumPy, contourpy, SciPy |
| [`cv-ref.py`](scripts/fixtures/cv-ref.py) | 13 / 13 | The C-V structures of the Signal generator, each computed apart from the app's algorithm: the MOS capacitor of CV_ideal.m (the band bending solved at every gate voltage by brentq; low frequency, and high frequency held below 2.10\|u_B\| + 1.33 kT/q), the exact high-frequency capacitance of Lindner (1962) and Brews (1974) (the linearized Poisson equation integrated in x on the equilibrium profile by solve_ivp), interface traps (their charge and capacitance by quad over the Fermi function) and the curve they make, the p-n junction (abrupt; linearly graded, its built-in voltage by brentq) and the Schottky diode (Sze & Ng, ch. 2 and 3), the SPICE junction capacitance, the ferroelectric capacitor of Miller et al. (1990), the semiconductor electrode with its Helmholtz layer (Poisson's equation, the potential split by brentq) and the Gouy-Chapman-Stern double layer (Bard & Faulkner, section 13.3; the potential split by brentq). | NumPy, SciPy |
| [`cwt-ref.py`](scripts/fixtures/cwt-ref.py) | 2 / 2 | Morlet scalogram: its definition (Torrence & Compo, a direct sum in NumPy) and PyWavelets' complex Morlet of the same shape (cmor2.0-w0/2pi). | NumPy, PyWavelets |
| [`hist-ref.py`](scripts/fixtures/hist-ref.py) | 18 / 18 | Histogram node (numpy / scipy / sklearn). | NumPy, SciPy, scikit-learn |
| [`image-ref.py`](scripts/fixtures/image-ref.py) | 23 / 23 | Image analysis node (scikit-image 0.25, scipy, numpy): Small synthetic images whose values are exact in float32 (multiples of 1/8), so the differences are the algorithms'. | NumPy, SciPy, scikit-image |
| [`kk-ref.py`](scripts/fixtures/kk-ref.py) | 1 / 1 | Lin-KK test of the Kramers–Kronig node (numpy; Schönleber et al. 2014, as impedance.py's linKK builds its model): A Randles circuit with 0.3 % noise; the fit of R0, M RC elements (time constants spread evenly in log over the frequencies), an inductance, every row divided by \|Z\|; of M = 1 … 50, the best fit with μ ≥ 0.85. | NumPy |
| [`learn-ref.py`](scripts/fixtures/learn-ref.py) | 2 / 2 | Classifier of Find like this &gt; Review, from scikit-learn: LogisticRegression (C = 1), LinearDiscriminantAnalysis (lsqr, Ledoit-Wolf shrinkage) and KNeighborsClassifier (k = 5, weighted by distance), each on the features standardized by StandardScaler; their probabilities on new points and their leave-one-out accuracies (the scaler fitted again in every fold). | NumPy, scikit-learn |
| [`matrix-ref.py`](scripts/fixtures/matrix-ref.py) | 43 / 43 | Matrix nodes: numpy.linalg and scipy.linalg on a few matrices: general, symmetric positive definite, rectangular, rank-deficient, with real eigenvalues, Hilbert. | NumPy, SciPy |
| [`nr-ref.py`](scripts/fixtures/nr-ref.py) | 4 / 4 | Incomplete beta and gamma functions (scipy.special betainc, gammainc and their complements) and the eigenvalues of non-symmetric matrices (numpy.linalg.eigvals), for src/engine/dist.ts and src/engine/matrix.ts. | NumPy, SciPy |
| [`peakshape-ref.py`](scripts/fixtures/peakshape-ref.py) | 11 / 11 | Peak shapes (SciPy): the Faddeeva function w(z) over the upper half plane, the Voigt profile, and a Doniach–Šunjić line computed from its formula. | NumPy, SciPy |
| [`pie-ref.py`](scripts/fixtures/pie-ref.py) | 3 / 3 | Pie chart node (matplotlib pie: the wedges' angles). | matplotlib |
| [`prob-ref.py`](scripts/fixtures/prob-ref.py) | 29 / 29 | Probability plot node (scipy). | NumPy, SciPy |
| [`quickfit-ref.py`](scripts/fixtures/quickfit-ref.py) | 8 / 8 | Quick fit: scipy.optimize.curve_fit (two Gaussians on a constant, the covariance scaled by the residual variance) and scipy.stats.linregress (a line on a range, its standard errors). | NumPy, SciPy |
| [`rdist-ref.py`](scripts/fixtures/rdist-ref.py) | 4 / 4 | Studentized range, the noncentral t and Shapiro–Wilk: scipy.stats | SciPy, NumPy |
| [`reliability-ref.py`](scripts/fixtures/reliability-ref.py) | 17 / 17 | Life data: the Python package `reliability` (Fitters: maximum likelihood with right censoring, rank regression, 3-parameter Weibull, Fisher bounds, plotting positions with Johnson's adjusted ranks) and `lifelines` (Kaplan–Meier with the exponential Greenwood interval). Run in an environment with both: python reliability-ref.py &gt; reliability-ref.json | matplotlib, NumPy, reliability, lifelines, SciPy |
| [`roi-ref.py`](scripts/fixtures/roi-ref.py) | 1 / 1 | Selections of the Image analysis node (scikit-image regionprops, scipy, numpy, matplotlib for the pixels inside a polygon: their centres, as ImageJ): The gray image G of image-ref.json (20 × 24) measured under a few shapes. | NumPy, matplotlib, SciPy, scikit-image |
| [`sig-ref.py`](scripts/fixtures/sig-ref.py) | 5 / 5 | Significance brackets (scipy): Welch t + Holm, Mann–Whitney, Tukey HSD | NumPy, SciPy |
| [`siggen-ref.py`](scripts/fixtures/siggen-ref.py) | 5 / 5 | The Signal generator: scipy's chirp, square and sawtooth, the Voigt profile, and the ideal C-V curve of a MOS capacitor by the algorithm of razvan_CV_ideal_test.m (the majority carriers only, a dense grid of the surface potential read at the gate sweep), with CODATA constants. | NumPy, SciPy |
| [`signal-ref.py`](scripts/fixtures/signal-ref.py) | 1 / 1 | Signal processing (scipy / numpy). | NumPy, SciPy |
| [`sigpack-ref.py`](scripts/fixtures/sigpack-ref.py) | 14 / 14 | Signal package: the arPLS baseline (pybaselines), the change points (ruptures: Pelt and Binseg, jump 1), the continuous wavelet transform with its significance and the wavelet coherence (pycwt), the multiresolution analysis (PyWavelets' mra, the stationary transform), the peaks of a Ricker transform (SciPy's find_peaks_cwt), the fractional derivatives (differint, and the exact ones of powers), the fast fractional Fourier transform (fracF of Ozaktas et al. 1996, written out here), the Lomb–Scargle periodogram (astropy's LombScargle and scipy.signal.lombscargle), the Bessel filter and the notch (scipy.signal.bessel, iirnotch). It also writes src/engine/waveletFilters.ts (the filters of PyWavelets). Made with SciPy 1.18, PyWavelets 1.9, pycwt 0.5, pybaselines 1.2, ruptures 1.1, differint, astropy 8.0 (a virtual environment: pip install scipy PyWavelets pycwt pybaselines ruptures differint astropy). | NumPy, SciPy, PyWavelets, pycwt, ruptures, pybaselines, differint, astropy |
| [`spectral-ref.py`](scripts/fixtures/spectral-ref.py) | 17 / 17 | Spectral analysis (SciPy): Welch's PSD, the coherence, the spectrogram, the analytic signal, Butterworth and Chebyshev filters (second-order sections, causal and forward–backward), and the overlapping Allan deviation (its formula, NumPy). | NumPy, SciPy |
| [`stat2-ref.py`](scripts/fixtures/stat2-ref.py) | 15 / 15 | Regressions (NumPy least squares; the logistic likelihood maximized by SciPy), the power and sample sizes (SciPy's noncentral t and F, as statsmodels' power classes use them) and the principal components (scikit-learn). | NumPy, SciPy, scikit-learn |
| [`stats-ref.py`](scripts/fixtures/stats-ref.py) | 1 / 1 | Statistics (scipy). | NumPy, SciPy |
| [`tests2-ref.py`](scripts/fixtures/tests2-ref.py) | 5 / 5 | P-values adjusted (statsmodels multipletests), contingency tables (scipy.stats: chi2_contingency, fisher_exact, odds_ratio, relative_risk, association; statsmodels mcnemar), ROC (scikit-learn roc_auc_score, roc_curve; DeLong's variance from its definition, Sun & Xu 2014), survival (lifelines KaplanMeierFitter, logrank_test, multivariate_logrank_test with its weightings), the linear model (statsmodels OLS / WLS with formulas, anova_lm Type II, variance_inflation_factor, het_breuschpagan, durbin_watson, OLSInfluence). Made with SciPy 1.18, statsmodels 0.15, lifelines 0.30, scikit-learn 1.9 (a virtual environment: pip install scipy statsmodels lifelines scikit-learn pandas). | NumPy, pandas, SciPy, statsmodels, scikit-learn, lifelines |
| [`tests3-ref.py`](scripts/fixtures/tests3-ref.py) | 6 / 6 | Power and sample size (statsmodels TTestPower, TTestIndPower, FTestAnovaPower, NormalIndPower, GofChisquarePower), the bootstrap and permutation tests (scipy.stats.bootstrap, permutation_test), distributions fitted by maximum likelihood (scipy.stats *.fit, kstest), agreement (statsmodels cohens_kappa, fleiss_kappa; pingouin intraclass_corr, cronbach_alpha), the logistic regression (statsmodels Logit). Lin's concordance, Passing–Bablok, Deming and Hosmer–Lemeshow written here from their papers (Lin 1989; Passing and Bablok 1983; Linnet 1993; Hosmer and Lemeshow, as R's ResourceSelection), as no library at hand does them right. Made with SciPy 1.18, statsmodels 0.15, pingouin 0.7 (a virtual environment: pip install scipy statsmodels pingouin). | NumPy, pandas, SciPy, statsmodels, pingouin |
| [`trend-ref.py`](scripts/fixtures/trend-ref.py) | 8 / 8 | The trend lines of a Plot: numpy's least squares (polyfit; the exponential and the power on ln y, as spreadsheets fit them), the band of the mean t·s·√(x₀ᵀ(XᵀX)⁻¹x₀) with the inverse taken directly, a centred moving average. python trend-ref.py &gt; trend-ref.json | NumPy, SciPy |
| [`wavelet-ref.py`](scripts/fixtures/wavelet-ref.py) | 3 / 3 | Wavelets (PyWavelets): the decomposition filters of Haar, Daubechies 2 and 4, Symlet 4; the multilevel transform (periodization) and its inverse; the denoising: the signal extended symmetrically to a multiple of 2^level, wavedec, the universal threshold from the MAD of the finest details, soft and hard, waverec, cut back. | NumPy, PyWavelets |

## Conventions of a named library or program

| Compared with | Checks |
|---|---:|
| ImageJ | 3 / 3 |
| Origin | 2 / 2 |
| SciPy | 16 / 16 |
| NumPy | 3 / 3 |
| matplotlib | 1 / 1 |
| scikit-image | 4 / 4 |

## Every check

<details><summary><b>ba-ref.py</b>: 6 checks</summary>

- ✓ Bland–Altman (diff): bias, SD, limits, their approximate and exact intervals, the regression on X
- ✓ Bland–Altman (pct): bias, SD, limits, their approximate and exact intervals, the regression on X
- ✓ Bland–Altman (ratio): bias, SD, limits, their approximate and exact intervals, the regression on X
- ✓ Bland–Altman: the regression-based limits (Bland & Altman 1999)
- ✓ Bland–Altman: nonparametric limits (median, 2.5th and 97.5th percentiles)
- ✓ Bland–Altman: points, lines with their values, bands, every line its own look

</details>

<details><summary><b>bar-ref.py</b>: 7 checks</summary>

- ✓ Bar chart, raw values: mean / median / sum / count with SD, SE, 95 % CI (t), min – max, Q1 – Q3 as numpy / scipy
- ✓ Bar chart: grouped bars as matplotlib bar (centred offsets, width 0.8 / 3)
- ✓ Bar chart: stacked; the positive values up, the negative ones down
- ✓ Bar chart: 100 % stacked of the absolute totals
- ✓ Bar chart: horizontal bars as matplotlib barh
- ✓ Bar chart: values written with 1 decimal, those under 20 % of the total hidden (\|\|2.0\|-2.0)
- ✓ Bar chart: a floating bar from the first column to the next

</details>

<details><summary><b>baseline-ref.py</b>: 16 checks</summary>

- ✓ baseline poly3: as NumPy / SciPy (4.0e-12)
- ✓ baseline asls: as NumPy / SciPy (8.6e-10)
- ✓ baseline airpls: as NumPy / SciPy (8.4e-10)
- ✓ baseline snip: as NumPy / SciPy (5.3e-14)
- ✓ baseline shirley: as NumPy / SciPy (3.6e-14)
- ✓ baseline tougaard: as NumPy / SciPy (2.5e-14)
- ✓ baselines: asymmetric least squares, airPLS, the polynomial find the background under the peaks
- ✓ baselines: over the dips; the same as under the peaks, mirrored
- ✓ baseline Shirley: from one level to the other through the peak (20.00 at the centre)
- ✓ baseline Tougaard: from the start level to the far end; the losses toward a lower X: the same, mirrored
- ✓ Integrate: the line between the ends as before; the ends averaged when asked
- ✓ Integrate: the area over an asymmetric-least-squares baseline (1.7302, √π = 1.7725)
- ✓ Peak width: a Gaussian over an ALS baseline (height 29.49, FWHM 5.894)
- ✓ Peak width: over a baseline of points (1.6785)
- ✓ Peak analyzer: the peaks measured over an ALS baseline (heights 29.8,17.3,35.1)
- ✓ Peak width: the height over another column (29.970)

</details>

<details><summary><b>biostat-ref.py</b>: 7 checks</summary>

- ✓ Dunnett: the multivariate t probability as scipy at 4 million points (~1e-8); t exact, p and the simultaneous intervals as scipy.stats.dunnett (its quasi-Monte Carlo: p 5.1e-5, -2.0e-5, 1.7e-6)
- ✓ Two-way ANOVA, a factor between and one within, unequal groups: the factor between as pingouin.mixed_anova; the factor within and the interaction by Type III sums (numpy least squares, as SPSS / Prism); ε pooled within the groups
- ✓ Two-way ANOVA, a factor between and one within, equal groups: SS, F, df, p, ε and the Greenhouse–Geisser p as pingouin.mixed_anova
- ✓ Two-way ANOVA, both factors within: F, df, p as statsmodels AnovaRM; Greenhouse–Geisser ε of every effect
- ✓ Mixed model (REML, a random intercept): fixed effects, variances and the REML log-likelihood as statsmodels MixedLM (σ²_u -8.9e-7)
- ✓ ANOVA node: two-way with repeated measures and the mixed model on indexed data (value, factors, subject); Dunnett against the control named
- ✓ Mixed model on complete data: the F tests and Satterthwaite's df of the ANOVA with repeated measures (7.9748 (14.000), 12.2971 (42.000), 3.9979 (42.000))

</details>

<details><summary><b>box-ref.py</b>: 10 checks</summary>

- ✓ Box (normal): quartiles, whiskers (1.5·IQR, 5–95, 10–90, min–max), notch, mean, outliers as matplotlib
- ✓ Violin (normal): 100 points from min to max, the density as gaussian_kde (Scott, Silverman)
- ✓ Box (skewed): quartiles, whiskers (1.5·IQR, 5–95, 10–90, min–max), notch, mean, outliers as matplotlib
- ✓ Violin (skewed): 100 points from min to max, the density as gaussian_kde (Scott, Silverman)
- ✓ Box (outliers): quartiles, whiskers (1.5·IQR, 5–95, 10–90, min–max), notch, mean, outliers as matplotlib
- ✓ Violin (outliers): 100 points from min to max, the density as gaussian_kde (Scott, Silverman)
- ✓ Violins: groups and subgroups of raw values, every violin as wide
- ✓ Violins: one scale for all (the widest at full width)
- ✓ Violins: split; two subgroups, a half each at the same place
- ✓ Box: a gradient on one group, the others plain

</details>

<details><summary><b>contour-ref.py</b>: 14 checks</summary>

- ✓ Contour lines (Z = -0.5): 2 lines, the vertices of contourpy (28 / 28)
- ✓ Contour lines (Z = 0.0): 2 lines, the vertices of contourpy (96 / 96)
- ✓ Contour lines (Z = 0.4): 3 lines, the vertices of contourpy (101 / 101)
- ✓ Contour lines (Z = 0.75): 3 lines, the vertices of contourpy (69 / 69)
- ✓ Scattered points to a grid: linear on the Delaunay triangles as scipy griddata (worst 5.6e-16)
- ✓ A grid found in X, Y, Z rows in any order
- ✓ A matrix: X from the Z columns' names, rows and columns sorted
- ✓ Profiles: the nearest row and column
- ✓ Levels: nice values, decades on a log Z
- ✓ Contour: filled levels with black lines, a value on each
- ✓ Contour: the values written left out of the map, a threshold a cut when drawn, both out of the range; the outputs keep them
- ✓ Contour: outside the colour range hidden; a cut at its ends (else none: the end colours)
- ✓ Contour: the lines drawn on the values not hidden
- ✓ Contour: every value hidden; said

</details>

<details><summary><b>cv-ref.py</b>: 13 checks</summary>

- ✓ C–V, MOS: as CV_ideal.m, its band bending solved at every one of 1001 gate voltages (scipy brentq): low frequency 1.0e-14, high frequency (held below 2.10\|u_B\| + 1.33 kT/q) 1.9e-15
- ✓ C–V, MOS: the exact high-frequency capacitance (Lindner 1962; Brews 1974) as the linearized Poisson equation in x on the equilibrium profile (scipy solve_ivp) to 3.4e-9 from depletion to strong inversion and accumulation; with no minority carriers, the deep depletion's own (5.1e-8)
- ✓ C–V, MOS: the high-frequency minimum against the exact theory, Si (p, 10¹⁶ cm⁻³, 20 nm SiO₂): at 2φ_B (Sze) +7.04 %, CV_ideal.m +2.79 %; 4H-SiC (n, 10¹⁶, 14 nm): +2.48 %, −0.39 % (the depletion approximation at 2φ_B above it, CV_ideal.m's nearer)
- ✓ C–V, MOS: interface traps (U-shaped, donors below mid-gap, acceptors above), their charge and capacitance at 300 K and 77 K as scipy quad over the Fermi function (1.1e-15); the low- and high-frequency curves they stretch (7.8e-16, 1.4e-15)
- ✓ C–V, MOS: the high–low method (Castagné & Vapaille 1971) gives back the D_it typed to 0.000 %, Terman's (1962) to 0.002 %, over 22 voltages in depletion
- ✓ C–V: measured in parallel mode through R_s with a leak G, Nicollian and Brews's correction gives back C and G (3.4e-9)
- ✓ C–V: p–n junctions (abrupt; linearly graded, V_bi 0.6671 V self-consistent as scipy brentq) and a Schottky diode as Sze and Ng (6.7e-16, 9.6e-16, 1.0e-15); their 1/C² lines give back N_eff and V_bi − 2kT/q, N_D and V_bi − kT/q, 1/C³ of the graded one V_bi
- ✓ C–V: the SPICE junction capacitance C_J0(1 − V/V_J)^−M, linear beyond F_C·V_J (SPICE2, Nagel 1975) as the reference; with M = ½, V_J = V_bi − 2kT/q, the abrupt junction; continuous at F_C·V_J
- ✓ C–V: a MIM capacitor, C₀ = ε₀εA/d and its voltage coefficients given back (20.0000 ppm/V, 50.0000 ppm/V²)
- ✓ C–V: a ferroelectric capacitor as Miller, Nasby, Schwank, Rodgers and Dressendorfer (1990): its butterfly up and down as the reference; P = ∓P_r at 0 V, 0 at the coercive voltage, where C is largest
- ✓ C–V: a semiconductor electrode with its Helmholtz layer as the reference (5.4e-15); without it, the Mott–Schottky line (Gelderman, Lee and Donne 2007) gives N_D 1.00000·10¹⁸ cm⁻³ (10¹⁸ typed) and E_fb + kT/q to 0.0002 mV
- ✓ C–V: the Gouy–Chapman and Gouy–Chapman–Stern double layers as the reference (1.8e-15, 2.0e-15; the diffuse layer's potential to 3.6e-16 V); Bard and Faulkner's 228.5·z·√C*·cosh(19.5·z·φ₀) µF/cm² to 0.39 % (its rounded constants), the Debye lengths 3.04 and 0.962 nm to 0.06 %
- ✓ C–V: the table made (V (V) / C (nF/cm²) / G_m (S) / 1/C² (cm⁴/nF²) / W (nm); V (V) / C (pF), up / P (µC/cm²), up / C (pF), down / P (µC/cm²), down; V_G (V) / C/C_ox, LF / C/C_ox, HF) and its graphs

</details>

<details><summary><b>cwt-ref.py</b>: 2 checks</summary>

- ✓ Morlet scalogram as its definition (a direct sum, Torrence & Compo), 28 scales (9.6e-10)
- ✓ Morlet scalogram against PyWavelets (cmor2.0, scales of 16 to 128 samples, a tone at each): the powers × 2√π apart by 1.05, 0.16, 0.10, 1.32 %

</details>

<details><summary><b>hist-ref.py</b>: 18 checks</summary>

- ✓ Histogram bins: auto as numpy (14 bins)
- ✓ Histogram bins: sturges as numpy (10 bins)
- ✓ Histogram bins: scott as numpy (11 bins)
- ✓ Histogram bins: fd as numpy (14 bins)
- ✓ Histogram bins: sqrt as numpy (18 bins)
- ✓ Histogram bins: rice as numpy (14 bins)
- ✓ Histogram: 10 bins, their counts as numpy (the last bin closed)
- ✓ Histogram: density as numpy (density=True)
- ✓ Histogram: a range, edges written (counts as numpy)
- ✓ Histogram: cumulative probability ends at 1
- ✓ Histogram fit Normal from the data: μ, σ, errors, χ² 10.8287, p 0.1463 as scipy
- ✓ Histogram fit Gaussian to the bars: xc, σ, height and errors as curve_fit (5.071063703928846)
- ✓ Histogram fit two normals from the data: w, μ, σ, log L as sklearn (2.00383, 4.95481)
- ✓ Histogram fit two Gaussians to the bars: as curve_fit
- ✓ Histogram fit Cauchy from the data: x0 9.97180, γ 0.43541 as scipy
- ✓ Histogram fit Lorentzian to the bars: as curve_fit
- ✓ Histogram kernel density: Scott and Silverman as scipy
- ✓ Histogram: two columns stacked, one set of bins

</details>

<details><summary><b>image-ref.py</b>: 23 checks</summary>

- ✓ local entropy (bits, disk 2) as scikit-image's rank.entropy away from the edge (4.519653318268979e-7)
- ✓ Canny (σ 1.5, 0.05 / 0.12) as scikit-image: 0 pixels differ of 71 edges
- ✓ bilateral (σ 1.5 px, 0.1) as the formula written out (1.3e-7); near scikit-image's (correlation 0.964)
- ✓ non-local means close to scikit-image's (fast mode): correlation 0.9987
- ✓ equalisation as scikit-image's equalize_hist (5.164375252784258e-7)
- ✓ CLAHE close to scikit-image's equalize_adapthist (another clip rule): correlation 0.969
- ✓ local thresholds mean, median, Gaussian, Niblack, Sauvola (window 7) as scikit-image (0 0 0 0 0 pixels differ)
- ✓ all 16 methods on a bimodal image: thresholds between the populations, the blobs found; Percentile halves the pixels (50.3 % above)
- ✓ HSV and L*a*b* channels as scikit-image's rgb2hsv / rgb2lab (5.1e-7, 3.6e-5)
- ✓ fill holes as scipy binary_fill_holes
- ✓ distance map as scipy distance_transform_edt (exact Euclidean)
- ✓ skeleton (Zhang–Suen): inside the shapes, no 2 × 2 block, every shape one piece (3 of 3)
- ✓ watershed: two touching discs cut in two by a line of 7 pixels; a bar, one disc left whole (2, 1, 1)
- ✓ nearest neighbours of a grid: 20 px centre to centre, 12 px edge to edge; Clark–Evans R 1.83 (regular); its squares named; two pixels joined by a corner traced as one (8-connected)
- ✓ arrangement: hexagonal R 2.08 ψ6 1.00 peak 19.7; random R 0.96 (p 0.21, L in the band true); clustered R 0.28 in 80 clusters
- ✓ arrangement in the node: its sheets, in nm (NND 10 nm)
- ✓ lattice: fringes 7.300 px; the spot d 9.494 at 157.1°; the pattern's centre 130.5, 121.5; rings Au 111 -0.04 %, Au 200 -0.14 %, Au 220 -0.08 %, Au 311 -0.06 %
- ✓ lattice in the node: d 0.1899 nm, fringes 0.1900 nm, rings 111 200 220 311
- ✓ Find like this, the finer settings: as before when given as they are; reach 2.5 (20 of 48); Precise 48, Fast 48 of 48
- ✓ Find like this, the brightness counted: a cube dimmed to a third 0.99 → 0.13, the others on their own 0.92 or more
- ✓ Find like this ▸ edges only inside the margin: the side 19.78 (unlimited 19.81, true 20.048076536421153)
- ✓ Find like this ▸ Compare: hollow cubes found by the edges 17, by the values 2 of 24; strong noise: by the values 48, both 47, the edges 25 of 48; a clean image by the edges 48; none wrong
- ✓ Find like this, the first search through the FFT: the same places as directly (values, edges, both; a disc and only the particle): true, true, true, true, true, true

</details>

<details><summary><b>kk-ref.py</b>: 1 checks</summary>

- ✓ Lin-KK: 16 elements, μ 0.958, residuals as numpy (within 8.9e-8 %); noise 0.3 %: within 0.72 %; R_ct growing 30 % during the sweep: 7.3 %

</details>

<details><summary><b>learn-ref.py</b>: 2 checks</summary>

- ✓ Review ▸ learn: logistic, LDA, k-NN as scikit-learn (largest difference 1.7e-11); forest right on 83 %; auto logistic (87 %), the first feature counts most; fewer than 3 of a kind: none
- ✓ Accuracy: 2 right of 4 found in the area marked, 2 of the 4 true ones missed: precision 0.5, recall 0.5, F1 0.5

</details>

<details><summary><b>matrix-ref.py</b>: 43 checks</summary>

- ✓ Matrix: det, trace as numpy (-0.2420502408961773)
- ✓ Matrix: the inverse as numpy inv
- ✓ Matrix: solve A·x = B as numpy solve
- ✓ Matrix: LU (P, L, U) as scipy.linalg.lu: the same pivots
- ✓ Matrix: QR as numpy qr (the same signs)
- ✓ Matrix: QR of a 5 × 3 (reduced) as numpy qr
- ✓ Matrix: the complex eigenvalues of a general matrix as numpy eigvals (-0.5119,0.0000,0.0708,0.9121,0.0708,-0.9121,0.5651,0.0000)
- ✓ Matrix: the singular values as numpy svd
- ✓ Matrix: SVD; U·Σ·Vᵀ = A, UᵀU = I
- ✓ Matrix: the pseudo-inverse and the rank as numpy
- ✓ Matrix: the norms (Frobenius, 1, ∞, 2) and the condition number as numpy
- ✓ Matrix: Aⁿ (3, −2) as numpy matrix_power; a fraction refused
- ✓ Matrix: the Kronecker product as numpy kron
- ✓ Matrix: a symmetric matrix; eigenvalues ascending and vectors as numpy eigh
- ✓ Matrix: Cholesky as numpy cholesky; a non-symmetric matrix refused
- ✓ Matrix: a 5 × 3; least squares as numpy lstsq, pinv, rank, σ
- ✓ Matrix: a 3 × 5; σ and pinv as numpy
- ✓ Matrix: a rank-deficient matrix; rank 2, pinv as numpy
- ✓ Matrix: a singular matrix; no inverse, said
- ✓ Matrix: a general matrix with real eigenvalues; values and vectors as numpy eig
- ✓ Matrix: Hilbert 5; cond and inverse as numpy
- ✓ Matrix: Vandermonde and Hilbert as numpy vander / scipy hilbert
- ✓ Matrix: a formula of i, j; identity; rotation
- ✓ Matrix: typed cells (a decimal comma, an empty cell)
- ✓ Matrix: a row just added (empty) is kept: of 2 columns and of 1; no value at all: no matrix
- ✓ Matrix from a dataset: the rows’ Y from X, the columns’ X from their names
- ✓ Matrix ▸ dataset: read back as a matrix by the Contour
- ✓ Matrix: the rows’ Y and the columns’ X by hand (a range, a step, a list, names; typed and from a dataset)
- ✓ Matrix: rot90 and flips as numpy
- ✓ Matrix: reshape (row by row), part
- ✓ Matrix: broadcasting a row over A (numpy); sizes that do not fit said
- ✓ Matrix: sums, means, max; the diagonal both ways
- ✓ Matrix: [A; B], dot and cross products
- ✓ Matrix computation: A⁻¹ then R1 × A = I
- ✓ Matrix computation: the pieces of LU used by a step below; det a value
- ✓ Matrix computation: a formula of a, b, i, j; a product of sizes that do not fit: said
- ✓ Matrix computation: an empty cell; no inverse (said), element by element it stays empty; a step on a failed one said
- ✓ Workbook: rows of an input sheet left out and moved (4,1,3; input)
- ✓ Workbook: a matrix on an input, its names as asked (Row, C1, C2, C3 · C1, C2, C3)
- ✓ Matrix computation in a graph: a port a result ()
- ✓ Matrix ports: the types of the results, what the inputs take
- ✓ Contour of a matrix: the figure, a value in every cell, row 1 at the top, square cells; a new Contour's defaults ()
- ✓ Contour: a dataset and a matrix at once; said

</details>

<details><summary><b>nr-ref.py</b>: 4 checks</summary>

- ✓ Incomplete beta and its complement vs scipy (worst relative 1.3e-12)
- ✓ Incomplete gamma P and Q vs scipy (worst relative 3.6e-14)
- ✓ Eigenvalues of the non-symmetric A vs numpy (worst 3.9e-16 of the largest)
- ✓ Eigenvalues of the non-symmetric badly scaled B vs numpy (worst 3.6e-16 of the largest)

</details>

<details><summary><b>peakshape-ref.py</b>: 11 checks</summary>

- ✓ Faddeeva w(z) over the upper half plane as SciPy (relative 3.1e-13)
- ✓ the Voigt profile as SciPy's voigt_profile (2.8e-10)
- ✓ the FWHM of a Voigt: Gaussian, Lorentzian, both (Olivero)
- ✓ Doniach–Šunjić as its formula (5.6e-17)
- ✓ Voigt fitted: y0, A, xc, wG, wL found again (0.200,49.999,0.300,1.600,0.900)
- ✓ Voigt peak: its area and FWHM (4.09990 vs 4.09761)
- ✓ constraints: xc2 = xc1 + 3, w2 = w1, A2 = 0.5·A1 kept, 3 free parameters (4.0000,8.0000,2.0000)
- ✓ constraints: the errors of the linked parameters propagated, the band drawn
- ✓ constraints: lines that do not read; said (4)
- ✓ constraints in a circle: left free, said
- ✓ Peak analyzer: a doublet fitted; its partner at ΔX, half the area, the same width (284.000,285.500)

</details>

<details><summary><b>pie-ref.py</b>: 3 checks</summary>

- ✓ Pie: the slices' angles as matplotlib (start, both directions)
- ✓ Pie: nested rings as matplotlib's donut example (width 0.3 each)
- ✓ Pie: small slices merged into Other, labels, the total in the hole, a slice moved out

</details>

<details><summary><b>prob-ref.py</b>: 29 checks</summary>

- ✓ Probability plot: normal fitted by maximum likelihood as scipy (49.34551, 6.771384)
- ✓ Probability plot: lognormal fitted by maximum likelihood as scipy (1.254123, 0.4944208)
- ✓ Probability plot: exponential fitted by maximum likelihood as scipy (3.458848)
- ✓ Probability plot: weibull fitted by maximum likelihood as scipy (2.222017, 4.067103)
- ✓ Probability plot: gamma fitted by maximum likelihood as scipy (5.004368, 1.436446)
- ✓ Probability plot: logistic fitted by maximum likelihood as scipy (10.01715, 1.786122)
- ✓ Probability plot: gumbel fitted by maximum likelihood as scipy (5.435950, 1.645515)
- ✓ Probability plot: uniform fitted by maximum likelihood as scipy (2.078573, 6.787268)
- ✓ Q-Q (normal): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (lognormal): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (exponential): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (weibull): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (gamma): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (logistic): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (gumbel): the quantiles, slope, intercept and r of scipy probplot
- ✓ Q-Q (uniform): the quantiles, slope, intercept and r of scipy probplot
- ✓ Anderson–Darling (normal): A² 0.26550 as scipy anderson
- ✓ Anderson–Darling (exponential): A² 0.25074 as scipy anderson, the 5 % critical value
- ✓ Anderson–Darling (logistic): A² 0.32447 as scipy anderson, the 5 % critical value
- ✓ Anderson–Darling (gumbel): A² 0.54124 as scipy anderson, the 5 % critical value
- ✓ Gamma quantiles as scipy gamma.ppf (shape 0.3 – 40, p 1e-4 – 0.9999)
- ✓ ECDF with ties and its pointwise band as scipy ecdf
- ✓ ECDF: 1 − F as a count, the DKW band
- ✓ Q-Q: the line and the pointwise 95 % band of car::qqPlot
- ✓ Plotting positions: Blom, Hazen, Van der Waerden, Benard
- ✓ Probability axis: placed by Φ⁻¹, symmetric, out to the next tick, ticks in %
- ✓ Probability (Weibull): the probability axis ln(−ln(1 − p)), the data on a log axis, the fitted CDF
- ✓ Probability plot node: raw values by group, a normal probability axis, the data on a log axis, a row per group
- ✓ Probability plot: given parameters that cannot be (σ ≤ 0) are refused

</details>

<details><summary><b>quickfit-ref.py</b>: 8 checks</summary>

- ✓ Quick fit: two Gaussians on a constant as scipy curve_fit (values ~1e-6, errors ~1e-3: c 6.7e-12, A1 7.6e-11, xc1 8.7e-13, w1 -3.3e-11, A2 1.1e-10, xc2 -2.2e-12, w2 -1.5e-10)
- ✓ Quick fit: the peaks’ areas A·w·√(π/4 ln 2) ± from the covariance
- ✓ Quick fit: each peak drawn on the baseline
- ✓ Quick fit: a line on a range as scipy linregress (± errors, R²), drawn over its range
- ✓ Quick fit: a fit per range, or one of all the ranges (its curve only inside them), or the curve over all X
- ✓ Quick fit: a formula of one’s own, a parameter fixed
- ✓ Quick fit: two Lorentzians started at the peaks placed by hand
- ✓ Quick fit: an older project’s trend line read as its first quick fit

</details>

<details><summary><b>rdist-ref.py</b>: 4 checks</summary>

- ✓ Studentized range vs scipy (worst 4.2e-13)
- ✓ Noncentral t vs scipy (worst relative 2.8e-10)
- ✓ Shapiro–Wilk (Royston's formulas) vs scipy for n = 3 … 1000 ()
- ✓ Studentized range quantile: q(0.95; 3, 10) = 3.8768

</details>

<details><summary><b>reliability-ref.py</b>: 17 checks</summary>

- ✓ life data: Johnson’s adjusted ranks (Benard) as reliability’s plotting positions
- ✓ Weibull with suspensions, maximum likelihood: β, η and the log-likelihood as reliability (β 1.915822, η 905.535)
- ✓ Weibull: the 95 % Fisher-matrix intervals of β and η as reliability
- ✓ Weibull: B10 and B1 with their intervals as reliability (B10 279.75 [179.14, 436.87])
- ✓ Weibull: rank regression X on Y and Y on X (with suspensions) as reliability
- ✓ maximum likelihood with suspensions: Lognormal, Normal, Exponential, Gamma (reliability), Logistic, Gumbel (scipy): 6e-7, 3e-6, 5e-9, 7e-7, 4e-7, 5e-7
- ✓ 3-parameter Weibull, maximum likelihood: γ, β, η as reliability (γ 359.949)
- ✓ Kaplan–Meier with ties and suspensions, Greenwood’s interval (log–log) as lifelines (5.6e-16)
- ✓ life data: the status read; S / 0 suspended, F / 1 failed, anything else not read
- ✓ Probability plot with a status column: failures and suspensions, the fit, B10 and its interval in the statistics
- ✓ Probability plot: the parameters written in a corner, the 63.2 % line, the Fisher bounds of the fit
- ✓ ECDF with suspensions: Kaplan–Meier, the suspensions marked
- ✓ a probability axis: the dense ticks kept, the numbers by importance (1 2 5 10 20 30 50 70 90)
- ✓ Histogram: lognormal, Weibull, exponential, gamma by maximum likelihood (as the Probability plot), their errors, their curves as counts per bin (0.0e+0)
- ✓ Histogram: bins equal on a log scale (1, 10, 100, 1000)
- ✓ Histogram: every value counted with its weight
- ✓ Histogram: the mean and the median of a column as vertical lines (4, 2.5)

</details>

<details><summary><b>roi-ref.py</b>: 1 checks</summary>

- ✓ selections: pixels inside, centroid, fitted ellipse, intensity (mean, SD, median, skewness, kurtosis), Feret, perimeter, solidity as regionprops / scipy

</details>

<details><summary><b>sig-ref.py</b>: 5 checks</summary>

- ✓ Significance: Welch t + Holm as scipy (0.001631,0.9507,0.001631)
- ✓ Significance: Mann–Whitney as scipy
- ✓ Significance: Tukey HSD as scipy tukey_hsd (0.0007679,0.9980,0.0006486)
- ✓ Significance: from a post hoc table (ns left out), written with stars and p
- ✓ Significance: the wide bracket placed above the two narrow ones

</details>

<details><summary><b>siggen-ref.py</b>: 5 checks</summary>

- ✓ Signal generator: chirps (1e-16, 3e-14, 1e-16, 1e-14), square, sawtooth, triangle as scipy; Voigt; Fano's zero and maximum; coupled oscillators split by 2g (4.472, 5.477)
- ✓ Signal generator: noise spectra, white -0.01, pink -1.01, brown -1.99 (0, −1, −2)
- ✓ C–V: as razvan_CV_ideal_test.m (deep depletion, 300 K and 14 K: 7.5e-8, 5.9e-6); low frequency back to C_ox, high frequency at C_min (1.0154 of Sze's, which leaves out kT/q in W_max), deep depletion below
- ✓ Signal generator: an R(RC) circuit's impedance; noise at 20 dB SNR (SD 0.0708, expected 0.0707); 10 % missing; the same seed, the same signal
- ✓ Signal generator: its graph (the signal on the clean one; a C–V curve a temperature; Nyquist and Bode for an impedance)

</details>

<details><summary><b>signal-ref.py</b>: 1 checks</summary>

- ✓ signal: 31 results as scipy / numpy ()

</details>

<details><summary><b>sigpack-ref.py</b>: 14 checks</summary>

- ✓ arPLS as pybaselines: λ 10⁶ within 1.7e-10, 10⁴ within 6.9e-12
- ✓ change points as ruptures: PELT 80,139,230,300,400 (80,139,230,300,400); Binseg 80,139,231,300,400 (80,139,231,300,400); 4 changes 80,139,231,300,400; mean and variance 150,300,420 (150,300,420)
- ✓ wavelet transform as pycwt: Morlet, Paul, DOG within 1.0e-15, 7.5e-16, 1.7e-15; significance 1.1e-15; coherence 1.1e-15, phase 1.6e-15
- ✓ multiresolution analysis as PyWavelets: db4, sym6, coif2, Haar within 9.9e-16, 7.4e-16, 1.1e-15, 1.1e-15
- ✓ wavelet denoising: universal, SURE, Bayes, soft and hard, σ global or per level, as the thresholds on PyWavelets
- ✓ CWT peaks as SciPy's find_peaks_cwt: 18, 90, 193, 300, 395, 511, 565, 596 (18, 90, 193, 300, 395, 511, 565, 596)
- ✓ Grünwald–Letnikov as its sum written out: orders 0.5, -0.5, 1.3, -1.7 within 1.8e-13
- ✓ Riemann–Liouville as differint's RL (within its trapezoid rule): orders 0.5, -0.5, apart 3.7e-13, 3.7e-13
- ✓ fractional derivatives of powers as Γ(p + 1)/Γ(p + 1 − α) x^(p − α); Caputo of x² + 3 within 1.1e-4; Weyl of sin within 4.0e-15
- ✓ fast fractional Fourier transform as fracF (Ozaktas et al. 1996): orders 1, 2, 0.3, 0.7, 1.2, 1.7, 2.6, 3.4 within 2.2e-14
- ✓ discrete fractional Fourier transform: a = 1 the centred DFT (1.5e-14); 0.37 + 0.81 = 1.18 (2.3e-15); a = 2 the reversal u → −u (5.3e-15); back by −a (3.3e-15); the energy kept (2.2e-16)
- ✓ Lomb–Scargle as astropy and SciPy: 400 frequencies, the power within 3.1e-13; the false-alarm probability (Baluev) within 3.3e-12, its 1 % level 5.4e-15
- ✓ Bessel filters as SciPy's bessel (orders 1 to 12, low, high, band, stop) within 4.6e-12; the notch as iirnotch within 2.7e-14
- ✓ Hampel: the six spikes replaced (25, 75, 125, 175, 225, 275), the other points kept; none in the clean signal

</details>

<details><summary><b>spectral-ref.py</b>: 17 checks</summary>

- ✓ Welch PSD as SciPy (density, Hann; spectrum, Hamming, linear detrend: 2.2e-15)
- ✓ coherence and spectrogram as SciPy
- ✓ the analytic signal (Hilbert, odd length) as SciPy
- ✓ IIR design: Butterworth low / high pass, Chebyshev I band pass / stop; their responses as SciPy's (1.3e-15)
- ✓ IIR filtering: causal and forward–backward (SciPy's padding) as sosfilt / sosfiltfilt (7.0e-15)
- ✓ the overlapping Allan deviation of a rate as its formula (NumPy)
- ✓ Allan deviation of white noise: σ(τ0) = σ, slope −½ (-0.511)
- ✓ wavelets (Haar, Daubechies 2, 4, Symlet 4): orthonormal, vanishing moments, undone exactly, energy kept (haar 1e-15, db2 3e-15, db4 9e-16, sym4 5e-12)
- ✓ wavelet denoising: the error halved, the threshold from the noise (0.199 → 0.107)
- ✓ Morlet scalogram: a 12 Hz sine at 12.10 Hz
- ✓ FFT node, PSD: as Welch, the strongest line at 7 (7.03)
- ✓ FFT node, filter: a Butterworth low pass at 10 (zero phase)
- ✓ Smooth: wavelet denoising
- ✓ Convolution: the cross-correlation finds the delay of 0.25 (0.25)
- ✓ FFT node: the spectrogram as a long table (990 rows)
- ✓ step response: overshoot 37.23 % (37.23), peak at 1.645 (1.647)
- ✓ a pulse: its width at half height (2.3548), rise = fall

</details>

<details><summary><b>stat2-ref.py</b>: 15 checks</summary>

- ✓ linear regression on three predictors: coefficients, SE, p, CI as least squares (NumPy, SciPy)
- ✓ linear regression: R², adjusted R², F, AIC, BIC and the variance inflation of every predictor
- ✓ logistic regression: coefficients, SE, the likelihood, McFadden's R², the LR test (1.5e-7)
- ✓ power of the t-tests (one sample, two samples, one- and two-sided) as the noncentral t (SciPy)
- ✓ the sample sizes for a power (t: 34, 60 per group; ANOVA: 180) and the power of the ANOVA (noncentral F)
- ✓ principal components: of the correlations and of the covariances, their loadings (scikit-learn)
- ✓ the clustered order: the related ones together (1,0,3,2)
- ✓ control chart (individuals): the limits from the moving range, the point beyond 3σ found
- ✓ control chart (subgroups of 4): the limits from the mean range, a shift found (10)
- ✓ t-test: its power and the size needed (0.998, 21 per group)
- ✓ ANOVA: its power (0.9967)
- ✓ Correlation: PCA (components, loadings, scores) and the matrix in clustered order (x2, x1, y, x3)
- ✓ Statistics: the control chart of a column
- ✓ Fit, linear regression: as least squares (b1 1.46655)
- ✓ Fit, logistic regression on a yes / no column (b1 0.64077)

</details>

<details><summary><b>stats-ref.py</b>: 1 checks</summary>

- ✓ statistics: 267 values as scipy ()

</details>

<details><summary><b>tests2-ref.py</b>: 5 checks</summary>

- ✓ adjust p-values: Bonferroni, Holm, Hochberg, Hommel, BH, BY as statsmodels; the node finds the p column
- ✓ contingency: r × c χ², G, Fisher, V, C (true); raw rows (true); 2 × 2 Yates, Fisher, odds ratio, relative risk with CI, φ (true); McNemar (true); a sparse table → Fisher (true); goodness of fit (true)
- ✓ ROC: AUC 0.7777 and its DeLong SE as scikit-learn and the definition (true); DeLong's test of two (true); the curve as roc_curve (true); Youden's threshold (true); a lower score, found
- ✓ survival: Kaplan–Meier with its log–log band as lifelines (true); the median 8.6 and its CI (true); log-rank of two (true); the Mantel–Haenszel hazard ratio (true); log-rank, Gehan–Wilcoxon, Tarone–Ware of three (true); every two compared, at risk, censored (true)
- ✓ linear regression: coefficients, SE, t, p, CI, VIF as statsmodels (true); R², F, AIC, BIC, Durbin–Watson, Breusch–Pagan (true); leverage, studentized residuals, Cook's distance (true); Type II ANOVA (true); interactions (true); weighted (true)

</details>

<details><summary><b>tests3-ref.py</b>: 6 checks</summary>

- ✓ power and sample size as statsmodels; the node and its curve
- ✓ bootstrap: BCa median, percentile mean, BCa difference of means as SciPy within the resampling noise (true); permutation tests exact as SciPy (true)
- ✓ distribution fit: the maximum likelihood of 8 distributions as SciPy; Kolmogorov–Smirnov exact and Anderson–Darling (true); Kolmogorov's CDF as scipy.stats.kstwo (true); ranked by AIC (true); Beta (true)
- ✓ agreement: Cohen's κ unweighted, linear, quadratic with SE, CI, z, p as statsmodels (true); Fleiss's κ (true); the six ICC with F, p as pingouin, the CI as its (rounded to 0.01) (true); Cronbach's α with Feldt's CI (true); Lin's concordance (true)
- ✓ method comparison: Passing–Bablok slope, intercept and their intervals (true); Deming with jackknife SE, λ 1 and 2 (true); an exact line and the symmetry of Passing–Bablok (true)
- ✓ logistic regression: coefficients, SE, p as statsmodels's Logit (true); log-likelihoods, LR test, McFadden R², AIC, BIC (true); Hosmer–Lemeshow (true); the probabilities (true)

</details>

<details><summary><b>trend-ref.py</b>: 8 checks</summary>

- ✓ trend line: linear least squares, R² and the 95 % band of the line as numpy (y = 2.241x + 1.116)
- ✓ trend line: through the origin (R² uncentred, as spreadsheets)
- ✓ trend line: a cubic (QR) and its band as numpy (y = 0.005097x^{3} + 0.3203x^{2} − 1.575x + 2.094)
- ✓ trend line: exponential on ln y, its band back from the logs (y = 1.818·e^{0.2678x})
- ✓ trend line: power on ln x, ln y; logarithm (y = 2.227·x^{1.589} · y = 2.963 ln x + 1.521)
- ✓ trend line: a centred moving average of 5 as numpy convolve
- ✓ trend line: the points that cannot be fitted left out, or said
- ✓ a Plot curve with its trend line: the equation and R² in the legend, the band (y = 2.241x + 1.116, R² = 0.9912)

</details>

<details><summary><b>wavelet-ref.py</b>: 3 checks</summary>

- ✓ wavelets: the decomposition filters as PyWavelets 1.8.0 (2.2e-16)
- ✓ wavelets: wavedec and waverec (periodization, 4 levels) as PyWavelets (2.7e-15)
- ✓ wavelet denoising (4 wavelets, soft and hard, a length 2^k and an odd one) as PyWavelets (6.2e-15)

</details>

<details><summary><b>ImageJ</b>: 3 checks</summary>

- ✓ rolling ball r 5: the opening by the ball (as ImageJ) (7.157128632106117e-8)
- ✓ rolling ball r 18 on the image shrunk (as ImageJ): within 5.1 % of the exact background, never above the image
- ✓ wand: an L with a hole outlined on its pixels' corners (26 px, 6 corners, the hole inside); one pixel's perimeter 2.83 as ImageJ (2.828); a ring of background 2 px off a spot, 3 wide (0 wrong); Feret, its angle and least width of a box; a profile; mode

</details>

<details><summary><b>Origin</b>: 2 checks</summary>

- ✓ pseudo-Voigt (A = height): Origin’s μ and its error, the height (0.20020111394918128,2.083261706570469,9.999984433005574,2.0001519420623417,0.3486198472612226)
- ✓ Peak analyzer: a pseudo-Voigt’s % Gaussian ± error and its area as Origin (65.1380152799772 ± 0.9046530885225559, area 4.996995354083352; )

</details>

<details><summary><b>SciPy</b>: 16 checks</summary>

- ✓ example “Python script: peaks found and fitted with scipy” has no errors
- ✓ example “Python script: peaks found and fitted with scipy” draws curves
- ✓ example “Python script: peaks found and fitted with scipy” saves and opens
- ✓ Fit York: Pearson–York data: a, b as York 2004 (closed form), errors as scipy ODR (5.479910224032867 ± 0.3592465225511115,-0.48053340744620204 ± 0.07062026952877089, χ² 11.866353194061448)
- ✓ Fit compare models: χ², F, p as scipy (378.919665951096, 1.1526472458347668e-8)
- ✓ Fit same parameters for two runs: one fit vs a fit each, F-test as scipy (16.085731353405816, 0.00006854406025701466)
- ✓ pseudo-Voigt: PsdVoigt1 (A = area) as scipy, values and errors (0.20020 ± 0.00095, 4.997 ± 0.018, 10.0000 ± 0.0013, 2.0002 ± 0.0039, 0.3486 ± 0.0090)
- ✓ pseudo-Voigt: PsdVoigt2 (wG, wL) as scipy (0.19976 ± 0.00096, 5.008 ± 0.018, 9.9998 ± 0.0010, 1.9944 ± 0.0077, 1.213 ± 0.017, 0.405 ± 0.010)
- ✓ One point per X: mean ± SD, SE, 95 % CI (t) as scipy; X sorted, a masked row left out
- ✓ Gaussian σ 1.5 as scipy.ndimage.gaussian_filter (9.733593990054297e-8)
- ✓ LoG σ 2 as scipy gaussian_laplace (9.283254321056303e-8)
- ✓ Hessian eigenvalues σ 2 (scale-normalised) as from scipy Gaussian derivatives
- ✓ gradient magnitude: Sobel, Prewitt (scipy), Scharr
- ✓ Laplacian as scipy.ndimage.laplace
- ✓ mean and median over a disk of radius 2, median over a 3 × 3 square (scipy, disk as scikit-image)
- ✓ erosion, dilation (disk 2), opening, closing (disk 3) as scipy grey morphology

</details>

<details><summary><b>NumPy</b>: 3 checks</summary>

- ✓ stats: median and quartiles (numpy linear)
- ✓ fit: standard errors as numpy (0.11283386688686937, 0.026972453090029005)
- ✓ One point per X: the median with Q1 – Q3 (numpy percentiles) and min – max, unequal + and −

</details>

<details><summary><b>matplotlib</b>: 1 checks</summary>

- ✓ Python script: a matplotlib figure made into Plots; columns, look, fill_between, twin axis, legend, subplots in a Merge

</details>

<details><summary><b>scikit-image</b>: 4 checks</summary>

- ✓ Gabor magnitude as scikit-image's gabor (1.4588358254740743e-7)
- ✓ local binary patterns (P 8, R 1), uniform and default, as scikit-image (0 / 0 differ)
- ✓ thresholds Otsu, Yen, IsoData, Li, Mean, Minimum, Triangle of a float image as scikit-image
- ✓ thresholds Otsu, Yen, IsoData, Li, Mean, Minimum, Triangle of a 8-bit image as scikit-image

</details>

<details><summary><b>Exact values, definitions and properties</b>: 1210 checks</summary>

- ✓ box handles: a side moves alone (across, or up), the other ways ignored
- ✓ box handles: a corner moves two sides; Ctrl: about the centre
- ✓ box handles: Shift keeps its proportions; x1 on the right: the left side is x2
- ✓ box handles: turned 30°, the handle (1, 1) dragged, the other side stays in place
- ✓ box handles: turned 30°, the handle (-1, 1) dragged, the other side stays in place
- ✓ box handles: turned 30°, the handle (1, 0) dragged, the other side stays in place
- ✓ box handles: turned 30°, the handle (0, -1) dragged, the other side stays in place
- ✓ box handles: turned 90°, its side dragged along its own direction (5.00, 25.00, 55.00, 45.00)
- ✓ colour bar: auto values (0 2 4 6 8 10)
- ✓ colour bar: every 3, from a multiple or from 1
- ✓ colour bar: the levels of the map (inside it); none: as auto
- ✓ colour bar: min and max; a list (outside the map and repeated left out)
- ✓ colour bar: no values, the ticks where auto puts them
- ✓ colour bar: minor ticks between the values, and past them at the same step (3 7)
- ✓ colour bar: a log map, its decades and the 2 … 9 of each
- ✓ colour bar: its numbers as on an axis (2 decimals)
- ✓ colour bar: a step of 0.25 or 2.5 written with the decimals it needs (0.00 0.25 0.50 0.75 1.00)
- ✓ colour bar: the room on its side (right, or left with the ticks inside)
- ✓ colour bar: horizontal, no numbers: only its ticks and title under it
- ✓ comma CSV: delimiter and decimal
- ✓ comma CSV: names and values
- ✓ semicolon + decimal comma detected
- ✓ units line written into the names
- ✓ decimal comma values
- ✓ tab detected
- ✓ one column whose name has a space: not split (Size (nm))
- ✓ a unit in the name stays in it (and is read from it)
- ✓ a column found by its name without the unit (older projects)
- ✓ integer CSV without header: two columns, not decimal commas
- ✓ columns without names: A, B
- ✓ whitespace-separated
- ✓ quoted field with a comma
- ✓ NaN and empty cells are missing values, not text
- ✓ formula
- ✓ formula error reported
- ✓ stats: N, missing
- ✓ stats: mean, sum
- ✓ stats: SD (N − 1)
- ✓ stats: SE
- ✓ stats: SD with a large offset
- ✓ nice range 400–800
- ✓ linear ticks
- ✓ linear labels
- ✓ log labels: one way for the whole axis; powers when a decade is past 0.01 … 1000 (10^{−3} 10^{−2} 10^{−1} 10^{0} 10^{1})
- ✓ log labels: plain numbers from 0.01 to 1000, else all powers (not 10, 100, 10³): 0.1 1 10 100 1000 \| 10^{1} 10^{2} 10^{3} 10^{4}
- ✓ small numbers as ×10ⁿ (0 1×10^{−6} 2×10^{−6})
- ✓ common factor ×10³
- ✓ percent labels
- ✓ decimals, factor, suffix
- ✓ minus sign
- ✓ ticks at chosen values
- ✓ exactly N ticks
- ✓ ticks every 5
- ✓ ticks every 2 from 11
- ✓ older projects: a step alone still places the ticks
- ✓ axis breaks read
- ✓ a value inside a break
- ✓ the axes' limits as drawn: X 0 – 4 every 1, Y 0 – 1; a start typed kept (0.5); a log axis without a step
- ✓ Plot: a page of 85 mm with its frame and legend
- ✓ Plot: automatic margins (12.8 4.2 84.8 81.4)
- ✓ Plot: a side without numbers and title takes less room
- ✓ Plot: a frame placed by hand stays
- ✓ Canvas: two cells side by side
- ✓ Canvas: every frame placed again in its cell
- ✓ Canvas: shared X, one range
- ✓ Canvas: shared Y, numbers on the outer panel only (the inner frame wider)
- ✓ Canvas: the frames of a row share their top and bottom
- ✓ Canvas: the Plots keep their sizes (175 × 65)
- ✓ Canvas: a Plot over two cells, rows added, a free Plot out of the grid
- ✓ Canvas: a Plot moved by hand (an inset) keeps its box
- ✓ Canvas stacked: the frames touch, heights 2:1:1 (44.96, 22.48, 22.48)
- ✓ Canvas stacked: left and right sides aligned, room above and below the stack
- ✓ Canvas stacked: one X range, its numbers on the bottom panel only
- ✓ Canvas stacked: ticks inward at the joints, the outer sides as they were
- ✓ Canvas stacked: a gap between the frames (3 mm)
- ✓ Canvas stacked side by side: frames touching, one Y, its numbers on the first panel
- ✓ Canvas: a Plot keeps its own border (width, line, corners) around its place
- ✓ Plot: an inset inside the frame, its frame within its box
- ✓ Canvas: the inset moves with its Plot, its axes not shared with the panels
- ✓ Canvas: a Plot placed by hand keeps its page background (white, or none when transparent); the grid cells none
- ✓ Plot: an inset on its Plot’s page background (transparent: none) unless one is chosen in Insets
- ✓ Canvas: column widths in proportion 2:1
- ✓ Canvas: one X and one Y title for all the panels (x, Signal)
- ✓ Canvas: one legend for all the panels (every curve once), at the right, the panels narrower
- ✓ Canvas: a Plot of two curves split into two panels (facets)
- ✓ Ticks: fewer numbers on a narrow frame (520 560; usual 520 530 540 550 560 570; step 6), as before on a usual one, a step asked kept
- ✓ automatic margins inside an area
- ✓ a curve style on every curve, colours kept
- ✓ an axes style keeps the axis titles
- ✓ legend entries: chosen order, hidden, own text, new ones after
- ✓ shape layers: bands and “under the curves” below the data
- ✓ a format-1 project opens (its empty Axes gone)
- ✓ format 3 → 4: Axes, legend, arrow and page in the Plot; the Canvas gone
- ✓ format 3 → 4: the Plot draws them
- ✓ format 3 → 4: two Plots of one Axes become one (curves appended, legend keys renamed)
- ✓ format 3 → 4: a Canvas grid of two Axes takes the two Plots (shared Y kept)
- ✓ worksheet: cells, a row left out, a row added, a header
- ✓ worksheet: the rows shown and their place in the file
- ✓ worksheet: a cell typed with a decimal comma
- ✓ Plot: curves from the columns of a dataset
- ✓ Kramers–Kronig, optical: n and k of an oscillator from R within 0.023 (1 to 8 eV), the same from wavelengths in nm (1.2e-14); its tails drawn dashed, the data's ends marked; general: ε₁ from ε₂ within 0.17, ε₂ from ε₁ within 0.21 (peak 20)
- ✓ Kramers–Kronig examples: the stable cell within ±0.45 %, the drifting one out to ±2.24 %; n, k from R within 0.042 of the true ones; ε₁ from ε₂ within 0.17
- ✓ microarray example: log2 R/G of the 18 spots over their rings within 0.049 of the ratios drawn; against the global background too (its net drifts by 8.0 along a row)
- ✓ group: ports from the crossing connections (2 in, 3 out)
- ✓ group: the same figure
- ✓ group: results of the nodes inside, under group/… ids
- ✓ ungroup: the graph and the figure back
- ✓ a group in a group: the same figure
- ✓ Split into columns ▸ auto, then Plot: 5 curves of 21 points (5: )
- ✓ Plot ▸ Colours: a colour map over the block values
- ✓ rows drawn: 22-42
- ✓ legend: coloured curves as one entry above 8 (11)
- ✓ Plot: two datasets on one port, the second's names made distinct ()
- ✓ designations: the curves of a quick plot
- ✓ worksheet: a designation kept on the column
- ✓ Columns: moved, renamed, designated, left out; find / replace and a prefix on the others; the names as a column
- ✓ Columns: the names from a row (taken out of the data)
- ✓ Columns: names kept different, a column not in the data said, a names row past the data
- ✓ Columns: several names at once on the columns listed / ticked / Y; a list of names in order, a suffix, a name by hand first
- ✓ Columns: a column on a port A; a column of its own at the end, placed, renamed, left out; not twice when copied
- ✓ Columns: a workbook on its input; the sheet it names
- ✓ Columns: every sheet of a workbook; the same settings for all, or each its own (S1:Signal \| S2:Signal,F \| S3:Signal; S1:Signal,A \| S2:Third,B \| S3:Signal,A)
- ✓ Columns: the names from a column (all the others; the column itself left out)
- ✓ Columns: the names from a column for a list of columns (more names than columns said), for the Y columns
- ✓ Columns: columns added; a formula of the columns, one of a column added above (and i), at the end
- ✓ Columns: a column renamed by hand or with a prefix; the formula still right, shown with the new names; typed with them, stored by the names in
- ✓ Columns: a formula by the letters of the list; kept by the column when it moves, mean(B) of a whole column, a [ being typed left alone
- ✓ Columns: a letter not in the list said, the letters of the columns still right
- ✓ Columns: the names from a column; a formula of the columns renamed still right
- ✓ Columns: an input {A} (one value) in a formula, mean([c]) of a whole column; one value in every row; a copy of an input column {B}
- ✓ Columns: a formula of columns left out of the data
- ✓ Columns: a formula of a missing column, of a bare name, unfinished; said, the column empty, the others go on
- ✓ Columns: a column added in place of another (that one left out), marked as added
- ✓ Columns: generated columns (evenly spaced, of i, random): as many rows as the data, the same numbers as Generate column with the same seed
- ✓ Columns: a column of an input (its own name), a copy of a column renamed
- ✓ tick labels: wrapped after N characters at the spaces (one long word kept; markup left alone)
- ✓ a turned text: its extent across a horizontal and a vertical axis
- ✓ worksheet: columns moved (the edits follow them)
- ✓ ±Y as 10 % of y
- ✓ a − error of its own
- ✓ rules: numbers, ranges, letters, names
- ✓ rules: all, left out, patterns
- ✓ rules: what is not there is reported
- ✓ rules: sheets by a pattern
- ✓ import: a workbook, the sheet shown on “dataset”
- ✓ import: a text sheet keeps the text settings (decimal comma)
- ✓ Extract column: a column of the sheet chosen
- ✓ Sheets to columns: the columns, in sheet order, named and designated
- ✓ Sheets to columns: a quick plot from its designations
- ✓ Sheets to columns: names kept different
- ✓ Sheets to columns simple: the sheets ticked, every column with its designation (one not taken)
- ✓ Sheets to columns simple: no sheet ticked; said
- ✓ manip: masked, unmasked, moved, scaled, deleted
- ✓ manip: the state of every input row
- ✓ manip: restore makes deleted or masked points normal again
- ✓ manip: a warning when the data have another number of rows
- ✓ manip: rows counted again after deletions
- ✓ mask: through Extract column and Math column
- ✓ mask: Statistics leaves the masked rows out
- ✓ mask: the masked points of a Plot curve
- ✓ Extract column: rows where x &gt; 0.55 (36,49,64,81), a list, a range of X; one value (first, last, mean 57.5, count; I where E = 0.3: 9); an older one value kept; none chosen said
- ✓ columns: a range of names (A1-A3)
- ✓ rows: ranges of row numbers with a break
- ✓ rows: a range of X values, a list
- ✓ rows: a rule of x and the columns; an unknown name reported
- ✓ rows: where conditions, all of them (x &gt; 450, a &lt; 6)
- ✓ rows: where any condition (x &lt; 450 or x &gt; 600); between (both ends, either order)
- ✓ rows: = and ≠; a condition without its value left aside
- ✓ rows: the conditions, or the formula when chosen (an older project: its formula)
- ✓ rows: the conditions written as a formula, the same rows (x &gt; 450 or (B &gt;= 2 and B &lt;= 5) or (not isnan(B)))
- ✓ rows: is one of (a in 2, 5, 9), said, as a formula (isin(B, 2, 5, 9) or x &gt; 600)
- ✓ rows: is one of with no values yet left aside
- ✓ rows: is empty / is not empty (a 0 is a value)
- ✓ statistics: percentiles and the confidence interval of the mean (1.9, 9.1, 3.3341 … 7.6659)
- ✓ rows: odd and even rows, a formula on top, the row number in a condition, row and % in formulas
- ✓ filter: split into parts (low, high, odd, the rest)
- ✓ Statistics on rows: mean and SD of every row chosen
- ✓ Statistics on rows: the dataset X, Mean (Y), SD (±Y) on the rows chosen
- ✓ Statistics on columns: of the columns chosen, on the rows of a rule; the table
- ✓ Statistics: a value of a column, a column of a dataset (port types)
- ✓ fit: Student t quantiles
- ✓ fit: a line (1.0833333368146485, 1.9833333326207232)
- ✓ fit: R²
- ✓ fit: a Gaussian from guessed starts
- ✓ fit: a formula of one’s own
- ✓ fit: fixed, a range of X, the band as ±Y
- ✓ fit: two peaks, numbered from the left
- ✓ fit: every run; a row per fit: its number, its block value (named as the blocks), range, X from / to, the parameters, the statistics
- ✓ fit: the curves of all runs as a dataset (an X, a fit and a band column each, with its run), no port per parameter (x (y · run = 1), fit (y · run = 1), confidence band (y · run = 1), x (y · run = 2), fit (y · run = 2), confidence band (y · run = 2), x (y · run = 3), fit (y · run = 3), confidence band (y · run = 3))
- ✓ fit: global, shared parameters common to the runs
- ✓ Extract column: a parameter as a column or one value (a row)
- ✓ fit: a masked point left out
- ✓ strong coupling: 23 runs fitted (worst R² 0.9874)
- ✓ strong coupling: Ω = 44.78 ± 0.30 nm
- ✓ rich text: two lines
- ✓ rich text: symbol and superscript
- ✓ rich text: subscript
- ✓ rich text: bold, size
- ✓ rich text: plain (the space after a command ends it)
- ✓ rich text: a real new line
- ✓ rich text: $…$ a formula, $$…$$ one drawn larger
- ✓ rich text: a $ with no formula (a price, an escaped \$, spaces inside) stays as it is
- ✓ rich text: a formula measured by its size once drawn (a guess before)
- ✓ rich text: a tall formula makes its line taller
- ✓ rich text: the math font follows the text's (sans, serif, LaTeX) or the choice (sans,sans,serif,sans,serif,sans,serif,sans)
- ✓ rich text: a figure laid out again with a formula's size once known, nothing else computed again (15.0 → 32.9)
- ✓ and, comparisons
- ✓ or, not
- ✓ if
- ✓ NaN constant, isnan
- ✓ round, mod
- ✓ a comparison with a missing value is missing
- ✓ row lists
- ✓ bad row list reported
- ✓ Math column: rules in order, the input's name kept (1, 204, 3, 208, 210, 6, 7, 8, 18, 20)
- ✓ Math column: max(A) of the whole column, max(A, 2) still row by row
- ✓ Math column: one value of whole columns (32.5)
- ✓ Math column: one value from a column row by row; said
- ✓ Math column: one value; a value port
- ✓ formulas: at(A, 3), the value of row 3 in every row
- ✓ formulas: at(A, n - 1), the row a formula of n
- ✓ formulas: first(A, between(B, 2, 3)), several rows said (2; first(A, between(B, 2, 3)): 5 rows match, the first used (row 2).)
- ✓ formulas: first with a condition of or; between either way round
- ✓ formulas: last(A, isin(B, 0)) (8)
- ✓ formulas: one row matching, nothing said
- ✓ formulas: mean, sum, count, median, sd of the rows where a condition is true
- ✓ formulas: minif, maxif; max(A, B) still row by row
- ✓ formulas: a condition with a function of the whole column in it
- ✓ formulas: no row matching, empty and said (count: 0, nothing said) (first(A, B &gt; 10): no row where B &gt; 10 (with a value of A).)
- ✓ formulas: at a row that is not there, empty and said
- ✓ formulas: a condition with an unknown name, said
- ✓ formulas: isin, between (either way round), row by row
- ✓ formulas: if with isin
- ✓ formulas: the wrong number of parts said (between, isin, randint, rand)
- ✓ rand: the same values computed again, others with another seed
- ✓ rand: between 0 and 1, mean 0.5
- ✓ rand(5, 10): between 5 and 10
- ✓ randint(1, 6): whole numbers 1 … 6, each about as often (995 1028 975 951 1008 1043)
- ✓ randn(10, 2): mean 10, SD 2 (9.991, 1.997)
- ✓ rand: two calls in a formula, two values
- ✓ rand: a row’s value does not depend on the rows computed before it
- ✓ Math column: rand() the same computed again; a new seed or another node, other values
- ✓ Columns: first([x], [k] == 5), said; two rand() columns differ (“y”: first([x], [k] == 5): 2 rows match, the first used (row 2).)
- ✓ ƒ Functions: every function described (missing: none)
- ✓ ƒ Functions: every example computes (all)
- ✓ Set column values: the formula kept by the columns' keys, shown with their letters ([@o0] * [@o1] * first([@o0], [@o2] == 5))
- ✓ Set column values: D = A * B * first(A, C == 5) (20,80,180,320; Column D: first(A, C == 5): 2 rows match, the first used (row 2).)
- ✓ Set column values: a cell of B changed, the column computed again
- ✓ Set column values: on the rows where z &gt; 4, the others kept or emptied
- ✓ Set column values: on the rows where z is one of 0, 9
- ✓ Set column values: a formula of another formula column, computed after it
- ✓ Set column values: two formulas needing one another, said (Column D: its formula and others need one another in a loop; left empty.)
- ✓ Set column values: a formula of its own column, said
- ✓ Set column values: an unknown name, said
- ✓ Set column values: a column moved, the formula follows it
- ✓ Set column values: a formula of an input's column (x, y, z, D, g)
- ✓ Set column values: rand() the same computed again; another column or a new seed, other values
- ✓ Import: missing values empty (N/A, -999), 1.234,5 with a thousands point, a footer of 2 lines left out
- ✓ Import: a quoted 1,234.5 with a thousands comma
- ✓ format 10 → 11: the three nodes converted, the ports of Add column moved to A, B
- ✓ format 10 → 11: Add column → Combine side by side (after p, renamed)
- ✓ format 10 → 11: Edit rows → Math column, the other rows emptied, v as before (NaN,204,NaN,208,210,NaN,NaN,NaN,18,20)
- ✓ format 10 → 11: Plot matrix → Contour with a matrix, drawn the same
- ✓ format 10 → 11: converting twice changes nothing more (templates)
- ✓ Plot: curve 2 takes the X of curve 1 (same rows)
- ✓ Plot: curve 3 (other rows, no X) reported
- ✓ Plot: the next curve takes the next colour
- ✓ format 2 → 3: a parameter port becomes an Extract column (one value) of the parameters table
- ✓ example “UV-Vis spectrum: mean ± SD of three measurements” has no errors
- ✓ example “UV-Vis spectrum: mean ± SD of three measurements” draws curves
- ✓ example “UV-Vis spectrum: mean ± SD of three measurements” saves and opens
- ✓ example “Generated data: a damped oscillation and noisy samples” has no errors
- ✓ example “Generated data: a damped oscillation and noisy samples” draws curves
- ✓ example “Generated data: a damped oscillation and noisy samples” saves and opens
- ✓ example “Gold n, k: two blocks in one file (Split into columns)” has no errors
- ✓ example “Gold n, k: two blocks in one file (Split into columns)” draws curves
- ✓ example “Gold n, k: two blocks in one file (Split into columns)” saves and opens
- ✓ example “Four runs in a workbook: Sheets to columns” has no errors
- ✓ example “Four runs in a workbook: Sheets to columns” draws curves
- ✓ example “Four runs in a workbook: Sheets to columns” saves and opens
- ✓ example “Rows to columns: a voltage sweep turned into spectra” has no errors
- ✓ example “Rows to columns: a voltage sweep turned into spectra” draws curves
- ✓ example “Rows to columns: a voltage sweep turned into spectra” saves and opens
- ✓ example “Batch: the peak of every spectrum in a folder” has no errors
- ✓ example “Batch: the peak of every spectrum in a folder” draws curves
- ✓ example “Batch: the peak of every spectrum in a folder” saves and opens
- ✓ example “Cleaning a sensor log: order, repeats, gaps, spikes” has no errors
- ✓ example “Cleaning a sensor log: order, repeats, gaps, spikes” draws curves
- ✓ example “Cleaning a sensor log: order, repeats, gaps, spikes” saves and opens
- ✓ example “Replicate scans: mean ± SD on a common X” has no errors
- ✓ example “Replicate scans: mean ± SD on a common X” draws curves
- ✓ example “Replicate scans: mean ± SD on a common X” saves and opens
- ✓ example “Difference spectrum: sample minus reference” has no errors
- ✓ example “Difference spectrum: sample minus reference” draws curves
- ✓ example “Difference spectrum: sample minus reference” saves and opens
- ✓ example “Workbook formulas: a blank subtracted, the unknowns found” has no errors
- ✓ example “Workbook formulas: a blank subtracted, the unknowns found” draws curves
- ✓ example “Workbook formulas: a blank subtracted, the unknowns found” saves and opens
- ✓ example “Digitizer: values read off the image of a graph” has no errors
- ✓ example “Digitizer: values read off the image of a graph” draws curves
- ✓ example “Digitizer: values read off the image of a graph” saves and opens
- ✓ example “Two panels: colour by value, colour bar, spikes removed” has no errors
- ✓ example “Two panels: colour by value, colour bar, spikes removed” draws curves
- ✓ example “Two panels: colour by value, colour bar, spikes removed” saves and opens
- ✓ example “Three Y axes and a broken X axis” has no errors
- ✓ example “Three Y axes and a broken X axis” draws curves
- ✓ example “Three Y axes and a broken X axis” saves and opens
- ✓ example “Publication figure: an inset and annotations over it” has no errors
- ✓ example “Publication figure: an inset and annotations over it” draws curves
- ✓ example “Publication figure: an inset and annotations over it” saves and opens
- ✓ example “Organizing a large graph: frames, a group, a reroute” has no errors
- ✓ example “Organizing a large graph: frames, a group, a reroute” draws curves
- ✓ example “Organizing a large graph: frames, a group, a reroute” saves and opens
- ✓ example “Grouped bars with their values” has no errors
- ✓ example “Grouped bars with their values” draws curves
- ✓ example “Grouped bars with their values” saves and opens
- ✓ example “Stacked and 100 % stacked bars” has no errors
- ✓ example “Stacked and 100 % stacked bars” draws curves
- ✓ example “Stacked and 100 % stacked bars” saves and opens
- ✓ example “Horizontal bars with errors” has no errors
- ✓ example “Horizontal bars with errors” draws curves
- ✓ example “Horizontal bars with errors” saves and opens
- ✓ example “Bars from raw values: mean ± SD with the points” has no errors
- ✓ example “Bars from raw values: mean ± SD with the points” draws curves
- ✓ example “Bars from raw values: mean ± SD with the points” saves and opens
- ✓ example “Floating columns: a range per month” has no errors
- ✓ example “Floating columns: a range per month” draws curves
- ✓ example “Floating columns: a range per month” saves and opens
- ✓ example “Waterfall: from the grants to the balance” has no errors
- ✓ example “Waterfall: from the grants to the balance” draws curves
- ✓ example “Waterfall: from the grants to the balance” saves and opens
- ✓ example “Significance brackets on bars and boxes” has no errors
- ✓ example “Significance brackets on bars and boxes” draws curves
- ✓ example “Significance brackets on bars and boxes” saves and opens
- ✓ example “Box plots: notched, horizontal” has no errors
- ✓ example “Box plots: notched, horizontal” draws curves
- ✓ example “Box plots: notched, horizontal” saves and opens
- ✓ example “Box plot vs violin plot” has no errors
- ✓ example “Box plot vs violin plot” draws curves
- ✓ example “Box plot vs violin plot” saves and opens
- ✓ example “Grouped boxes from indexed data, with the values” has no errors
- ✓ example “Grouped boxes from indexed data, with the values” draws curves
- ✓ example “Grouped boxes from indexed data, with the values” saves and opens
- ✓ example “Half violins and raincloud” has no errors
- ✓ example “Half violins and raincloud” draws curves
- ✓ example “Half violins and raincloud” saves and opens
- ✓ example “Split violins: two subgroups” has no errors
- ✓ example “Split violins: two subgroups” draws curves
- ✓ example “Split violins: two subgroups” saves and opens
- ✓ example “Histogram with two-mode fits” has no errors
- ✓ example “Histogram with two-mode fits” draws curves
- ✓ example “Histogram with two-mode fits” saves and opens
- ✓ example “Q-Q and normal probability plots” has no errors
- ✓ example “Q-Q and normal probability plots” draws curves
- ✓ example “Q-Q and normal probability plots” saves and opens
- ✓ example “ECDF of two groups, bands and 1 − F” has no errors
- ✓ example “ECDF of two groups, bands and 1 − F” draws curves
- ✓ example “ECDF of two groups, bands and 1 − F” saves and opens
- ✓ example “Weibull probability plot of failure times” has no errors
- ✓ example “Weibull probability plot of failure times” draws curves
- ✓ example “Weibull probability plot of failure times” saves and opens
- ✓ example “Bland–Altman: two devices” has no errors
- ✓ example “Bland–Altman: two devices” draws curves
- ✓ example “Bland–Altman: two devices” saves and opens
- ✓ example “Pie, doughnut and nested rings” has no errors
- ✓ example “Pie, doughnut and nested rings” draws curves
- ✓ example “Pie, doughnut and nested rings” saves and opens
- ✓ example “Smith chart: an antenna before and after matching” has no errors
- ✓ example “Smith chart: an antenna before and after matching” draws curves
- ✓ example “Smith chart: an antenna before and after matching” saves and opens
- ✓ example “Polar: antenna pattern, wind rose, radar” has no errors
- ✓ example “Polar: antenna pattern, wind rose, radar” draws curves
- ✓ example “Polar: antenna pattern, wind rose, radar” saves and opens
- ✓ example “Scatter matrix of four measures, three species” has no errors
- ✓ example “Scatter matrix of four measures, three species” draws curves
- ✓ example “Scatter matrix of four measures, three species” saves and opens
- ✓ example “Ternary: soil texture, a diffusion path” has no errors
- ✓ example “Ternary: soil texture, a diffusion path” draws curves
- ✓ example “Ternary: soil texture, a diffusion path” saves and opens
- ✓ example “Waterfall: reflectance vs thickness, a PL ridgeline” has no errors
- ✓ example “Waterfall: reflectance vs thickness, a PL ridgeline” draws curves
- ✓ example “Waterfall: reflectance vs thickness, a PL ridgeline” saves and opens
- ✓ example “Laboratory: method comparison, agreement, distributions, power” has no errors
- ✓ example “Laboratory: method comparison, agreement, distributions, power” draws curves
- ✓ example “Laboratory: method comparison, agreement, distributions, power” saves and opens
- ✓ example “Clinical study: survival, ROC, contingency, regression” has no errors
- ✓ example “Clinical study: survival, ROC, contingency, regression” draws curves
- ✓ example “Clinical study: survival, ROC, contingency, regression” saves and opens
- ✓ example “Drug study: ANOVA, t-test, nonparametric, correlation” has no errors
- ✓ example “Drug study: ANOVA, t-test, nonparametric, correlation” draws curves
- ✓ example “Drug study: ANOVA, t-test, nonparametric, correlation” saves and opens
- ✓ example “Regression, PCA, power and a control chart” has no errors
- ✓ example “Regression, PCA, power and a control chart” draws curves
- ✓ example “Regression, PCA, power and a control chart” saves and opens
- ✓ example “Calibration: unknowns, LOD and LOQ” has no errors
- ✓ example “Calibration: unknowns, LOD and LOQ” draws curves
- ✓ example “Calibration: unknowns, LOD and LOQ” saves and opens
- ✓ example “Kinetics and lifetimes: rate equations, reconvolution” has no errors
- ✓ example “Kinetics and lifetimes: rate equations, reconvolution” draws curves
- ✓ example “Kinetics and lifetimes: rate equations, reconvolution” saves and opens
- ✓ example “Overlapping peaks: peak deconvolution” has no errors
- ✓ example “Overlapping peaks: peak deconvolution” draws curves
- ✓ example “Overlapping peaks: peak deconvolution” saves and opens
- ✓ example “XPS: Shirley background and a spin–orbit doublet” has no errors
- ✓ example “XPS: Shirley background and a spin–orbit doublet” draws curves
- ✓ example “XPS: Shirley background and a spin–orbit doublet” saves and opens
- ✓ example “Raman on a fluorescence background: baselines from the data” has no errors
- ✓ example “Raman on a fluorescence background: baselines from the data” draws curves
- ✓ example “Raman on a fluorescence background: baselines from the data” saves and opens
- ✓ example “Strong coupling: fit of every run, then the anticrossing” has no errors
- ✓ example “Strong coupling: fit of every run, then the anticrossing” draws curves
- ✓ example “Strong coupling: fit of every run, then the anticrossing” saves and opens
- ✓ example “Kramers–Kronig (optical): n and k from a reflectance” has no errors
- ✓ example “Kramers–Kronig (optical): n and k from a reflectance” draws curves
- ✓ example “Kramers–Kronig (optical): n and k from a reflectance” saves and opens
- ✓ example “Kramers–Kronig (general): ε₁ from ε₂” has no errors
- ✓ example “Kramers–Kronig (general): ε₁ from ε₂” draws curves
- ✓ example “Kramers–Kronig (general): ε₁ from ε₂” saves and opens
- ✓ example “Signal processing: smooth, FFT, deconvolution, interpolation” has no errors
- ✓ example “Signal processing: smooth, FFT, deconvolution, interpolation” draws curves
- ✓ example “Signal processing: smooth, FFT, deconvolution, interpolation” saves and opens
- ✓ example “Signals: PSD, a Butterworth filter, the Allan deviation” has no errors
- ✓ example “Signals: PSD, a Butterworth filter, the Allan deviation” draws curves
- ✓ example “Signals: PSD, a Butterworth filter, the Allan deviation” saves and opens
- ✓ example “Signals: wavelets (transform, coherence, multiresolution, denoising, peaks)” has no errors
- ✓ example “Signals: wavelets (transform, coherence, multiresolution, denoising, peaks)” draws curves
- ✓ example “Signals: wavelets (transform, coherence, multiresolution, denoising, peaks)” saves and opens
- ✓ example “Signals: uneven periods, harmonics, mains hum (FFT)” has no errors
- ✓ example “Signals: uneven periods, harmonics, mains hum (FFT)” draws curves
- ✓ example “Signals: uneven periods, harmonics, mains hum (FFT)” saves and opens
- ✓ example “Signal generator: a chirp, Fano and coupled oscillators, C–V curves” has no errors
- ✓ example “Signal generator: a chirp, Fano and coupled oscillators, C–V curves” draws curves
- ✓ example “Signal generator: a chirp, Fano and coupled oscillators, C–V curves” saves and opens
- ✓ example “Signals: a chirp taken out by the fractional Fourier transform” has no errors
- ✓ example “Signals: a chirp taken out by the fractional Fourier transform” draws curves
- ✓ example “Signals: a chirp taken out by the fractional Fourier transform” saves and opens
- ✓ example “Signals: baseline, waveform, steps, event averaging” has no errors
- ✓ example “Signals: baseline, waveform, steps, event averaging” draws curves
- ✓ example “Signals: baseline, waveform, steps, event averaging” saves and opens
- ✓ example “Equivalent circuit (EIS): R(RQ)W fitted, two points left out” has no errors
- ✓ example “Equivalent circuit (EIS): R(RQ)W fitted, two points left out” draws curves
- ✓ example “Equivalent circuit (EIS): R(RQ)W fitted, two points left out” saves and opens
- ✓ example “Impedance: an equivalent circuit fitted, a Nyquist plot” has no errors
- ✓ example “Impedance: an equivalent circuit fitted, a Nyquist plot” draws curves
- ✓ example “Impedance: an equivalent circuit fitted, a Nyquist plot” saves and opens
- ✓ example “Kramers–Kronig (impedance): a stable cell passes, a drifting one fails” has no errors
- ✓ example “Kramers–Kronig (impedance): a stable cell passes, a drifting one fails” draws curves
- ✓ example “Kramers–Kronig (impedance): a stable cell passes, a drifting one fails” saves and opens
- ✓ example “Electrochemistry: semi-integral (convolution) voltammetry” has no errors
- ✓ example “Electrochemistry: semi-integral (convolution) voltammetry” draws curves
- ✓ example “Electrochemistry: semi-integral (convolution) voltammetry” saves and opens
- ✓ example “Cyclic voltammogram: area between the branches” has no errors
- ✓ example “Cyclic voltammogram: area between the branches” draws curves
- ✓ example “Cyclic voltammogram: area between the branches” saves and opens
- ✓ example “Mott–Schottky: an n-type TiO₂ electrode” has no errors
- ✓ example “Mott–Schottky: an n-type TiO₂ electrode” draws curves
- ✓ example “Mott–Schottky: an n-type TiO₂ electrode” saves and opens
- ✓ example “Double layer: Gouy–Chapman and Gouy–Chapman–Stern” has no errors
- ✓ example “Double layer: Gouy–Chapman and Gouy–Chapman–Stern” draws curves
- ✓ example “Double layer: Gouy–Chapman and Gouy–Chapman–Stern” saves and opens
- ✓ example “Nanocubes: found like one, their side and orientation” has no errors
- ✓ example “Nanocubes: found like one, their side and orientation” draws curves
- ✓ example “Nanocubes: found like one, their side and orientation” saves and opens
- ✓ example “AFM: levelling, roughness, PSD and a step height” has no errors
- ✓ example “AFM: levelling, roughness, PSD and a step height” draws curves
- ✓ example “AFM: levelling, roughness, PSD and a step height” saves and opens
- ✓ example “Gold by TEM: lattice spacing, Bragg filter, diffraction rings” has no errors
- ✓ example “Gold by TEM: lattice spacing, Bragg filter, diffraction rings” draws curves
- ✓ example “Gold by TEM: lattice spacing, Bragg filter, diffraction rings” saves and opens
- ✓ example “Nanoparticle monolayer: neighbours, order and sizes” has no errors
- ✓ example “Nanoparticle monolayer: neighbours, order and sizes” draws curves
- ✓ example “Nanoparticle monolayer: neighbours, order and sizes” saves and opens
- ✓ example “Nanoporous gold: ligaments from the skeleton” has no errors
- ✓ example “Nanoporous gold: ligaments from the skeleton” draws curves
- ✓ example “Nanoporous gold: ligaments from the skeleton” saves and opens
- ✓ example “Particles: clusters cut apart, shapes named, their sizes” has no errors
- ✓ example “Particles: clusters cut apart, shapes named, their sizes” draws curves
- ✓ example “Particles: clusters cut apart, shapes named, their sizes” saves and opens
- ✓ example “Trainable classifier: textured particles a threshold misses” has no errors
- ✓ example “Trainable classifier: textured particles a threshold misses” draws curves
- ✓ example “Trainable classifier: textured particles a threshold misses” saves and opens
- ✓ example “Microarray spots: signal over a ring of background, red / green ratio” has no errors
- ✓ example “Microarray spots: signal over a ring of background, red / green ratio” draws curves
- ✓ example “Microarray spots: signal over a ring of background, red / green ratio” saves and opens
- ✓ example “Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)” has no errors
- ✓ example “Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)” draws curves
- ✓ example “Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)” saves and opens
- ✓ example “Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy” has no errors
- ✓ example “Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy” draws curves
- ✓ example “Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy” saves and opens
- ✓ example “Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels” has no errors
- ✓ example “Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels” draws curves
- ✓ example “Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels” saves and opens
- ✓ example “CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation” has no errors
- ✓ example “CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation” draws curves
- ✓ example “CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation” saves and opens
- ✓ example “Matrices: inverse, eigenvalues, SVD, a map as a matrix” has no errors
- ✓ example “Matrices: inverse, eigenvalues, SVD, a map as a matrix” draws curves
- ✓ example “Matrices: inverse, eigenvalues, SVD, a map as a matrix” saves and opens
- ✓ example “Contour and heatmap: a reflectance map, scattered points” has no errors
- ✓ example “Contour and heatmap: a reflectance map, scattered points” draws curves
- ✓ example “Contour and heatmap: a reflectance map, scattered points” saves and opens
- ✓ example “3D: a surface, bars, clusters, a waterfall” has no errors
- ✓ example “3D: a surface, bars, clusters, a waterfall” draws curves
- ✓ example “3D: a surface, bars, clusters, a waterfall” saves and opens
- ✓ example “3D stacked maps: RSMs of five samples” has no errors
- ✓ example “3D stacked maps: RSMs of five samples” draws curves
- ✓ example “3D stacked maps: RSMs of five samples” saves and opens
- ✓ example “C–V: a MOS capacitor at low and high frequency (CV_ideal.m)” has no errors
- ✓ example “C–V: a MOS capacitor at low and high frequency (CV_ideal.m)” draws curves
- ✓ example “C–V: a MOS capacitor at low and high frequency (CV_ideal.m)” saves and opens
- ✓ example “C–V: interface traps on Si, low and high frequency” has no errors
- ✓ example “C–V: interface traps on Si, low and high frequency” draws curves
- ✓ example “C–V: interface traps on Si, low and high frequency” saves and opens
- ✓ example “C–V: p–n junctions, abrupt and linearly graded” has no errors
- ✓ example “C–V: p–n junctions, abrupt and linearly graded” draws curves
- ✓ example “C–V: p–n junctions, abrupt and linearly graded” saves and opens
- ✓ example “C–V: a Schottky diode on 4H-SiC at three temperatures” has no errors
- ✓ example “C–V: a Schottky diode on 4H-SiC at three temperatures” draws curves
- ✓ example “C–V: a Schottky diode on 4H-SiC at three temperatures” saves and opens
- ✓ example “C–V: varactors, the SPICE junction (abrupt and hyperabrupt)” has no errors
- ✓ example “C–V: varactors, the SPICE junction (abrupt and hyperabrupt)” draws curves
- ✓ example “C–V: varactors, the SPICE junction (abrupt and hyperabrupt)” saves and opens
- ✓ example “C–V: a MIM capacitor and its voltage coefficients” has no errors
- ✓ example “C–V: a MIM capacitor and its voltage coefficients” draws curves
- ✓ example “C–V: a MIM capacitor and its voltage coefficients” saves and opens
- ✓ example “C–V: a ferroelectric capacitor, its butterfly and loop” has no errors
- ✓ example “C–V: a ferroelectric capacitor, its butterfly and loop” draws curves
- ✓ example “C–V: a ferroelectric capacitor, its butterfly and loop” saves and opens
- ✓ example: mean of the replicates
- ✓ example: SD of the replicates
- ✓ example: 61 wavelengths, 400–700 nm
- ✓ legend box: older looks as boxes, a gradient fill, a soft shadow ([{"line":true,"radius":0,"fill":"#ffffff","fillOpacity":1,"shadow":{"dx":1.5,"dy":1.5,"blur":0,"color":"#000000","opacity":0.35}},{"line":true,"radius":0,"fill":"#ffffff","fillOpacity":1,"grad":{"grad":"radial"},"shadow":{"dx":1.5,"dy":1.5,"blur":2,"color":"#000000","opacity":0.3}}])
- ✓ page: its gradient in the figure (none on a transparent page)
- ✓ split: wl, n / wl, k → wl, n, k (the second block named by its header)
- ✓ split: 49 rows each, k last = 13.78, the same wl
- ✓ split: designations X, Y, Y
- ✓ split: X of every block (wl, n, wl_2, k), own names
- ✓ split: where X starts again (the text line left out)
- ✓ split: a sweep (auto: X starts again), named by the constant column
- ✓ split: block values = the swept parameter
- ✓ split: by a column
- ✓ split: auto by a column of labels designated X (X: the first column with numbers)
- ✓ split: auto by a column of labels beside X
- ✓ labels in runs: each label in one run, two labels or more, no numbers
- ✓ split: only X → a message
- ✓ split: workbook input; reads from chosen sheet
- ✓ workbook: a sheet of the input taken out, listed to show it again (Sheet2)
- ✓ split: an older node's names kept (a,b,b_2); a block named in the node (a,first run,b · 2)
- ✓ split ▸ cycles from where the scan started: 0 → 1 → −1 → 0, twice, both whole (1-41 41-81)
- ✓ split ▸ cycles from every upper turn: the start and the end not whole (1-11* 11-51 51-81*)
- ✓ split ▸ cycles from every lower turn (1-31* 31-71 71-81*)
- ✓ split ▸ cycles from where E crosses 0.5 going down (1-16* 16-56 56-81*)
- ✓ split ▸ cycles from a value: no value → a message
- ✓ split ▸ cycles: the pieces not whole left out, or joined to the cycle next to them
- ✓ split ▸ cycles cut into their ways up and down (1-11 11-31 31-41 41-51 51-71 71-81)
- ✓ split ▸ where X changes direction: the first and last segments not whole, left out
- ✓ split ▸ From: the cycles of E while X is the time (1-41 41-81)
- ✓ split ▸ where a column jumps: automatic, or by more than 4.5 (1-3 4-6 7-8; 1-3 4-8)
- ✓ split ▸ jump in a sweep: more than 5 × the usual step (1 → 5)
- ✓ split ▸ Keep: 2:end, !1, !last, first, a list
- ✓ split ▸ Keep: the blocks left out keep their numbers
- ✓ split ▸ Rows: only the rows used are cut
- ✓ split ▸ cuts by hand: added (shared point), taken away
- ✓ split ▸ cuts by hand: a warning when the table changed; the graph tells them from the rule’s
- ✓ split ▸ Then: by run, then the cycles in each (I (A) · run = 1 · cycle 1,I (A) · run = 1 · cycle 2,I (A) · run = 2 · cycle 1,I (A) · run = 2 · cycle 2)
- ✓ split ▸ the long table: block, cycle, direction (the shared point in the later block)
- ✓ combine: after
- ✓ combine: before
- ✓ combine: inserted after row 1
- ✓ combine: interleaved
- ✓ combine: sorted by X (stable)
- ✓ combine: sorted by X, same X → mean
- ✓ combine: columns by name, missing → empty
- ✓ combine: source of every row
- ✓ Combine columns node: two columns → one column of 5 rows
- ✓ note: its size saved when resized
- ✓ format 4 → 5: units written into the names
- ✓ workbook: a sheet kept as text and read back
- ✓ workbook: two sheets, typed cells, the sheet shown on “dataset”
- ✓ workbook: a dataset on input A, a read-only sheet passed on
- ✓ workbook: a designation given on a sheet of the inputs
- ✓ fit: ranges per run (slopes 10, 20, 30)
- ✓ fit: a run without its own ranges takes the common ones; an empty end is open
- ✓ derivative of x²: 2x (central)
- ✓ second derivative of x²: 2
- ✓ Savitzky–Golay derivative of a cubic (degree 3): exact, ends included
- ✓ integral of sin over [0, π] = 2
- ✓ integral of sin over [0, 2π]: 0 signed, 4 absolute
- ✓ integral over a line between the ends: a straight line gives 0
- ✓ Integrate node: regions separate (from 0 in each), empty outside, total area
- ✓ Integrate node: the curve under the graph breaks between the regions
- ✓ Integrate node: regions combined; the table of areas
- ✓ Integrate node: the ranges named range 1, range 2 in the table of areas
- ✓ baseline points: straight, flat outside
- ✓ baseline points: a natural spline through the points
- ✓ Integrate node: over a baseline of points (2 − 1 over 0 … 10 = 10)
- ✓ Differentiate node: X, Y, dY/dX
- ✓ fit: every designated curve a run (4), the ranges of Run 2 (6 of 31 points)
- ✓ value ± error with the digits of the error
- ✓ split: the cycles of a scan that goes and comes back
- ✓ CV: the area between going up and coming back, the second piece as the baseline (1; ), hatched
- ✓ area between curves: absolute vs signed across a crossing
- ✓ baseline at the lowest point: nothing subtracted below 0
- ✓ zoom: the frame under the mouse, every Y axis of it (left, right, Y3)
- ✓ zoom: new limits on the bottom and the right axis, the others and the breaks kept
- ✓ zoom: Rescale = automatic limits again
- ✓ zoom: a view halved around a point, only X (Shift)
- ✓ zoom out: every axis widened 1.6 times on the page around its middle (an axis with a break too)
- ✓ split into columns: the cycles of a scan, aligned on one X (the closing point in both cycles)
- ✓ pick: the values, a list or start:step:end
- ✓ pick: at X (linear), beyond: nothing / extrapolated / the end
- ✓ pick: at Y = 1 → x = 0.5
- ✓ pick: which crossing; all (2), first (0.5), last (1.5)
- ✓ pick: spline at X, the maximum refined by a parabola
- ✓ pick: rows where a condition holds; the maximum between limits
- ✓ pick: at E = 0.5 on every segment, a row per point against the segment (segment,pick,at,row,X,Y; )
- ✓ pick: a row per Y column, a column per point (segment,Y @ x = 0.5)
- ✓ pick: the other columns; none, all, a list (run,pick,at,row,x,y \| run,pick,at,row,x,y,z,w \| run,pick,at,row,x,y,w)
- ✓ pick, extract: a workbook, the sheet chosen (0.5/1 \| 5/10)
- ✓ pick: rules at X and at Y produce separate sheets in workbook
- ✓ pick: default out emits active sheet (at X)
- ✓ pick: at Y sheet contains crossing X value
- ✓ pick: extract connected to book port can read from at Y sheet
- ✓ Split into columns: the sheet of a workbook chosen (else the first)
- ✓ pick: sheetOut: 1 switches active dataset output to at Y
- ✓ pick: sheetsMode one keeps all points in single table
- ✓ Integrate: the baseline out (X and its values)
- ✓ example: the cycles coloured by the cycle, the area between the branches, the picked points
- ✓ format 5 → 6: Statistics on rows → Statistics ▸ On rows
- ✓ Statistics ▸ On rows: its ports
- ✓ format 6 → 7: the splits removed ()
- ✓ format 6 → 7: no group port; the fit curves on the dataset port
- ✓ a Plot curve’s data: a dataset (X, Y designated), fitted
- ✓ the residuals: a dataset, drawn from a Plot curve’s data port
- ✓ Split into columns: the dataset out and the long table
- ✓ format 7 → 8: no block values, no series ()
- ✓ fit per range: a fit of each range (y · range 1, y · range 2)
- ✓ fit per range: a row per range in the parameters; each curve over its range only
- ✓ fit per range off: one fit of the points of both ranges
- ✓ Workbook: inputs side by side on the first sheet, another on a sheet of its own (Sheet1,all; )
- ✓ Workbook: the inputs at the right of the first sheet's own table (A,x; mixed)
- ✓ Workbook: its inputs take columns, datasets, workbooks
- ✓ format 8 → 9: the Workbook's view input becomes A (inputs)
- ✓ Workbook: the inputs' columns hidden and moved, one of its own after them (y,A; i:y,o0)
- ✓ worksheet: a row and a column inserted between (C=NaN NaN NaN; a=1 9 2; b=3 NaN 4)
- ✓ format 11 → 12: a Workbook's inputs keep their sheet “inputs” (Sheet1,inputs,more)
- ✓ peaks: fitted only after Run analysis, again after a change (never, fitted, changed)
- ✓ peaks: placed by regions; at their maxima, kept in them (30.017266945004074, 56.921705870836675)
- ✓ regionPeak: the extremum, refined; none outside
- ✓ peaks: the maxima found (a bump that hardly stands out left to “shoulders”) (30,55.25)
- ✓ peaks: the shoulder found from the second derivative (30,55.25,61.75)
- ✓ peaks: fitted together; the overlapping ones separated (30,55,61)
- ✓ peaks: the areas (a Lorentzian: A·π·w/2) and their %
- ✓ peaks: out; the data, the baseline, every peak, the envelope (x,y,baseline,peak 1,peak 2,peak 3,envelope)
- ✓ peaks: subtracted; every peak from 0
- ✓ peaks: measured on the data (no fit), over a fixed baseline (8.777395817095854)
- ✓ example: overlapping peaks separated (1350.0,1580.3,1625.3)
- ✓ format 9 → 10: Group → – ()
- ✓ Peak fit style: data dots, baseline dashed, peaks filled down to the baseline, the envelope black
- ✓ Plot: a hidden curve; out of the legend, still there to fill to
- ✓ import: comment lines left out wherever they are, the names from the last one (Freq, GHz\|Re (S11)\|Im (S11) · x\|y)
- ✓ import: comments after the data; an older project (no comment options) read as before
- ✓ import: names with spaces kept whole (Time (s)\|Signal (mV))
- ✓ Touchstone: 2 ports, real / imaginary, the order S11 S21 S12 S22, dB and phase (Frequency (GHz) \| Re S11 \| Im S11 \| S11 (dB) \| ∠S11 (°) \| Re S21 \| Im S21 \| S21 (dB) \| ∠S21 (°) \| Re S12 \| Im S12 \| S12 (dB) \| ∠S12 (°) \| Re S22 \| Im S22 \| S22 (dB) \| ∠S22 (°))
- ✓ Touchstone: 1 port, magnitude / angle, its dB and parts
- ✓ Touchstone version 2: its keywords, the order 12_21
- ✓ Touchstone: 4 ports, a frequency over several lines, row by row
- ✓ Touchstone: the noise parameters after the data left out, said
- ✓ import: Touchstone found by itself, a table when asked, a table for older projects
- ✓ time: dates (ISO, dotted, slashes either way), durations read from text
- ✓ time: calendar ticks every two months, labels written as asked (Apr 2024 \| Jul 2024 \| Oct 2024)
- ✓ scales: symlog through 0 (-1000 -100 -10 -1 0 1 10 100 1000), logit, log base 2, a category axis' ends
- ✓ axis values: categories in order, sorted, listed; points spread around their place; dates; numbers
- ✓ 1D plot: names on X, curves stacked (as % too), joined at every X (x,y,z)
- ✓ fields: points counted (all of them), their density (integral 0.999), arrows (120) and streamlines (110) of a rotation
- ✓ truncated normal: μ and σ from the values cut to a range (5.0005960082606595, 0.9995345821777495)
- ✓ histogram: each peak fitted in its range, both together (0.003 1.004 \| 8.000 1.502 \| -0.000 1.003)
- ✓ histogram: a fit per range (0.003, 8.001)
- ✓ histogram: a fit's range in its legend entry; where several peaks start (Normal (-3.5 – 3.5) / Gaussian (4 – 14) / 2 Gaussians (-3.5 – 3.5, 4 – 14))
- ✓ bracket: its base and the side of its legs (over x, beside y, free, flipped)
- ✓ bracket: square legs of their own lengths; a curly brace
- ✓ bracket: the text beyond it, along it and readable, or level ([{"x":30,"y":18,"rotate":0,"anchor":"middle","valign":"bottom"},{"x":12,"y":50,"rotate":90,"anchor":"middle","valign":"bottom"},{"x":12,"y":50,"rotate":0,"anchor":"start","valign":"middle"},{"x":30,"y":18,"rotate":0,"anchor":"middle","valign":"bottom"}])
- ✓ star: 5 points and 5 inner corners, a point at the top; a regular hexagon
- ✓ arc and sector, a bent line (its middle), a round scale length
- ✓ pie and donut: an old sector unchanged, the hole, a ring, rounded corners within the slice, an ellipse (M5,0L10,0A10 10 0 0 0 0,-10L0,-5A5 5 0 0 1 5,0Z · 4.14, 10, 4.14, 4.14)
- ✓ a donut's slice as a path: curves only (M15.9161 10 L18.9443 10 C19.2288 10 19.4999 9.8788 19.6896 9…)
- ✓ bracket: turned about the middle of its base; turned with other objects ({"p1":[30,0],"p2":[30,40],"n":[-1,6.123233995736766e-17]} {"kind":"bracket","orient":"down","x1":-40,"x2":0,"y1":30,"y2":60,"rotation":90})
- ✓ a line through bends: through every one, its ends moved in along its tangents; the bends as text
- ✓ scaledSize: linear, area, log, reversed, clipped
- ✓ Plot: size from y over a range set (a key of three sizes in the legend), width from x (y:4 0:2 20:5 40:8)
- ✓ ANOVA: the groups as columns or indexed; the same F; the post-hoc pairs
- ✓ example: the drug study; every layout read, every test run ()
- ✓ Curve math: ΔX at Y = 0.5, every crossing (2.9999396475677873,3.0000603524322127)
- ✓ Curve math: ΔX at a range of Y (the last crossing, absolute)
- ✓ Curve math: ΔY at X
- ✓ Curve math: A − B on the X of A (B read by straight lines, empty outside it)
- ✓ Translate: ΔX, ΔY for all (x:10/11/12 a:2/4/3 b:6/7/5)
- ✓ Translate: a curve with its own ΔX gets its own X
- ✓ Translate: in steps (a waterfall)
- ✓ Translate: the maximum of every curve moved to (0, 1) (x:-1/0/1 a:-1/1/0 b:0/1/-1)
- ✓ Translate: columns on the ports, designated here (b: –, not moved) (x:0/1/2 a:101/103/102 b:5/6/4)
- ✓ Resize: X × 2 about 0 (x:0/2/4 a:1/3/2 b:5/6/4)
- ✓ Resize: X × 2 about the middle of the data
- ✓ Resize: Y × 2 about 0, every curve
- ✓ Resize: every curve's Y range brought to 0 – 1 (x:0/1/2 a:0/1/0.5 b:0.5/1/0)
- ✓ Resize: two values of X brought to two others (0 → 10, 2 → 20)
- ✓ Resize then move: the maximum of the resized curve brought to y = 0
- ✓ Resize: two equal values: not resized, said
- ✓ Resize: the ±Y resized as its Y (× \|−2\|), a move leaving it; the factors in the shifts; the curve before and after for the graph (x:0/1 a:-1/-5 sa:0.2/0.4)
- ✓ Smooth: the data, the smoothed curve, the residual (x,y,y (smoothed),y − smoothed)
- ✓ Interpolate: 11 points between 0 and 1 (cubic spline)
- ✓ Normalize: range 0 … 1, the factors out
- ✓ FFT: the peak at 1.5 with an amplitude 1 (1.5, 0.9999999999999999)
- ✓ FFT filter: a high pass removes the offset
- ✓ Convolution: a box of three points averages
- ✓ Data manipulation: added in the order of X, the other column interpolated (0/1/2/2.5/3/4 5/10/20/99/30/40 ·/100/200/250/300/400)
- ✓ Data manipulation: added at the end, at the start
- ✓ Data manipulation: a row deleted, a point added there (Z read between its neighbours) (1/2.2/3/4 10/7/30/40 100/220/300/400)
- ✓ Filter rows: repeated X averaged, sorted (1/2/3/5 10/21/30/50)
- ✓ Filter rows: the first of the repeated, descending, one in every 2
- ✓ Filter rows: a list of rows
- ✓ Filter rows: text sorted in its natural order
- ✓ Filter rows: sorted by X, then by Y (largest first)
- ✓ Filter rows: the 3 largest by X then Y (the old one-column sort left aside) (5 → 3 rows: sorted by x (largest first), then y (largest first); the first 3 rows kept.)
- ✓ Filter rows: the last 2 rows kept (the 2 largest Y)
- ✓ Filter rows: repeated in two columns together, averaged (4 → 3 rows: 1 repeated value of x + g averaged.)
- ✓ Filter rows: an older project keeps its one sort column; an unknown column is said
- ✓ Filter rows: only Y moved, by X (largest first); X in place; the rules win over the older keys (50/30/20/22/10)
- ✓ Filter rows: X sorted on its own (largest first), then Y alone reversed (5/3/2/2/1 50/22/20/10/30)
- ✓ Filter rows: whole rows reversed, the empty last row left last, a 0 kept (3/2/1/0/NaN)
- ✓ Filter rows: one column reversed over its own values (7/6/5/NaN/NaN)
- ✓ Filter rows: the rows empty in every column removed, a row with one value kept (0/1/2/3)
- ✓ Filter rows: whole rows reversed (the text with them)
- ✓ Filter rows: a sort rule on a missing column said
- ✓ Filter rows: a workbook in; one sheet (a dataset), or every sheet sorted (a workbook)
- ✓ Clean data: missing values filled (lines, previous, next)
- ✓ Clean data: the rows of missing values removed (every column)
- ✓ Clean data: an outlier (3 scaled MAD) masked, one change
- ✓ Clean data: an outlier clipped to median + 3·1.4826·MAD
- ✓ Clean data: by the quartiles, replaced (straight lines); removed
- ✓ Clean data: GESD finds 3 outliers in the NIST example (51,52,53)
- ✓ Clean data: Grubbs repeated stops at the first test (R1 = 3.118 &lt; 3.158)
- ✓ Clean data: a spike on a slope found by the moving median
- ✓ Intersections: sin and 0; 3 crossings at π, 2π, 3π, B above, below, above (3.141592855803835,6.283184876066685,9.424777977418923)
- ✓ Intersections: the first, the last, in a range of X (3.141592855803835 9.424777977418923 6.283184876066685)
- ✓ Intersections: a circle and a line (a loop, X going back): 2 crossings (0.8660254037844388,-0.8660254037844388)
- ✓ Intersections: a touch (row 3 of A, 1.5 of B), left out when only crossings
- ✓ Intersections: an overlap warned, where the curves meet and part counted (1,2)
- ✓ Average curves: every X where all three exist, mean, SD, SE, N (18 rows, 0.5–9)
- ✓ Average curves: where at least 2 have a value (the ends with 2), min / max / median
- ✓ Average curves: a uniform grid over the common range; SD designated ±Y
- ✓ Average curves: a curve whose X goes back is warned of
- ✓ Fit York: ±X chosen; without weights an error
- ✓ Fit compare models: AIC, AICc, BIC (K = parameters + 1), the weights, the second curve
- ✓ Import: a custom delimiter (::)
- ✓ Import: a custom delimiter (#, 	 written)
- ✓ Columns: a name with a comma chosen whole; a list still a list
- ✓ Digitizer: 2 points on each axis; a turned, sheared image read back exactly
- ✓ Digitizer: a logarithmic X axis
- ✓ Digitizer: parallel axes refused
- ✓ Digitizer: points placed without their values; said, not read as empty points (Write the value of X₂, Y₂ (the number on the axis where they were placed).)
- ✓ Digitizer: the 4 corners; the perspective of a photographed page corrected
- ✓ Digitizer: a curved page; spline 0.267 %, polynomial 0.334 % of the range, straight axes 1.41 %
- ✓ Digitizer: a reference point typed wrong shows the largest error
- ✓ Digitizer: a curved page needs six points at least
- ✓ Digitizer: the dataset; a set each (X, Y, ±Y from the bar), in the order of X
- ✓ Digitizer: a curve found by its colour, a point every 10 px (30 points)
- ✓ Digitizer: markers found, their centres exact
- ✓ Digitizer: only in the area, not in the part left out
- ✓ Plot: on a curve’s data port, X and Y chosen from its dataset (else its designations)
- ✓ Probability plot: every group its own symbols, line and band
- ✓ Histogram: a column its own opacity, hatching and fit line
- ✓ Bar chart: a category its own edge and hatching, also in the legend
- ✓ Box & violin: a group its own median colour
- ✓ Polar: r from −30 dB to 0, circles every 5, a half circle (-25,-20,-15,-10,-5,0)
- ✓ Polar: r from 0 to a nice value
- ✓ Radar: 5 spokes evenly, closed polygons, a series with its own line and fill
- ✓ Smith chart: Γ of Z, Y, Γ, S11; back to z; a marker (f = 2.45 GHz, Z = 100 + j0 Ω, VSWR = 2, RL = 9.54 dB); a point outside at the rim
- ✓ Polar axes: 0° where asked, the circles every step (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4), the axes' look to the drawing
- ✓ Scatter matrix: 9 panels, Pearson r, the diagonal in its row's range, one legend entry a group
- ✓ Scatter matrix node: the designated Y columns (2 × 2 frames), X shared down a column, Y along a row (4)
- ✓ Waterfall: steps from the running total, increases and decreases apart, the total, the connectors
- ✓ Ternary: rows as fractions of their sum, A at the top, a bad row left out, a curve per group
- ✓ A map of 451401 points: its grid, drawn fast on 300 even cells, levels below 0 dashed, a value on every second level, the profile kept off the map
- ✓ Fast drawing: a grid already small enough is drawn as it is
- ✓ Split into columns: 501 blocks (a map in long form) give 502 columns ()
- ✓ SI prefixes in the numbers (0,1.5k,2M,300µ,4.7n)
- ✓ A fixed aspect: the frame twice as wide as high for X 0 – 10, Y 0 – 5 (0.5000)
- ✓ Autosave: a big imported text kept apart (a reference in the project), a small one in it
- ✓ pseudo-Voigt: % Gaussian = 100(1 − μ) ± 100σ(μ) in the parameters (65.13801525497885 ± 0.9046531030471847)
- ✓ pseudo-Voigt: a saved η (projects before μ) read as μ, only for μ
- ✓ Contour: the two profiles of a former project read as a list of two (their colours, line, width)
- ✓ Contour: two row profiles (a Z column each, at the nearest rows) and one column profile (its Z named as before) (θ,R at λ = 10,R at λ = 30 \| λ,R)
- ✓ Contour: only the profiles asked drawn on the map, each with its colour, line, width
- ✓ CSV: plain numbers read exactly as Number() (20000 of 20000)
- ✓ CSV: quoted cells, blank lines, spaces, old Mac line ends, ragged rows
- ✓ Formulas: functions of one, two, three arguments; a name not given is missing (NaN)
- ✓ Waterfall: Z from the blocks, the numbers in the names, or the order
- ✓ Waterfall: every curve shifted by its step, drawn from the back, its fill down to its baseline in the page colour (hidden lines)
- ✓ Waterfall: Z written beside the last point of every curve, the curves coloured by Z on the map (its range for the colour bar)
- ✓ Waterfall: the last in front, steps in data units, a ridgeline fill in each curve’s colour, a colour chosen
- ✓ Waterfall spacing: even, by Z, a list, automatic with a gap, by height (0,0.1,1.7)
- ✓ Waterfall spacing by Z without Z: even steps, said
- ✓ Waterfall node: a split sweep, Z the blocks’ value, a colour bar titled by it, the shifted curves out ()
- ✓ 3D: a surface; a colour a cell by Z, the box the data’s range, contour lines on the floor, the titles
- ✓ 3D: a wireframe (no fill, every line), drawn on at most N cells a side
- ✓ 3D: bars from 0, their width a fraction of the step, the box around them
- ✓ 3D: symbols of two groups (a legend each), coloured by Z point by point, lines to the floor
- ✓ 3D: a waterfall; every curve at its depth, in its plane, with its wall; coloured by the depth
- ✓ 3D waterfall: walls on the chosen curves, their colours; the depth labels typed (#00ff00,-,#0000ff; thin,250)
- ✓ 3D waterfall: every wall (all), the depth labelled with the curves’ names
- ✓ 3D marks: a rectangle’s corners in its plane
- ✓ 3D: the limits of the axes cut the surface; the camera kept (1,4; 1,2,3,4)
- ✓ 3D: the surface hidden, the mesh by Z along X, contours on it, the ceiling, the walls, the curtain, the underside, the shine
- ✓ 3D: the curtain coloured like the surface, a reversed Z axis, its own step, a mark in front of the data
- ✓ 3D marks: an arrow (its head, projections, label), an upright rectangle filled, a point
- ✓ 3D: a place on the floor found from the screen (2.5,1.5,0)
- ✓ 3D: the plane drawn on; the floor, a back wall, a value
- ✓ Hide values: below a threshold, equal to the values written, NaN; nothing set: no test
- ✓ 3D stacked maps: the points in bins over the range of all layers (a mean each, empty: NaN), hidden values left out, a layer’s opacity
- ✓ 3D stacked maps: the colour range of the values drawn, half a step of room below and above, the names on Z (no Z title)
- ✓ 3D marks: a vertical line from the bottom to the top cut at the layers’ heights; a rectangle on the floor
- ✓ 3D stacked maps: a log colour scale (the positive values; a range end ≤ 0 ignored), no numbers on Z
- ✓ 3D stacked maps: every value hidden; said
- ✓ 3D stacked maps: the layers found by a column of labels
- ✓ 3D stacked maps: my list; a layer by a label, one by rows, an input not connected kept empty
- ✓ 3D stacked maps: my list drawn at its heights
- ✓ Peak width: a Gaussian peak and dip, FWHM = 2.3548σ (2.35482, 2.35482)
- ✓ the minimum between the points, refined by a parabola (5.0706)
- ✓ Peak width: a side that does not reach half the height; empty, said
- ✓ measures: X at a level, Y at X, the area, the centroid
- ✓ Curve math formula: the sensitivity of a dip, its width (600.000,612.000,1000.000,18.840)
- ✓ Curve math formula: a result named as a curve, an unknown function; said
- ✓ Peak width: a row per run and region; FWHM, min and max (11.78,14.13,11.78,NaN)
- ✓ Peak width: the points in every region and their % of the curve
- ✓ Math column presets: all read ()
- ✓ Math column: the errors of A and B carried to A·B (1.0198,2.1541,3.4986)
- ✓ Math column: an error of an input the formula does not use (only its mean): said
- ✓ use the fit: Y at X with its confidence and prediction intervals (± 0.01581 / 0.01581)
- ✓ use the fit: X from Y (3 replicates) as the calibration formula (4.67188 ± 0.03577 / 0.03577)
- ✓ use the fit: LOD = 3.3·s/b, LOQ = 10·s/b
- ✓ use the fit: a derived value and its error from the covariance (3.2560e-2 / 3.2560e-2)
- ✓ use the fit: a Y the model does not reach; said
- ✓ the new library models fitted to their own data from their own guess (20): all found
- ✓ errors of X: a straight line by effective variance as York's (Pearson's data: b = -0.48053, York -0.48053)
- ✓ equations: A → B → C solved (1.1e-9) and fitted (k1 0.7003, k2 0.2000, A0 1.9997)
- ✓ equations: a missing start, what is measured with two; said; a start elsewhere than 0
- ✓ reconvolution: Gaussian IRF ⊗ exponential as the analytic one (9.1e-4); τ 0.7990, shift 0.0502, bg 5.00
- ✓ the Fit node with equations (k1 0.7003)
- ✓ the Fit node: a surface; a rotated 2-D Gaussian found (xc 3.400, θ 30.07°, wx/wy 1.670)
- ✓ formulas: functions of one's own before the formula; called, nested, using the formula's parameters
- ✓ formulas: a call with the wrong arguments, two formulas; said; a comparison stays a comparison
- ✓ complex numbers: arithmetic, exp, sqrt, functions of one's own, polar, conj, abs (50,-50)
- ✓ Math column in complex numbers: \|Z\| and its phase of R + 1/(jωC) (1001.25,111.80,50.99,50.01)
- ✓ Fit, complex: a Randles circuit fitted to Re Z and Im Z at once (R0 10.0000, R1 100.0000, C1 2.0000e-6)
- ✓ Combine side by side: A then B, a name met twice, the shorter ones end in empty cells
- ✓ Combine side by side: before A, renamed; in place of a column; a missing column said
- ✓ Combine side by side: a dataset out, even of columns
- ✓ Combine ▸ one column: in the order A C B, interleaved A₁C₁B₁ …, sorted by value (largest first)
- ✓ Combine ▸ side by side: in the order of the list, renamed → a dataset
- ✓ Combine ▸ in sheets: the inputs with the same sheet side by side → a workbook
- ✓ Combine ▸ into a table: A put between B and C of sheet N, another continuing D; the other sheet kept (B,A,C,D)
- ✓ Combine ▸ the output port: into a sheet of a workbook → a workbook, one column → a column; a missing column said
- ✓ editable figure: the project in an SVG (once, when written again), read back
- ✓ editable figure: the project opened from an SVG is the one exported (nodes, connections, id)
- ✓ editable figure: a file read as SVG; a plain SVG has no project
- ✓ editable figure: an SVG of the first exports (&lt;metadata&gt;) still read; written again in groups
- ✓ editable figure: a project of 37 kB in 5 groups of 8000 characters, read back whole
- ✓ editable figure: the project read from an SVG inserted in Word (the file Word keeps, scripts/fixtures/word-inserted.svg)
- ✓ editable figure: the revision; the same project the same; its name or id do not change it; a node changed does
- ✓ editable figure: without the imported data; the Import nodes kept, their text empty (3.8 kB → 2.8 kB)
- ✓ editable figure: the project in a PNG (an iTXt chunk before IEND, its CRC right; once, when written again): IHDR,IDAT,iTXt,IEND
- ✓ Word document: 3 pictures, the 2 figures with a project found (SVG with its PNG; PNG), their size (word/media/image2.svg, word/media/image3.png)
- ✓ Word document: a file that is not one; said
- ✓ Word document updated: the SVG and PNG of the first figure, the PNG of the second replaced; the other picture left alone
- ✓ Word document updated: the first figure at its physical size (wp:extent and a:ext, EMU); the others as they were
- ✓ Word document updated: the same parts in the same order, the others unchanged
- ✓ PowerPoint: the figure on a slide found (its media in ../media), its size
- ✓ PowerPoint updated: the PNG replaced, the picture at its size, in the same place
- ✓ axis title: two quantities of one unit named both, the unit once; data and its fit: the data’s name
- ✓ axis title: a copy’s “ (2)” left out; more than 3 of one unit: “Value (unit)”; different units listed; one curve: its name
- ✓ axis range: out to the major ticks; data crossing 0 by a little only, out to the nearest minor tick past 0 (-1,12 · 0,10 · -0.4,12 · 80,200)
- ✓ a legend outside the frame (right): past the numbers and title of that side, inside the page (156.5, 7.8, 79.5 × 38.0 in 241 × 184 pt)
- ✓ a legend outside the frame (below): past the numbers and title of that side, inside the page (38.7, 162.1, 190.7 × 17.2 in 241 × 184 pt)
- ✓ error columns by their names: SD, SE, σ, ±; not Base, Response, Phase (--E-E--E-E)
- ✓ error columns: the Y named in them (in any order), else the Y on their left
- ✓ Bland–Altman: the values on the lines with one number of decimals, the name over the value (Mean −3.43 \| +1.96 SD 10.94 \| −1.96 SD −17.81)
- ✓ end labels: outside the frame at the right, inside the page, apart from each other
- ✓ Bland–Altman: the share of the pairs within the limits (93.3 %)
- ✓ decimal comma: the point between two digits only
- ✓ a title over the figure (the frame lowered: 4.2 → 13.5 %), the decimal comma kept by the figure
- ✓ axes crossing the frame: the bottom axis at y = 0, the left one at x = 5 (inside the frame); the others at its edges
- ✓ axes crossing the frame: no room kept for their numbers outside it (left margin 14.6 → 6.5 %)
- ✓ a legend placed by itself: away from the data (data upper right → tl; upper left → tr); a new Plot's legend automatic
- ✓ trend lines: the axis title stays the data's (Signal, Other (mV)); a legend too large for the frame placed under it, the frame keeping its width (87 %)
- ✓ Bar chart: a curve over the bars at the categories of the same name (one not among them said), on a second axis at the right
- ✓ the overlay port of Bar chart and Contour takes a dataset
- ✓ Bar chart: sorted by the first series (missing last) or by the stacked total, the errors following
- ✓ Bar chart: numeric categories keep their places when sorted
- ✓ Box: n written under every box, below its whisker, out of the legend
- ✓ Ternary: coloured by a column; the map over its range, a missing value grey
- ✓ Ternary: without a colour column, the groups’ colours
- ✓ 3D: symbols coloured by a 4th column, its range and name on the colour bar
- ✓ 3D: coloured by Z as before
- ✓ One point per X: X of texts in the order met, no spread asked → no ±Y
- ✓ Histogram: a rug of the values at the bottom
- ✓ Plot: a quick fit on a range; its curve, the range a band of its look (dragged), the results box, the “fits” table
- ✓ Plot: a workbook on its dataset port; every curve from its sheet (its X and Y), named with it; none: the first sheet; a sheet missing said
- ✓ Plot these columns: pairs from two sheets in one Plot; a Plot per sheet in a Merge; curves added to a Plot; a bar chart of one sheet of the workbook
- ✓ Plot these columns ▸ Y axes: one left, the others right; each its own axis, coloured and titled as its curve (left,right,y3)
- ✓ multi-axes layouts: double Y, all on the left (moved out in turn), left and right in turn, X at the bottom and top
- ✓ a new Y on the right: the right axis itself when it only mirrors; past a converting right axis, a third Y
- ✓ axes added, one taken away, one added: in the free place (offsets 40,80 → 40,80), none over another
- ✓ an added axis removed (Axes ▸ Remove this axis); an axis that is not there: nothing changed
- ✓ Plot these columns: a 3D scatter of X, Y, Z; a 3D waterfall of X and the Y columns
- ✓ Projects: a backup of all the projects, read back; another file refused
- ✓ Python script: nothing runs until Run is pressed
- ✓ Python script: a run asked for when the code or the data change; its outputs as values, an error with its line
- ✓ Plot: a quick fit’s curve styled as a curve (line + symbols, colour, fill); older fits’ look read in; its defaults
- ✓ Legend: placed off a results box (tl); an entry on three lines three lines high
- ✓ Legend: text width by its font (Arial 76.5, Courier 89.0, Times 73.4 pt); sample height and gap
- ✓ Drawing: its page, the hidden object left out, the order its layer, a locked one marked
- ✓ Drawing in a Merge: its whole cell; the Plot beside it alone gives the common titles
- ✓ Drawing as an inset of a Plot: placed in its box, no zoom marks
- ✓ Drawing: a polygon moved, every point
- ✓ Drawing: an arrow moved with its bends
- ✓ Drawing: aligned left, bottom
- ✓ Drawing: spread across, equal gaps ([[0,0],[0,0],[2,0]])
- ✓ Drawing: snapped to an edge near it, else to the grid
- ✓ Drawing: the box of a rectangle from its corners
- ✓ Elbow: across, down, across (the upright piece at 0.3)
- ✓ Line cut at both ends, along its corner
- ✓ Line moved to its left, the corner kept sharp ([[0,-1],[11,-1],[11,10]])
- ✓ A wave 2 either side, from nothing to nothing at its ends
- ✓ Tapered line: from nothing to 4 wide
- ✓ Above a line: up the page (an upright one: its right)
- ✓ Connector: on a rectangle facing the other end, or the middle of a side
- ✓ Connector: on an ellipse
- ✓ Connector: on a turned rectangle
- ✓ Connector: from the rectangle's edge to the ellipse's ({"kind":"arrow","x1":10,"y1":5,"x2":30,"y2":5,"from":"A","to":"B"})
- ✓ Elbow connector: leaves by the right side, meets the top, 1 mm away ({"kind":"arrow","route":"hv","x1":11,"y1":5,"x2":35,"y2":19,"from":"A","to":"C","away":2.834645669291339})
- ✓ Path: relative moves and lines (M10 10 L15 10 L15 15 L10 15 Z)
- ✓ Path: quadratic curves (and their mirror, T) as cubic ones
- ✓ Path: a half circle as two cubic pieces, up the page ({"x":0,"y":-5,"w":10,"h":5})
- ✓ Path: an ellipse as four cubic pieces
- ✓ Path: a rounded rectangle, its four round corners
- ✓ Path: a turned rectangle, the turn in its points
- ✓ Path: turned about the middle of its box, its controls with it, the same through the page's scale (M7.75 -2.25 L7.75 7.75 L3.75 7.75 C1.75 7.75 1.75 -2.25 3.75 -2.25 Z)
- ✓ Fillet: four round corners (M2 0 L8 0 C9.3333 0 10 0.6667 10 2 L10 8 C10 9.3333 9.3333 10 8 10 L2 10 C0.6667 10 0 9.3333 0 8 L0 2 C0 0.6667 0.6667 0 2 0 Z)
- ✓ Chamfer: four corners cut
- ✓ Node removed
- ✓ Node added where the path passes nearest (M0 0 L5 0 L10 0)
- ✓ Node made smooth: its controls level (in line with its neighbours)
- ✓ Node made a corner again
- ✓ Path drawn the other way
- ✓ Path closed
- ✓ Component: its objects in the instance's box, stretched
- ✓ A line turned about a point
- ✓ A rectangle turned: moved, its own turn added
- ✓ Drawing: a component's objects moved with their instance, an object cut to a hidden shape, a text along its outline
- ✓ Rectangle: its own radius for each corner (two round ones)
- ✓ Fillet: only the node picked (M0 0 L10 0 L10 8 C10 9.3333 9.3333 10 8 10 L0 10 L0 0 Z)
- ✓ Text on the other side of a line: the line taken the other way (M10 0 L0 0)
- ✓ Annotated Plot: the drawing over it, on its page (85 mm, not its own 20)
- ✓ Annotated Plot as a guide: the drawing alone, at the size of the Plot
- ✓ Annotated Plot in a Merge: the drawing over its Plot, in its cell
- ✓ Annotated Plot as an inset: the drawing in the same box as its Plot
- ✓ Pinned arrow: where it was drawn while the limits stay
- ✓ Pinned arrow: its head follows its data point when X goes to 8 (-9.54, 0.00 mm)
- ✓ Corners: read and written back
- ✓ Corners: one of its own, or all of them
- ✓ Corners: their radius in pt, the points in mm
- ✓ Join: the nearest ends one node (M0 0 L10 0 L20 5)
- ✓ Join: a piece between ends apart (M0 0 L10 0 L12 0 L20 0)
- ✓ Break: a closed path opened at a node (M10 10 L0 10 L0 0 L10 0 L10 10)
- ✓ Break: an open path cut in two
- ✓ A node in the middle of the longest piece
- ✓ Array along an open path: from end to end
- ✓ Array along a closed path: evenly round it
- ✓ Behind the data: its own overlay, drawn inside the Plot's frame
- ✓ Annotated Plot in a Merge: its proportions kept (1.3077)
- ✓ Gradient: by default across the whole box at its angle
- ✓ Gradient: start and end in % of the box, reflected beyond them
- ✓ Gradient: radial, its radii across and down ({"gradientUnits":"userSpaceOnUse","cx":30,"cy":30,"r":10,"gradientTransform":"translate(30 30) scale(1 0.50000) translate(-30 -30)"})
- ✓ curvemath: a sheet of a workbook, two operations; each its output and what it computes (-1, 1; )
- ✓ curvemath: curves from columns, A − B (-1,-1)
- ✓ plot: a workbook; its sheets, their columns, a curve from the second sheet (["S1","S2"]; E,c,d; )
- ✓ convert: cells read as numbers (300 K \| 1.5 \| 1200.5 \| 1200.5 \| 1200.5 \| 25 % \| 1.23±0.05 \| 1.23±0.05 eV \| 1.234±0.012 \| empty \| 0.005 \| 0.0003 \| 0.0003 \| empty \| null \| 300 \| null \| -2500 \| 0.25)
- ✓ convert: nothing until columns are chosen; then units into the names, ± as an error column, a cell not read listed (T: 1 cell not read as numbers (left empty): row 4 “x”.)
- ✓ convert: numbers written as text (-0,50 V\|0,25 V\|1,00 V)
- ✓ convert: the text cells that look like numbers counted for the proposal
- ✓ convert in a worksheet: typed as changes, the error column after it (x, E (eV), E error (eV), z)
- ✓ transpose: 7 × 15 becomes 14 × 8, the wavelengths read from the names, every column its voltage (Value (nm), -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1)
- ✓ transpose twice: the table back (Voltage (V), 400 nm, 410 nm …)
- ✓ transpose: names from the row numbers, the old names as text
- ✓ stack columns: two columns one under the other, their names as numbers (Name (K), t (s), Value)
- ✓ stack columns: the names as text, the errors stacked with the values
- ✓ Columns to sheets: a sheet per column (and back: 1 2 3 \| 4 5 6), per value of a column (S1:10,30 S2:20,50 S3:40; 300:1,3 310:2), errors said
- ✓ Export: CSV, quoted where needed ("Wavelength (nm),\"R, a \"\"label\"\"\",Sample\n400,0.25,a\n405.5,,b;c\n410,0.3333333333333333,\n")
- ✓ Export: decimal comma (semicolons), 3 digits, NaN, masked rows left out ("400;0,25;a\n406;NaN;\"b;c\"\n")
- ✓ Export: the first form of the settings read; the extension from the delimiter
- ✓ Export: text with a tab, the designations line, a masked value left empty ("Wavelength (nm)\t\"R, a \"\"label\"\"\"\tSample\nX\tY\tLabel\n400\t0.25\ta\n405.5\t\tb;c\n410\t\t\n")
- ✓ example “Cleaning a sensor log”: the rows merged and sorted, 3 gaps filled, exactly the 3 spikes found, 2 points masked (Temperature (°C): 3 missing values filled (linear). Temperature (°C): 3 outliers (movmedian): replaced (interpolated): rows 35, 80, 103.)
- ✓ example “Replicate scans”: the mean of the 3 scans on 146 points, all 372 points pooled
- ✓ example “Difference spectrum”: sample − reference peaks at the band only the sample has (654 nm)
- ✓ example “Digitizer”: the 21 points read lie on the curve drawn (largest gap 0.0032 mV)
- ✓ example “Python script”: not run before Run (no download), its outputs connected, no warning
- ✓ example “Publication figure”: the inset, the drawing over the figure, its 4 pinned objects moved to their data
- ✓ example “Organizing”: 3 frames, a group, a reroute, the curve through them
- ✓ examples: every node in at least one ()
- ✓ Note: a plain text as paragraphs, and back
- ✓ Note: the plain text of a formatted document (headings, lists); formatting kept as a document
- ✓ Note ▸ Word: every part well formed, the figure's picture inside (7 parts)
- ✓ Note ▸ Word: headings, alignment, spacing, indent, colours, sizes, superscript, merged cells, a filled box, a numbered caption, equations, a list starting at 3
- ✓ Note ▸ Word: a figure and a box with the text beside them float at their side; a table at its width, centred
- ✓ Note ▸ Markdown: headings, marks, links, nested lists, a table, a box, a figure's file and caption, formulas ("## Results\n\nA **bold** x&lt;sup&gt;2&lt;/sup&gt; [here](https://example.org) 5\\*3 $\\alpha$\n\n- one\n  1. nested\n\n\| λ \| R \|\n\| --- \| ---")
- ✓ Note ▸ formulas: fractions, roots, integrals, accents, bars, matrices, binomials, sub- and superscripts as Word equations
- ✓ Note: the plain text of formulas (their LaTeX)
- ✓ Note ▸ formulas: chemistry (mhchem) as Word equations, a wrong formula shown as its LaTeX, no MathJax markers left
- ✓ Note: a figure just copied is known by the size of its picture
- ✓ Help: a short text for every node, none too long ()
- ✓ collaboration: every example into a shared document and back, unchanged ()
- ✓ collaboration: a peer joining gets the project
- ✓ collaboration: two fields of one node changed at the same time; both kept, on both peers
- ✓ collaboration: a node nobody changed stays the same object (no recomputing, no redrawing)
- ✓ collaboration: one field changed by both at once; one value, the same everywhere
- ✓ collaboration: a node removed while another peer connects to it; no broken connection
- ✓ collaboration: the broken connection taken out of the document at the next change
- ✓ collaboration: nothing changed, nothing sent
- ✓ collaboration: NaN and ±Infinity kept
- ✓ collaboration: three peers, 12 × 150 random changes synchronised in random pairs; the same whole project everywhere 
- ✓ collaboration: peers that show the others' changes late and write on what they show; no change lost or written back over 
- ✓ collaboration: guests joining a host get the project (and their names)
- ✓ collaboration: a 300 kB file from one guest reaches the other through the host, in chunks
- ✓ collaboration: a node removed by a guest is gone everywhere
- ✓ collaboration: a lost link leaves the session on both sides
- ✓ collaboration: nothing passes while the link is lost
- ✓ collaboration: joined again; what both did while cut off is merged, everywhere
- ✓ collaboration: a peer that leaves says so (not shown as a lost connection)
- ✓ collaboration: presence; a guest’s mouse and selection reach the other guest through the host
- ✓ collaboration: presence; only those at the level shown
- ✓ collaboration: presence; someone who leaves goes at once
- ✓ collaboration: presence; someone not heard for a while is no longer shown
- ✓ collaboration: presence; a link gone takes with it whoever was heard through it
- ✓ collaboration: a long message between computers goes compressed and arrives whole (0.98 MB → 0.37 MB on the wire)
- ✓ collaboration: chunks put back together in any order
- ✓ collaboration: the kinds of addresses in a code, none shown (host (hidden .local name)/udp×1, host (hidden .local name)/tcp×1, srflx/udp×1, host (address)/udp×1)
- ✓ collaboration: the ways to reach a side kept apart from its description (each with its section), for the synchronized start
- ✓ collaboration: a local address typed is tried beside the made-up name, on the same port
- ✓ tours: distinct ids, every step titled and written
- ✓ tours: the example spectrum reads as 3 columns of 251 rows, absorbances in 0 … 1
- ✓ tours: the first steps are done by an Import with data, then a Plot connected to it
- ✓ tours: the plot clicked (selected) opens its options
- ✓ tours: a curve restyled, an axis titled, each against how its step found the Plot
- ✓ tours: a figure saved (svg, png, pdf, tiff), not any file
- ✓ Batch: a row per file, in the order of the value its name gives, the maximum of each (File, T, run, row, x, y;  )
- ✓ Batch: a sheet per file, every row with its file, the steps shown on the first file
- ✓ Batch: each result kept on a port of its own (File, T, run, row, x, y · 5 columns, 303 rows)
- ✓ Batch: two results kept with the same name, each its own data (max 30 50 70, min 61.49999999999968 0 0)
- ✓ Batch: long tables side by side (x, y (sample_20C), y (smoothed) (sample_20C), y (sample_30C), y (smoothed) (sample_30C), y (sample_40C), y (smoothed) (sample_40C); one-row tables still a row per file); an X that differs before each file; kept results named by hand (Smooth, Smooth (2), Peaks, Fit)
- ✓ Batch: the same files, the same result (not computed again)
- ✓ Batch: a pattern reads numbers and words, a wrong one is said
- ✓ Batch: made from a group, it keeps what its last step gives
- ✓ Batch: the steps shown on the file chosen (the third: its peak at 70); the files with what their names say (T = 20, T = 30, T = 40)
- ✓ Batch: a file with its own settings of a step (sample_30C read at X = 40; the others their maximum: 30, 40, 70)
- ✓ Batch: a step skipped for one file (its data passed on: 101 rows; the others their maximum), said in the table; the steps whose changes are for one file
- ✓ Batch: own settings tidied (no empty step or file), laid over the common ones (the others kept)
- ✓ Batch: a pattern guessed from the names (PL_{V}K_run1; sample_{V1}C_{V2}h)
- ✓ Batch: an empty one from the Nodes panel; its files counted, no steps, nothing kept yet
- ✓ Batch over columns: every Y column a run (its maximum at 30, 50, 70), the thickness read from the names (150, 200, 250; )
- ✓ Batch over columns: the columns listed (C, E), with another X (t = 2 x: maxima at 60, 100; 60, 100; )
- ✓ Batch over columns: the X on the left of each (pairs; the ±Y with its column), the row number, a column not found said
- ✓ tours: the tutorial first, done step by step by Show me (a Smooth connected, its window 31)
- ✓ tours: tour 2 done step by step by Show me
- ✓ tours: tour 2 leaves no node in error
- ✓ tours: tour 2; Clean data fills the gaps and replaces the spike, every row kept
- ✓ tours: tour 2; the first 3 s of every run left out (3 × 38 rows)
- ✓ tours: tour 2; the runs side by side, named (Time (s), Run 1, Run 2, Run 3)
- ✓ tours: tour 2; the offset taken away (run 1 starts near the model)
- ✓ tours: tour 2; Time, Run 2 and the model side by side (Time (s):38, Run 2:38, Model (mV):38)
- ✓ tours: tour 2; both days of the calibration in one table (Day 1: Concentration (mM), Day 1, Day 2: Concentration (mM), Day 2)
- ✓ interface colours: the dark shade of a listed colour is its own, of another one lighter; the accent follows the selection
- ✓ collaboration: an address typed is IPv4 or IPv6
- ✓ collaboration: the answer carries when both sides start
- ✓ collaboration: an invitation code (also inside a link) read back; anything else refused
- ✓ image pixels: 16-bit, 8-bit RGB and float kept and read back exactly (deflated, base64)
- ✓ local variance over a disk (2.40840614615012e-8)
- ✓ steps in order: blur, (off), Otsu threshold → a mask, fill holes; a colour step on gray said (Otsu: 126.56)
- ✓ curves: monotone through its points, no overshoot
- ✓ PNG: signature, size, its rows read back (RGB, unfiltered)
- ✓ scale bar: round lengths; 10 µm of a 50 µm wide image on 80 mm is 16 mm, “10 µm” (10 µm)
- ✓ Image node: thresholded (Otsu) → a 0 / 1 matrix with X in µm; a figure of its proportions with the image and a scale bar (2 µm)
- ✓ Image node: a step that cannot run said with its number; no image yet: waiting
- ✓ Image node: a crop; only that part analysed (14 × 12 of 24 × 20)
- ✓ Image node: a selection measured on the part cropped (48 px = 12 µm², its mean), out as a workbook with the mask's coverage; its outline on the figure, locked; evaluated again when its pixels come back (1 selection · coverage 50.0 %)
- ✓ Image: the data bar under an SEM image found (14 rows of 14), none on an image without one; cut off by a crop
- ✓ Curves: the default leaves the image as it is; R inverted alone (G, B kept)
- ✓ Image: the pixel size read from an SEM's TIFF tags (FEI 2.5 nm, Zeiss 12.4 nm, Tescan 0.46 µm)
- ✓ Image preview: shrunk by block means (10, 55), a mask by the majority; σ 6 px on a preview of half the size is σ 3
- ✓ wide Gaussian σ 20 on the image shrunk: within 0.19 % of the full kernel; quantiles by selection
- ✓ spots: net signal over a ring (the other spots left out), a region, a global value; the mask's cover of each selection and of the image; the summary by group; lines and points in µm (Selections,Spots,Distances,Profiles,Points,Summary \| 100 \| 0 \| 50 \| 6 \| 100 \| 0 \| 50 \| 13 \| 20 \| 2 \| A,B,(no group),all,image \| 2 \| 50 \| 110 \| 6 selections · coverage 50.0 %)
- ✓ particles: 42 discs of 42 found, the clusters cut apart (24 without); 35 shapes, none cut though cutting is on, each told right as circle, ellipse, triangle, square, rectangle or irregular (0 wrong); grouped like two examples of each (0 wrong of 23)
- ✓ trainable classifier: 24 textured particles of 24 from 4 lines and 3 background examples (Otsu: 17 pieces); the same twice; one class only: said (object: 239 px, background: 2122 px → object)
- ✓ structure: 40 ligaments of 40 px (median 40.00), 6 and 7 px thick, 25 junctions, the 3 bumps cut, 16 pores (33 px across)
- ✓ structure by hand: deleted, kept, drawn, erased, a node added and one moved; the cut learnt ({"ratio":0.976,"right":2,"of":2})
- ✓ structure in the node: its sheets, in nm (median 80 nm long, 14 nm thick)
- ✓ frequency: the spot at d = 8.00 px, the radial peak at 8.00 px; band-pass: the ramp 7.5; Bragg: 1.01 from the lattice (noise 8.7); the sheet (0.8 nm)
- ✓ surface: levelled within 3.1e-6 (a bowl 9.6e-7); a sine Sa 1.9037 Sq 2.1213 Sku 1.500 Sdq 0.9962 of it; a profile Rq 1.002 of it with λc, Ra 1.867; PSD ∫ 0.991 Sq²; ACF 1/e at 3.98 (4), Sal 4.95 (5.07), Str 0.93, grooves 0.06
- ✓ height files: Gwyddion 4 × 3, 1 px = 1 µm, z 11.000000000000002 nm; text 4 × 2, 1 px = 500 nm; X Y Z 4 × 3
- ✓ surface in the node: Sa 1.8940 nm (1.9037), Sdq 0.04123; the step 10 nm; the matrix afm.gwy (nm)
- ✓ texture: ℓ 20.00 across, 30.00 down, 15.60 on circles (15.71); G(0.032 mm) 6.644; stripes at 29.84° (coherency 0.997), -60.16°; D 2.000 filled, 1.139 outline, 1.585 Sierpinski; the node ℓ 11.875 µm
- ✓ scale bar: found at x 250–369, y 275–278; a black one at 20–79; labels 500 nm, 2 µm, 1.5 µm, 200 µm, 10 Å, 200 nm, –
- ✓ layers: the square over two others on top (layer 1), they under it (2, 2), one alone on top
- ✓ seeds and rays: nanocubes 48 of 48 (from the image), discs in clusters 42 of 42 (from the mask), none wrong; made squares, their side within 0.8 %
- ✓ rays tool: 48 of 48 nanocubes outlined alone from a click (area within 10 %); dark discs of radius 30 and 4 seen 29.9 and 4.0
- ✓ edges: Otsu 24 pieces of 48 cubes; cut along edges 39; edges subtracted then Otsu 43; ridges up to 0.86 in the gaps, 0.01 at most inside
- ✓ Refine: 30 of 30 regular particles made their shape; 48 nanocubes made squares snapped to the edges, their side within 0.7 % (median); only the shapes allowed
- ✓ Find like this in the particle's shape: in clusters 48 of 48, none wrong; alone (ring 8 px): the cubes on their own 0.99 or more alike, those in clusters 0.81 at most
- ✓ the dashed line around a model (a square 2 px out: 14 × 14); the eraser over an area, near its edge, on a stroke of its width
- ✓ Find like this, a margin drawn by hand (a line 8 px out, its corners square: 44 of 48 found, the ring 48): the cubes on their own 0.99 or more alike, those in clusters 0.81 at most
- ✓ Find like this, a margin drawn tight (as only the particle): every cube found (48 of 48)
- ✓ Find like this ▸ Review: a cube in a cluster left out, the places like it dropped (in clusters 44 → 0), every cube on its own kept
- ✓ Find like this ▸ Separate by overlap: rods side by side 8 of 8 (by the distance 4); two squares half over each other 0.50; the features of every place found
- ✓ classifier: 3 nanocubes outlined, the edges from their outlines, split by edges: 47 of 48 apart (a mask without edges: 20; an older step: none made); their side within 2.0 % (median); sure inside 48 of them, hesitating at the edges
- ✓ classifier: edges from outlines, a ring just outside them and the gap between two touching
- ✓ nanocubes: 48 of 48 found like one (turn within 2.0°, side within 3.0 % once its edges are fitted, the box's orientation within 2.0°); the mask cut along the dark lines: 48 (Otsu alone: 24); the smallest rectangle, the alignment
- ✓ waveform: levels 0, 1; rise 0.3200, fall 0.3200 (0.32); period 10, duty 30.000 %; the triggers at 0.2, 10.2; the average of equal segments
- ✓ convolution voltammetry: the semi-integral of the current back to m within 2.4e-3; D = 0.0000076 cm²/s (7.6e-6)
- ✓ fractional Fourier transform of a chirp of 350 Hz/s: the scan's rate 349.3; filtered, the pulse back within 5.4 % of its RMS
- ✓ harmonics: the fundamental 1031.700 (1031.7); THD -39.597 dB (-39.586), SNR 62.96 (63.01), SINAD 39.578 (39.566), SFDR 40.010 (40.000)
- ✓ ranges: Smooth (the part alone; outside the data or empty), Interpolate, the FFT spectrum of each range, the FFT filter, Convolution, ranges per Y, Average curves; none: as before
- ✓ phase diagram, ideal (Cu–Ni): the liquidus and solidus as the closed form (5.0e-16)
- ✓ phase diagram, ideal: three regions, no invariant; an alloy of 40 % starts to solidify at the closed form’s 1249.13 °C; its amounts add up to 1
- ✓ phase diagram, symmetric eutectic: at x = ½ and the 727.411 K of the horizontal tangent (727.411 K); the solvus as its closed form
- ✓ lever rule: the amounts add to 1 and give back the composition; above the eutectic the primary α as (½ − x) / (½ − x_α) (41.52 %)
- ✓ phase diagram presets: Pb–Sn eutectic 183.2 °C at 73.8 at% Sn, Ag–Cu 779.1 °C at 39.9 at% Cu; all liquid just above the melting points; the gap model with α₁ + α₂
- ✓ Phase diagram node: the lines and 6 regions; the point at 40 at% Sn, 220 °C in α + L, its amounts adding to 100 %; the alloy’s amounts (a second figure); its own shapes not moved by hand
- ✓ Phase diagram node: an enthalpy of fusion of 0 said
- ✓ Phase digitizer: 2 points a straight line, more a curve through every point (or straight pieces)
- ✓ Phase digitizer: a sharp turn a corner (no swing past it), a gentle one smooth (never out of its points), marked by hand
- ✓ Phase digitizer: a closed boundary an island (160000, 10000); the ends on the frame follow its edges as they move
- ✓ Phase digitizer: a point caught on the border, a corner first, nothing far away
- ✓ Phase digitizer: the frame one region; a lens three, filling the frame (3)
- ✓ Phase digitizer: an end short of a line or past it is closed onto it (3)
- ✓ Phase digitizer: a eutectic diagram, six regions (6)
- ✓ Phase digitizer: Draw regions labels every face once; the regions follow a line moved
- ✓ Phase digitizer: the border from the calibration, the pixel of a value (the inverse map)
- ✓ Phase digitizer: the lever rule; the tie line to the solidus and the liquidus, their phases, the amounts (α 28.20 50.00 %, L 71.80 50.00 %)
- ✓ Phase digitizer: a point in a region named without “+” is one phase
- ✓ Phase digitizer: the phases of a region; from its name (automatic names: two), or chosen
- ✓ Phase digitizer: the tie line to the frontier of its region (a loose line inside it ignored)
- ✓ Phase digitizer: the lever rule table, a sheet per boundary
- ✓ Phase digitizer: any X axis; no other component, no unit
- ✓ Phase digitizer: the other component, the rest to the total given
- ✓ Phase digitizer: waits for an image
- ✓ Phase digitizer: the data of an older node still open (a point as u, v; a region label, labelPos)
- ✓ Phase digitizer example: the lever rule at 45 wt% Ni, 1250 °C; L 35.06, α 56.86 wt% Ni (read 35.0616, 56.866)
- ✓ Phase digitizer: the total from the unit (100 for %, 1 for a fraction, else asked)
- ✓ Pb-Sn at 40 wt% Sn, 150 °C: α 12.30, β 98.52 wt% Sn, the arms a and b in their colours (read 12.34, 98.52)
- ✓ Pb-Sn cooled at 40 wt% Sn: liquidus 225.2 °C, eutectic 183 °C; primary α 50.23 %, then α 72.70 % (read 50.20, 49.80; 72.70, 27.30)
- ✓ Pb-Sn: 40 wt% Sn = 53.78 at% Sn (molar masses); the sheets of the paths and the microconstituents
- ✓ Steel 0.40 wt% C: proeutectoid ferrite 48.78 %, pearlite, then ferrite 94.34 % in all (read α 48.77, pearlite 51.23; α 94.34, Fe₃C 5.66)
- ✓ Steel 1.20 wt% C: Acm, proeutectoid cementite 7.41 % (read pearlite 92.60, Fe₃C 7.40)
- ✓ CO2: the phase read at a point (liquid; supercritical), no second phase
- ✓ CO2: compressed at −20 °C, the gas condenses at 15.60 atm; at −78.5 °C the solid sublimes at 1 atm (read 15.72, 0.988)
- ✓ EIS: Boukamp’s code read (series, parallel, a series inside), errors named
- ✓ EIS: the impedance of R + R ∥ C against its closed form; a CPE with n = 1 a capacitor; the short Warburg → R at low frequency
- ✓ EIS example: the columns by their names, R(RQ)W fitted with 2 points left out (R1 15, R2 220, Q1 Y0 3.01e-5, Q1 n 0.8698, W1 Y0 0.004005)
- ✓ EIS: the spoiled points in, the reduced χ² 0.0017 against 7.4e-6
- ✓ EIS: the same spectrum as \|Z\| and the phase, the frequency as ω: the same fit
- ✓ EIS: the columns guessed from other names (Frequency (Hz), Zre (Ohm), -Zim (Ohm))
- ✓ EIS: an element without a number takes the next one not written (R1,R2; R2,R1; R1,R3,Q1)
- ✓ EIS: every circuit of the list written back as it was read (with and without the numbers); the supercapacitor circuits in it
- ✓ EIS: the circuit edited on its drawing (R([RW]Q), ([R(RQ)]C), R, R(RC), R(RQ)Q)
- ✓ EIS: an element not needed found, the circuit without it proposed (W1 is not needed: its impedance → 0 over the spectrum (W1 Y0 = 1e+300); try R(RQ).)
- ✓ EIS: R² of the fit 0.999971 (Z′ 0.99997, Z″ 0.99997); the statistics under the parameters
- ✓ EIS: out the data and the smooth fit (176 points), the circuit transparent with its elements and values (R1 15 Ω R2 220 Ω Q1 Y0 3e-5 S·sⁿ
n 0.87 W1 W 0.00401 S·s^½); Nyquist and Bode drawn by Plots from them
- ✓ format 12 → 13: the Nyquist and Bode outputs of an EIS node become Plots of its data, connected to the Merge (eis-node-nyquist, eis-node-bode)
- ✓ format 13 → 14: a Report becomes a note with its texts ({"text":"Run 1\n\nBefore.\n\nFit\nThe dip moved."})
- ✓ EIS: ω (2πf) told from f by its values; columns without telling names taken by their places (and said so)
- ✓ EIS: the circuit drawn; every element on the page, none over another (55.099 × 31.434 mm)
- ✓ EIS: elements dropped on the drawing (R([RW]Q), R([WR]Q), (RC)(RQ), R(LRQ), R(RQ)W, R(RC), Q; moved ([R2R1]Q1), swapped Q1(R2R1))
- ✓ EIS: split and join; the branch between them (R([RQ]C)W, RR(QC)W, moved R1([R2Q1]W1), ([RRQW]L)); not across two branches
- ✓ EIS: columns without names chosen by their places (#0, #1, #2), shown by their letters; ω read as rad/s (“C” taken as −Z″ (mostly positive))
- ✓ EIS: a frequency range; the points outside it not fitted (49 of 69)
- ✓ EIS: a fit per range, the arc alone with R(RQ) (R1 15.28, R2 263.7, R² 0.99714)
- ✓ EIS: the fit on demand; not fitted before Start fit; after it, a change of the circuit only marked outdated (the last fit kept)
- ✓ catalog: every node type in nodes.json
- ✓ catalog: a node’s ports (types, what they are), options (type, meaning) and defaults
- ✓ catalog: the numbered ports of a Plot’s curves (y, y-&lt;k&gt; …)
- ✓ catalog: every port has its types
- ✓ catalog: every port the examples connect is listed
- ✓ checker: every example passes
- ✓ checker: an output that does not exist
- ✓ checker: an unknown type, an id used twice
- ✓ checker: a connection to a node that does not exist
- ✓ checker: data without the columns the nodes name: told (edge “e-replicates-out-plot-mean-dataset”: stats “replicates” has no output “out” (it gives: nothing).)
- ✓ checker: what every output holds (rows, the columns’ names)
- ✓ catalog: llms.txt, nodes.json, project.schema.json, recipes.json, check.mjs written
- ✓ catalog: llms.txt with the rules, the format version and the nodes
- ✓ catalog: check.mjs runs alone (ok)
- ✓ catalog: nothing private in the published files
- ✓ Help search: endings, synonyms, a word being typed, a typo, nothing found
- ✓ Help: a long help cut into 30 subsections (nothing lost); the words found highlighted, the piece around them
- ✓ Help search on the assistant's 162 questions: the right node in the first three for 80 % (no recipes yet)
- ✓ Symbols: filled, white and dot as before, a fill colour of their own with its opacity, the marks inside
- ✓ Scientific numbers: 1e16, 1E16, 1x10^16, 1*10^16, 1·10¹⁶, 10^16 and a decimal comma read alike; what is none of them, not a number
- ✓ Scientific numbers: written short only when very large or very small (1e16, 5e-9; 100, 0.01 as they are), and read back the same
- ✓ the app's version (1.0.0) as package.json's

</details>
