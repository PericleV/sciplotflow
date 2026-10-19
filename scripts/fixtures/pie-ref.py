# The reference values of npm run check for the Pie chart node (matplotlib pie: the wedges' angles):
# python -W ignore scripts/fixtures/pie-ref.py
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

x = [15, 30, 45, 10]
out = {'x': x}
for key, start, ccw in [('ccw0', 0, True), ('cw90', 90, False), ('ccw140', 140, True)]:
    fig, ax = plt.subplots()
    wedges, *_ = ax.pie(x, startangle=start, counterclock=ccw)
    out[key] = [[w.theta1, w.theta2] for w in wedges]
    plt.close(fig)
# matplotlib's nested pie (donut) example: radii of the two rings with width 0.3
fig, ax = plt.subplots()
outer, *_ = ax.pie([60, 32, 92.3], radius=1, wedgeprops=dict(width=0.3))
inner, *_ = ax.pie([37, 23, 1.2, 0.5, 12, 3], radius=0.7, wedgeprops=dict(width=0.3))
out['nested'] = {'outer': [[w.r - w.width, w.r] for w in outer][:1], 'inner': [[w.r - w.width, w.r] for w in inner][:1]}
plt.close(fig)
with open(os.path.join(os.path.dirname(__file__), 'pie-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', out['cw90'])
