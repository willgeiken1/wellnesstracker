#!/usr/bin/env python3
"""Rebuilds native/assets/atlas (geometry.json and the four SVG exports) from the web app's own
44-muscle body figure, ASSETS.advBody in logger/js/data/body.js. Dev tool only; needs shapely.

    python3 native/scripts/atlas/build_atlas.py

The web figure draws half a body and mirrors it, clips some muscles to a neighbour and overlays deep
muscles as dashed outlines. Native wants plain data: every shape already mirrored and clipped, as
straight-edge polygons (hit testing) with a matching path (drawing). Curves are flattened finely
enough to read as curves at phone size."""
import json, os, re
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
OUT = os.path.join(ROOT, 'native', 'assets', 'atlas')
DY, STEPS = 16, 4  # centre the 10..408 tall figure in the 0..440 viewBox

def assets():
    source = open(os.path.join(ROOT, 'logger', 'js', 'data', 'body.js')).read()
    return json.JSONDecoder().raw_decode(source[source.index('const ASSETS = ') + 15:])[0]

def subpaths(d):
    """Absolute M/L/C/Q/Z path data to a list of (points, closed)."""
    out, pts, closed = [], [], False
    for cmd, args in re.findall(r'([MLCQZ])([^MLCQZ]*)', d):
        n = [float(v) for v in re.findall(r'-?\d*\.?\d+', args)]
        if cmd == 'M':
            if pts: out.append((pts, closed))
            pts, closed = [(n[0], n[1])], False
            for i in range(2, len(n), 2): pts.append((n[i], n[i + 1]))
        elif cmd == 'L':
            for i in range(0, len(n), 2): pts.append((n[i], n[i + 1]))
        elif cmd == 'C':
            for i in range(0, len(n), 6):
                p0, p1, p2, p3 = pts[-1], (n[i], n[i + 1]), (n[i + 2], n[i + 3]), (n[i + 4], n[i + 5])
                for s in range(1, STEPS + 1):
                    t = s / STEPS; u = 1 - t
                    pts.append(tuple(u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k] for k in (0, 1)))
        elif cmd == 'Q':
            for i in range(0, len(n), 4):
                p0, p1, p2 = pts[-1], (n[i], n[i + 1]), (n[i + 2], n[i + 3])
                for s in range(1, STEPS + 1):
                    t = s / STEPS; u = 1 - t
                    pts.append(tuple(u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k] for k in (0, 1)))
        else: closed = True
    if pts: out.append((pts, closed))
    return out

def area(d): return unary_union([Polygon(p).buffer(0) for p, _ in subpaths(d) if len(p) > 2])
def parts(geom, min_area=0.5):
    items = list(geom.geoms) if hasattr(geom, 'geoms') else [geom]
    return [g for g in items if isinstance(g, Polygon) and g.area >= min_area]
fmt = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
def tidy(points):
    pts = [(round(x, 1), round(y + DY, 1)) for x, y in points]
    return [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
flip = lambda pts: [(round(200 - x, 1), y) for x, y in pts]
def ring(poly):
    pts = tidy(poly.exterior.coords[:-1])
    return pts[:-1] if len(pts) > 1 and pts[0] == pts[-1] else pts
def draw(pts, closed=True): return 'M' + ' L'.join(f'{fmt(x)},{fmt(y)}' for x, y in pts) + (' Z' if closed else '')

def side(figure, name):
    clips = [area(d) for d in figure['clips']]
    skin_parts, lines, muscles = [area(figure['head'])], [], []
    for kind, key, d, *rest in figure['els']:
        if kind in 'bs':
            skin_parts.append(area(d))
            if kind == 's': lines += subpaths(d)
        elif kind == 'o': lines += subpaths(d)
        else:
            shape = area(d).intersection(clips[rest[0]]) if kind == 'c' else area(d)
            if kind != 'd': skin_parts.append(shape)  # arms and legs are muscle shapes only; the silhouette needs them
            rings = [ring(p) for p in parts(shape)]
            if not rings: raise SystemExit(f'{name} {key}: no visible area')
            rings += [flip(r) for r in rings]
            muscle = {'id': key, 'polygons': [[list(p) for p in r] for r in rings], 'd': ' '.join(draw(r) for r in rings)}
            if kind == 'd': muscle['deep'] = True
            muscles.append(muscle)
    lines += subpaths(figure['detail']) + subpaths(figure['head'])
    half = unary_union(skin_parts)
    whole = unary_union([half, Polygon([(200 - x, y) for x, y in half.exterior.coords]) if isinstance(half, Polygon) else
                         unary_union([Polygon([(200 - x, y) for x, y in p.exterior.coords]) for p in parts(half)])]).buffer(0.01)
    skin = ' '.join(draw(ring(p)) for p in parts(whole))
    mid = [(100, 119), (100, 216)] if name == 'front' else [(100, 50), (100, 230)]
    strokes = [(tidy(p), c) for p, c in lines]
    strokes = strokes + [(flip(p), c) for p, c in strokes] + [(tidy(mid), False)]
    return {'skin': skin, 'lines': ' '.join(draw(p, c) for p, c in strokes), 'muscles': muscles}

def svg(shape):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 440">'
            f'<g id="skin"><path fill="#2c2c33" d="{shape["skin"]}"/></g><g id="muscles" fill="#3a3a44" stroke="#111" stroke-width=".9">'
            + ''.join(f'<path id="{m["id"]}"{" stroke-dasharray=\"2.2 1.6\" fill=\"none\" stroke=\"#9b9ba1\"" if m.get("deep") else ""} d="{m["d"]}"/>' for m in shape['muscles'])
            + f'</g><g id="lines"><path fill="none" stroke="#111" stroke-width=".8" d="{shape["lines"]}"/></g></svg>\n')

if __name__ == '__main__':
    body = assets()['advBody']
    geometry = {sex: {name: side(body[sex][name], name) for name in ('front', 'back')} for sex in ('male', 'female')}
    json.dump(geometry, open(os.path.join(OUT, 'geometry.json'), 'w'), separators=(',', ':'))
    for sex in geometry:
        for name in geometry[sex]: open(os.path.join(OUT, f'{sex}-{name}.svg'), 'w').write(svg(geometry[sex][name]))
    keys = {sex: sorted({m['id'] for name in geometry[sex] for m in geometry[sex][name]['muscles']}) for sex in geometry}
    print({sex: len(k) for sex, k in keys.items()}, 'svg bytes', sum(os.path.getsize(os.path.join(OUT, f'{s}-{n}.svg')) for s in geometry for n in geometry[s]),
          'json bytes', os.path.getsize(os.path.join(OUT, 'geometry.json')))
