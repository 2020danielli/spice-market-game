"""Trains the bots' networks (PyTorch, GPU if available) on data from scripts/selfplay.ts.

Value: MLP 159→H→…→2 (win logit, margin/40), DEPTH hidden layers (env, default 3; shipped: 128x2).
Win target = average of the game result and the search's own estimate where available. Validation = last value file.
Policy: MLP over [state features2 + move features] → logit, trained with softmax cross-entropy against root visit
shares within each position group. Validation = groups from the last state/cand file.

usage: python3 train.py value  out.json hidden epochs 'data/g4-*.value.f32' [more globs...]
       python3 train.py policy out.json hidden epochs 'data/g4-*' (prefix glob; uses .state.f32 / .cand.f32)
       python3 train.py belief2 out.json hidden epochs 'data/g7-*.belief2.f32'  (whole-hand opponent model)
"""
import copy, glob, json, sys, time
import numpy as np


def rows(f, cols):
    a = np.fromfile(f, dtype=np.float32)
    return a[: len(a) // cols * cols].reshape(-1, cols)  # drop a half-written last row (killed generator)

import torch
import torch.nn as nn

F2, MF = 159, 28
mode, out, hidden, epochs = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
T = lambda a: torch.tensor(a, device=dev)
torch.manual_seed(0)


def mlp(n_in, n_out, depth):
    layers, d = [], n_in
    for _ in range(depth):
        layers += [nn.Linear(d, hidden), nn.ReLU(), nn.Dropout(0.1)]
        d = hidden
    return nn.Sequential(*layers, nn.Linear(d, n_out)).to(dev)


def export(model, n_in, path, extra):
    lin = [m for m in model if isinstance(m, nn.Linear)]
    r = lambda x: round(float(x), 5)
    json.dump({'features': n_in, **extra, 'layers': [{'w': [[r(v) for v in row] for row in l.weight.detach().cpu().numpy()],
               'b': [r(v) for v in l.bias.detach().cpu().numpy()]} for l in lin]}, open(path, 'w'), separators=(',', ':'))


def fit(model, step, val, n):
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=3e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)
    best, best_state, t0 = 9e9, None, time.time()
    for ep in range(epochs):
        model.train()
        perm = torch.randperm(n, device=dev)
        for s in range(0, n, 2048):
            loss = step(perm[s:s + 2048])
            opt.zero_grad(); loss.backward(); opt.step()
        sched.step()
        model.eval()
        with torch.no_grad():
            l, extra = val()
        tag = ''
        if l < best:
            best, best_state, tag = l, copy.deepcopy(model.state_dict()), ' *'
        print(f'epoch {ep + 1}: val {l:.4f} {extra}{tag} ({time.time() - t0:.0f}s)', flush=True)
    model.load_state_dict(best_state)
    return best


