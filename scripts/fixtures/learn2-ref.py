# Reference values for the methods added to the classifier of Find like this > Review (src/image/learn.ts), from
# scikit-learn: GaussianNB, SVC (the RBF kernel, C = 1, gamma 'scale': its decision values, and Platt's sigmoid fitted on
# those of the examples by sklearn.calibration) and GradientBoostingClassifier (100 trees of depth 3, learning rate
# 0.1), each on the features standardized by StandardScaler; their probabilities on new points and their leave-one-out
# accuracies (the scaler fitted again in every fold).
# Run: python scripts/fixtures/learn2-ref.py  (writes learn2-ref.json beside it)
import json, os
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.naive_bayes import GaussianNB
from sklearn.svm import SVC
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import _sigmoid_calibration

rng = np.random.default_rng(23)
n, p = 40, 5
X = rng.normal(size=(n, p))
X[:, 1] = 0.6 * X[:, 0] + 0.8 * X[:, 1]
X[:, 3] *= 4.0
X[:, 4] += 10.0
y = ((1.2 * X[:, 0] - 0.8 * X[:, 2] ** 2 + 0.25 * X[:, 3] + rng.normal(scale=0.7, size=n)) > -0.5).astype(int)
Xt = rng.normal(size=(12, p))
Xt[:, 1] = 0.6 * Xt[:, 0] + 0.8 * Xt[:, 1]
Xt[:, 3] *= 4.0
Xt[:, 4] += 10.0


def svm_fit(X, y):
    sc = StandardScaler().fit(X)
    m = SVC(kernel='rbf', C=1.0, gamma='scale', tol=1e-10, shrinking=False).fit(sc.transform(X), y)
    a, b = _sigmoid_calibration(m.decision_function(sc.transform(X)), y)
    return lambda Z: m.decision_function(sc.transform(Z)), lambda Z: 1 / (1 + np.exp(a * m.decision_function(sc.transform(Z)) + b))


def nb_fit(X, y):
    sc = StandardScaler().fit(X)
    m = GaussianNB().fit(sc.transform(X), y)
    return lambda Z: m.predict_proba(sc.transform(Z))[:, 1]


def boost_fit(X, y):
    sc = StandardScaler().fit(X)
    m = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=0).fit(sc.transform(X), y)
    return lambda Z: m.predict_proba(sc.transform(Z))[:, 1]


def loo(fit):
    right = 0
    for i in range(n):
        k = np.arange(n) != i
        pr = fit(X[k], y[k])(X[i : i + 1])[0]
        right += int((pr >= 0.5) == (y[i] == 1))
    return right / n


dec, svm_prob = svm_fit(X, y)
out = {
    'X': X.tolist(),
    'y': y.tolist(),
    'Xt': Xt.tolist(),
    'svmDecision': dec(Xt).tolist(),
    'prob': {'svm': svm_prob(Xt).tolist(), 'nb': nb_fit(X, y)(Xt).tolist(), 'boost': boost_fit(X, y)(Xt).tolist()},
    'loo': {'svm': loo(lambda A, b: svm_fit(A, b)[1]), 'nb': loo(nb_fit), 'boost': loo(boost_fit)},
}
with open(os.path.join(os.path.dirname(__file__), 'learn2-ref.json'), 'w') as f:
    json.dump(out, f, indent=1)
print(out['loo'], out['prob']['svm'][:3], out['svmDecision'][:3])
