# References for life data (src/engine/reliability.ts, the Probability plot with suspensions): the Python package
# `reliability` (Fitters: maximum likelihood with right censoring, rank regression, 3-parameter Weibull, Fisher bounds,
# plotting positions with Johnson's adjusted ranks) and `lifelines` (Kaplan–Meier with the exponential Greenwood
# interval). Run in an environment with both: python reliability-ref.py > reliability-ref.json
import json
import sys

import matplotlib

matplotlib.use('Agg')
import numpy as np
from reliability import Fitters, Probability_plotting
from lifelines import KaplanMeierFitter
from scipy import optimize, stats

rng = np.random.default_rng(20261017)
# a Weibull sample (β 1.8, η 1000), the 6 largest running at 1300 (a test stopped) and two removed early
t = np.sort(1000 * rng.weibull(1.8, 30))
fail = [float(v) for v in t if v <= 1300]
susp = [1300.0] * (len(t) - len(fail)) + [250.0, 600.0]
out = {'fail': fail, 'susp': susp}

def q(f, k):
    # the B life k % and its interval (reliability's quantiles table)
    tab = f.quantiles
    row = tab[np.isclose(tab['Quantile'], k / 100)].iloc[0]
    return [float(row['Point Estimate']), float(row['Lower Estimate']), float(row['Upper Estimate'])]

w = Fitters.Fit_Weibull_2P(failures=fail, right_censored=susp, method='MLE', CI=0.95, quantiles=[0.01, 0.1], print_results=False, show_probability_plot=False)
out['weibull_mle'] = {'beta': w.beta, 'eta': w.alpha, 'beta_ci': [w.beta_lower, w.beta_upper], 'eta_ci': [w.alpha_lower, w.alpha_upper], 'b10': q(w, 10), 'b1': q(w, 1), 'loglik': float(w.loglik)}
for m in ['RRX', 'RRY']:
    r = Fitters.Fit_Weibull_2P(failures=fail, right_censored=susp, method=m, print_results=False, show_probability_plot=False)
    out['weibull_' + m.lower()] = {'beta': r.beta, 'eta': r.alpha}
x, y = Probability_plotting.plotting_positions(failures=fail, right_censored=susp, a=0.3)
out['positions'] = {'x': [float(v) for v in x], 'y': [float(v) for v in y]}

# 3-parameter Weibull (γ ≈ 300) — maximum likelihood
t3 = np.sort(300 + 800 * rng.weibull(2.2, 40))
f3 = [float(v) for v in t3]
w3 = Fitters.Fit_Weibull_3P(failures=f3, method='MLE', print_results=False, show_probability_plot=False)
out['weibull3'] = {'x': f3, 'beta': w3.beta, 'eta': w3.alpha, 'gamma': w3.gamma}

# other distributions with suspensions, maximum likelihood
ln = Fitters.Fit_Lognormal_2P(failures=fail, right_censored=susp, print_results=False, show_probability_plot=False)
out['lognormal'] = {'mu': ln.mu, 'sigma': ln.sigma}
no = Fitters.Fit_Normal_2P(failures=fail, right_censored=susp, print_results=False, show_probability_plot=False)
out['normal'] = {'mu': no.mu, 'sigma': no.sigma}
ex = Fitters.Fit_Exponential_1P(failures=fail, right_censored=susp, print_results=False, show_probability_plot=False)
out['exponential'] = {'mean': 1 / ex.Lambda}
ga = Fitters.Fit_Gamma_2P(failures=fail, right_censored=susp, print_results=False, show_probability_plot=False)
out['gamma'] = {'shape': ga.beta, 'scale': ga.alpha}

# logistic and the largest-extreme Gumbel (scipy's), maximum likelihood with suspensions directly
def mle(dist, start):
    nll = lambda p: -(np.sum(dist.logpdf(fail, p[0], np.exp(p[1]))) + np.sum(dist.logsf(susp, p[0], np.exp(p[1]))))
    r = optimize.minimize(nll, start, method='Nelder-Mead', options={'xatol': 1e-12, 'fatol': 1e-12, 'maxiter': 40000})
    return [float(r.x[0]), float(np.exp(r.x[1]))]
out['logistic'] = mle(stats.logistic, [700.0, np.log(300.0)])
out['gumbel'] = mle(stats.gumbel_r, [600.0, np.log(300.0)])

# Kaplan–Meier (ties and suspensions)
km_t = [5, 8, 8, 12, 12, 15, 20, 22, 22, 30, 31, 40]
km_e = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1]
kmf = KaplanMeierFitter().fit(km_t, event_observed=km_e, alpha=0.05)
sf = kmf.survival_function_
ci = kmf.confidence_interval_
out['km'] = {'t': km_t, 'e': km_e, 'times': [float(v) for v in sf.index], 'S': [float(v) for v in sf.iloc[:, 0]], 'lo': [float(v) for v in ci.iloc[:, 0]], 'hi': [float(v) for v in ci.iloc[:, 1]]}

json.dump(out, sys.stdout, indent=1)