if mode == 'belief2':
    # Joint opponent-hand model: score every candidate hidden hand (multiset within the unseen pool).
    # score = log(ways to deal it) + f([position features, candidate features]); CE against the true hand.
    import itertools
    BF, CF = 259, 12
    files = sorted(f for p in sys.argv[5:] for f in glob.glob(p))
    load = lambda fs: np.concatenate([rows(f, BF + 12) for f in fs])
    val_a, tr = load(files[-1:]), load(files[:-1])
    print(f'belief2: train {len(tr):,} rows, val {len(val_a):,}')
    comps = {h: np.array([c for c in itertools.product(range(h + 1), repeat=6) if sum(c) == h], dtype=np.float32) for h in range(0, 8)}
    index = {h: {tuple(int(x) for x in c): k for k, c in enumerate(comps[h])} for h in comps}

    def buckets(a):
        t = a[:, BF:BF + 6].astype(np.int64)
        hs = t.sum(1)
        out = {}
        for h in range(1, 8):
            sel = np.where(hs == h)[0]
            if len(sel) == 0:
                continue
            idx = np.array([index[h][tuple(r)] for r in t[sel]])
            out[h] = (T(a[sel, :BF]), T(a[sel, BF + 6:]), T(idx))
        return out

    B, V = buckets(tr), buckets(val_a)
    C = {h: T(comps[h]) for h in comps}

    class Joint(nn.Module):
        def __init__(self):
            super().__init__()
            self.fx, self.fc = nn.Linear(BF, hidden), nn.Linear(CF, hidden, bias=False)
            self.rest = nn.Sequential(nn.ReLU(), nn.Dropout(0.1), nn.Linear(hidden, hidden), nn.ReLU(), nn.Dropout(0.1), nn.Linear(hidden, 1))

        def forward(self, x, pool, h):
            c = C[h]                                            # [n, 6]
            cf = torch.cat([c.expand(len(x), -1, -1) / 5, c / pool.clamp(min=1).unsqueeze(1)], 2)  # [b, n, 12]
            z = self.fx(x).unsqueeze(1) + self.fc(cf)           # [b, n, H]
            f = self.rest(z).squeeze(2)                         # [b, n]
            lg = lambda n: torch.lgamma(n + 1)
            ok = (c.unsqueeze(0) <= pool.unsqueeze(1)).all(2)
            ways = (lg(pool.unsqueeze(1)) - lg(c.unsqueeze(0)) - lg((pool.unsqueeze(1) - c.unsqueeze(0)).clamp(min=0))).sum(2)
            return torch.where(ok, ways + f, torch.full_like(f, -1e9)), torch.where(ok, ways, torch.full_like(f, -1e9))

    model = Joint().to(dev)

    def nll_bucket(b, h, i=None, uniform=False):
        x, pool, idx = b
        if i is not None:
            x, pool, idx = x[i], pool[i], idx[i]
        s, s0 = model(x, pool, h)
        s = s0 if uniform else s
        return -(torch.log_softmax(s, 1).gather(1, idx.unsqueeze(1))).sum(), len(x)

    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=3e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, epochs)

    def evaluate(uniform=False):
        model.eval()
        tot, n = 0.0, 0
        with torch.no_grad():
            for h, b in V.items():
                for s0 in range(0, len(b[0]), 1024):
                    l, k = nll_bucket(b, h, torch.arange(s0, min(s0 + 1024, len(b[0])), device=dev), uniform)
                    tot += l.item(); n += k
        model.train()
        return tot / n

    uniform = evaluate(uniform=True)
    best, best_state, t0 = 9e9, None, time.time()
    for ep in range(epochs):
        chunks = [(h, perm[s0:s0 + 512]) for h, b in B.items() for perm in [torch.randperm(len(b[0]), device=dev)] for s0 in range(0, len(b[0]), 512)]
        for j in torch.randperm(len(chunks)).tolist():
            h, i = chunks[j]
            l, k = nll_bucket(B[h], h, i)
            opt.zero_grad(); (l / k).backward(); opt.step()
        sched.step()
        v = evaluate()
        tag = ''
        if v < best:
            best, best_state, tag = v, copy.deepcopy(model.state_dict()), ' *'
        print(f'epoch {ep + 1}: val NLL/hand {v:.4f} (uniform dealing {uniform:.4f}){tag} ({time.time() - t0:.0f}s)', flush=True)
    model.load_state_dict(best_state)
    r = lambda x: round(float(x), 5)
    w0 = torch.cat([model.fx.weight, model.fc.weight], 1).detach().cpu().numpy()
    lin = [m for m in model.rest if isinstance(m, nn.Linear)]
    layers = [{'w': [[r(v) for v in row] for row in w0], 'b': [r(v) for v in model.fx.bias.detach().cpu().numpy()]}] + \
        [{'w': [[r(v) for v in row] for row in l.weight.detach().cpu().numpy()], 'b': [r(v) for v in l.bias.detach().cpu().numpy()]} for l in lin]
    json.dump({'features': BF + CF, 'kind': 'belief2', 'layers': layers}, open(out, 'w'), separators=(',', ':'))
    print(f'saved {out} (best val NLL/hand {best:.4f} vs uniform dealing {uniform:.4f})')

