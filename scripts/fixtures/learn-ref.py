# Reference values for the classifier of Find like this > Review (src/image/learn.ts), from scikit-learn:
# LogisticRegression (C = 1), LinearDiscriminantAnalysis (lsqr, Ledoit-Wolf shrinkage) and KNeighborsClassifier
# (k = 5, weighted by distance), each on the features standardized by StandardScaler; their probabilities on new
# points and their leave-one-out accuracies (the scaler fitted again in every fold).
# Run: python scripts/fixtures/learn-ref.py  (writes learn-ref.json beside it)
import json, os
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import LeaveOneOut, cross_val_score

rng = np.random.default_rng(11)
n, p = 30, 5
X = rng.normal(size=(n, p))
X[:, 1] = 0.6 * X[:, 0] + 0.8 * X[:, 1]  # two features correlated
X[:, 3] *= 4.0  # another scale
X[:, 4] += 10.0
y = ((1.2 * X[:, 0] - 0.8 * X[:, 2] + 0.25 * X[:, 3] + rng.normal(scale=0.7, size=n)) > 0).astype(int)
Xt = rng.normal(size=(10, p))
Xt[:, 1] = 0.6 * Xt[:, 0] + 0.8 * Xt[:, 1]
Xt[:, 3] *= 4.0
Xt[:, 4] += 10.0

models = {
    'logistic': lambda: make_pipeline(StandardScaler(), LogisticRegression(C=1.0, tol=1e-10, max_iter=10000)),
    'lda': lambda: make_pipeline(StandardScaler(), LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto')),
    'knn': lambda: make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5, weights='distance')),
}
out = {'X': X.tolist(), 'y': y.tolist(), 'Xt': Xt.tolist(), 'prob': {}, 'loo': {}}
for name, make in models.items():
    m = make().fit(X, y)
    out['prob'][name] = m.predict_proba(Xt)[:, 1].tolist()
    out['loo'][name] = float(cross_val_score(make(), X, y, cv=LeaveOneOut()).mean())
with open(os.path.join(os.path.dirname(__file__), 'learn-ref.json'), 'w') as f:
    json.dump(out, f, indent=1)
print(out['loo'], out['prob']['lda'][:3])