elif mode == 'belief':
    # Opponent-hand model: logits w_g; P(hidden card is g) ∝ pool_g · exp(w_g). Loss = NLL per hidden card.
    BF = 91
    files = sorted(f for p in sys.argv[5:] for f in glob.glob(p))
    val_a = rows(files[-1], BF + 12)
    tr = np.concatenate([rows(f, BF + 12) for f in files[:-1]])
    print(f'belief: train {len(tr):,} rows, val {len(val_a):,}')
    X, Tt, P = T(tr[:, :BF]), T(tr[:, BF:BF + 6]), T(tr[:, BF + 6:])
    Xv, Tv, Pv = T(val_a[:, :BF]), T(val_a[:, BF:BF + 6]), T(val_a[:, BF + 6:])
    model = mlp(BF, 6, 2)

    def nll(w, t, pool):
        logit = torch.where(pool > 0, torch.log(pool.clamp(min=1e-9)) + w, torch.full_like(w, -1e9))
        logp = torch.log_softmax(logit, 1)
        return -(t * logp.clamp(min=-1e4)).sum() / t.sum().clamp(min=1)

    step = lambda i: nll(model(X[i]), Tt[i], P[i])
    uniform = nll(torch.zeros_like(Tv), Tv, Pv).item()

    def val():
        l = nll(model(Xv), Tv, Pv).item()
        return l, f'(uniform card-counting baseline {uniform:.4f})'

    best = fit(model, step, val, len(X))
    export(model, BF, out, {'kind': 'belief'})
    print(f'saved {out} (best val NLL/card {best:.4f} vs uniform {uniform:.4f})')

elif mode == 'value':
    # .value.f32 = F2 + win + margin; .value3.f32 adds q (search win chance, NaN when none).
    # Win target = average of game result and search value where q exists (KataGo/"z+q" style: less noisy).
    files = sorted(f for p in sys.argv[5:] for f in glob.glob(p))

    def load(f):
        if f.endswith('.value3.f32'):
            return rows(f, F2 + 3)
        a = rows(f, F2 + 2)
        return np.concatenate([a, np.full((len(a), 1), np.nan, dtype=np.float32)], 1)

    val_a = load(files[-1])
    tr = np.concatenate([load(f) for f in files[:-1]])
    q = tr[:, F2 + 2]
    target = np.where(np.isnan(q), tr[:, F2], 0.5 * tr[:, F2] + 0.5 * np.nan_to_num(q))
    print(f'value: train {len(tr):,} rows ({(~np.isnan(q)).mean():.0%} with search value), val {len(val_a):,}')
    X, W, M = T(tr[:, :F2]), T(target.astype(np.float32)), T(tr[:, F2 + 1])
    Xv, Wv, Mv = T(val_a[:, :F2]), T(val_a[:, F2]), T(val_a[:, F2 + 1])  # validate against real results
    model = mlp(F2, 2, int(__import__('os').environ.get('DEPTH', 3)))
    bce = nn.BCEWithLogitsLoss()

    def step(i):
        o = model(X[i])
        return bce(o[:, 0], W[i]) + 0.5 * ((o[:, 1] - M[i]) ** 2).mean()

    def val():
        o = model(Xv)
        d = Wv != 0.5
        acc = ((o[:, 0] > 0).float() == Wv)[d].float().mean().item()
        mae = ((o[:, 1] - Mv).abs().mean() * 40).item()
        return bce(o[:, 0], Wv).item(), f'acc {acc:.3f} marginMAE {mae:.1f}'

    best = fit(model, step, val, len(X))
    export(model, F2, out, {})
    print(f'saved {out} (best val logloss {best:.4f})')

else:
    prefixes = sorted({f[:-len('.state.f32')] for p in sys.argv[5:] for f in glob.glob(p + '.state.f32')})

    def load(prefix):
        s = rows(prefix + '.state.f32', F2 + 1)
        c = rows(prefix + '.cand.f32', MF + 2)
        return s, c

    def build(prefs):
        ss, cs = zip(*[load(p) for p in prefs])
        s, c = np.concatenate(ss), np.concatenate(cs)
        # group ids are unique per file prefix; key by (file, id) and drop candidates whose state row was cut off
        keys_s = [(fi, int(g)) for fi, a in enumerate(ss) for g in a[:, 0]]
        keys_c = [(fi, int(g)) for fi, a in enumerate(cs) for g in a[:, 0]]
        index = {k: i for i, k in enumerate(keys_s)}
        keep = np.array([k in index for k in keys_c])
        c = c[keep]
        row = np.array([index[k] for k, ok in zip(keys_c, keep) if ok], dtype=np.int64)
        target = c[:, -1]
        # renormalize targets per group (unvisited candidates get 0)
        tot = np.zeros(len(s), dtype=np.float32); np.add.at(tot, row, target)
        target = target / np.maximum(tot[row], 1e-9)
        return T(s[:, 1:]), T(c[:, 1:1 + MF]), T(row), T(target), len(s)

    # Older generator runs used ids ≥ 2^24, which float32 can't store exactly (neighbouring groups merge): skip those.
    ok = [p for p in prefixes if rows(p + '.state.f32', F2 + 1)[:, 0].max(initial=0) < 2 ** 24]
    if len(ok) < len(prefixes):
        print('skipping files with ids >= 2^24:', [p.split('/')[-1] for p in prefixes if p not in ok])
    prefixes = ok
    Sv, Cv, Rv, Yv, nv = build(prefixes[-1:])
    S, C, R, Y, n = build(prefixes[:-1])
    print(f'policy: train {n:,} positions / {len(C):,} cands, val {nv:,} / {len(Cv):,}')
    model = mlp(F2 + MF, 1, 2)
    # group → candidate ranges (candidates are contiguous per group)
    def ranges(Rr, n_):
        counts = torch.bincount(Rr, minlength=n_)
        start = torch.cumsum(counts, 0) - counts
        return start, counts
    st, cnt = ranges(R, n)
    stv, cntv = ranges(Rv, nv)

    def group_loss(Ss, Cc, Rr, Yy, gidx, start, counts):
        # gather candidates of the chosen groups
        c = counts[gidx]
        offs = torch.repeat_interleave(start[gidx], c) + (torch.arange(int(c.sum()), device=dev) - torch.repeat_interleave(torch.cumsum(c, 0) - c, c))
        grp = torch.repeat_interleave(torch.arange(len(gidx), device=dev), c)
        x = torch.cat([Ss[Rr[offs]], Cc[offs]], 1)
        logit = model(x).squeeze(1)
        mx = torch.full((len(gidx),), -1e9, device=dev).scatter_reduce(0, grp, logit, 'amax')
        e = torch.exp(logit - mx[grp])
        z = torch.zeros(len(gidx), device=dev).index_add(0, grp, e)
        logp = logit - mx[grp] - torch.log(z[grp])
        ce = -torch.zeros(len(gidx), device=dev).index_add(0, grp, Yy[offs] * logp)
        top = torch.zeros(len(gidx), device=dev).scatter_reduce(0, grp, logit, 'amax')
        return ce.mean(), (grp, logit, Yy[offs])

    step = lambda i: group_loss(S, C, R, Y, i, st, cnt)[0]

    def val():
        idx = torch.arange(nv, device=dev)
        l, (grp, logit, y) = group_loss(Sv, Cv, Rv, Yv, idx, stv, cntv)
        # top-1 agreement: net's argmax == search's most-visited
        am_net = torch.full((nv,), -1e9, device=dev).scatter_reduce(0, grp, logit, 'amax')
        am_y = torch.full((nv,), -1.0, device=dev).scatter_reduce(0, grp, y, 'amax')
        hit = torch.zeros(nv, device=dev).index_add(0, grp, ((logit == am_net[grp]) & (y == am_y[grp])).float())
        return l.item(), f'top1 {(hit > 0).float().mean().item():.3f}'

    best = fit(model, step, val, n)
    export(model, F2 + MF, out, {'kind': 'policy'})
    print(f'saved {out} (best val CE {best:.4f})')
