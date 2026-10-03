# Transparent GPU-Hour Allocation.

[![Hugging Face Space](https://img.shields.io/badge/Hugging%20Face-Live%20Space-FFD21E?logo=huggingface&logoColor=black)](https://huggingface.co/spaces/dku-comsci-econ206-2026/PS2_Team_A)
[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/14eo8a2HWUbbBtv-m-ia4xRiL4V6Iwtun)

**COMPSCI/ECON 206, Team A (FP5)**
*Mustafa Ayub Khan · Temur Akhtamjonov · Gihun Lee*

> **Research question.** How should an organization allocate **100 shared GPU-hours** when project teams have private project values but observable GPU requests and estimated emissions, and can a published, carbon-aware allocation rule do better than first come, first served without inviting misreporting?

![Figure 1: demand exceeds capacity; FCFS vs. carbon-aware VCG; outcomes over all 720 FCFS orders; truthful reporting check](colab/figures/teaser.png)

We compare two rules on the same six teams:

1. **Random-order FCFS (baseline):** teams arrive in a random order, and each full request is served while capacity remains. We compute all 720 orders exactly.
2. **Carbon-aware VCG priority mechanism:** teams simultaneously report a private project value. The rule selects the feasible group with the highest total of reported value minus a published carbon penalty, and each selected team pays its VCG externality in priority credits.

## Research artifacts

| Artifact | Link | What it shows |
|---|---|---|
| Verified release | [`ps2-review` tag](https://github.com/GihoonE/COMPSCI206-PS2/tree/ps2-review) | The exact code, notebook, and outputs reported below |
| Colab notebook | [Open in Colab](https://colab.research.google.com/drive/14eo8a2HWUbbBtv-m-ia4xRiL4V6Iwtun) | Self-contained model code, proof sketch, utility plots, checks, fresh-run record |
| Hugging Face Space | [PS2_Team_A](https://huggingface.co/spaces/dku-comsci-econ206-2026/PS2_Team_A) | Play one team: FCFS, then VCG with a prediction, allocation and payment audit, a *what-if* report slider, and reflection |

## Game design: a static game with incomplete information

- **Static:** every team submits one report at the same time and nobody sees the others' reports first. It is not an ascending (English) auction.
- **Incomplete information:** each team knows its own project value but not the other teams' values.

### Variables

- $`i \in \lbrace A, B, C, D, E, F \rbrace`$: a project team (player)
- $`v_i`$: true project value, **private** (baseline: 3, 6, or 9)
- $`r_i`$: reported value, the team's action (a strategy maps $`v_i \mapsto r_i`$)
- $`d_i`$: GPU-hours requested, **public**
- $`e_i = 0.24\,d_i`$: estimated emissions in kg CO₂e, **public**
- $`\lambda = 0.5`$: carbon penalty per kg CO₂e
- $`s_i = r_i - \lambda e_i = r_i - 0.12\,d_i`$: selection score
- $`K = 100`$: shared GPU-hours
- $`S`$: a group of teams, feasible if $`\sum_{i \in S} d_i \le K`$
- $`S^*`$: the feasible group with the largest $`\sum_{i \in S} s_i`$ (all $`2^6 = 64`$ groups are checked)
- $`W^*_{-i}`$: the best total score the other teams could reach if $`i`$ were absent
- $`p_i = W^*_{-i} - \sum_{j \in S^* \setminus \lbrace i \rbrace} s_j`$: VCG payment in score units (×10 = priority credits)
- $`u_i = v_i - \lambda e_i - p_i`$ if $`i \in S^*`$, otherwise $`u_i = 0`$: payoff

### Timing

1. Each team learns its own $`v_i`$.
2. All teams submit $`r_i`$ at the same time.
3. The rule selects $`S^*`$, allocates the full $`d_i`$ to each $`i \in S^*`$, and charges $`p_i`$.

Truthful reporting is optimal whatever the others report (DSIC), so teams need no beliefs about the other teams' values.

### Solution concept

| Format | Game class + solution | Equilibrium condition used | Benchmark strategy |
|---|---|---|---|
| Carbon-aware multi-team VCG | Static + incomplete; direct mechanism; **DSIC (therefore also BNE)** | $`u_i(v_i, v_i, r_{-i}) \ge u_i(v_i, r_i, r_{-i})\ \forall r_i, r_{-i}`$ | $`r_i = v_i`$ |

- **Utility.** A selected team bears its own announced carbon penalty: $`u_i = v_i - \lambda e_i - p_i`$ if selected, and 0 otherwise.
- **Payment.** $`p_i = W^*_{-i} - \sum_{j \in S^* \setminus \lbrace i \rbrace}(r_j - \lambda e_j)`$, where $`W^*_{-i}`$ is the best total score of the other teams without $`i`$.
- **Why truth is dominant (Groves argument).** Substituting the payment gives

  ```math
  u_i = \Bigl(\text{total score of } S^* \text{ evaluated at } i\text{'s true value}\Bigr) - W^*_{-i}.
  ```

  The second term does not depend on $`r_i`$, and reporting $`r_i = v_i`$ makes the mechanism maximize exactly the first term. Therefore truth is optimal for every $`r_{-i}`$. The full sketch is in the notebook.
- **Why the carbon term matters.** If utility were $`v_i - p_i`$, the best report would be $`r_i = v_i + \lambda e_i`$, and DSIC would fail.
- **Special case.** With one item and $`\lambda = 0`$, the rule is the Vickrey second-price auction.

DSIC needs priority credits to carry a real future opportunity cost. The code checks the rule, not that condition.

## Parameters

| Symbol | Meaning | Value |
|---|---|---|
| $`K`$ | shared GPU-hours | 100 |
| $`n`$ | project teams | 6 |
| $`d_i`$ | GPU-hours requested (observable) | A, D: 25 · B, E: 20 · C, F: 15 |
| $`v_i`$ | true project value (private) | A, D: 9 · B, E: 6 · C, F: 3 (High / Medium / Low) |
| $`r_i`$ | reported value | $`r_i = v_i`$ in the baseline; varied 0–10 in the truthfulness check |
| $`e_i`$ | estimated emissions, kg CO₂e | $`0.24\,d_i`$ |
| $`\lambda`$ | carbon penalty per kg CO₂e | 0.5 (sweep: 0 to 1 in steps of 0.1) |
| — | priority credits per score unit | 10 |
| — | FCFS arrival orders | all 6! = 720, plus one illustrative order A→B→E→C→D→F |

## Algorithm (language-independent pseudocode)

```text
FCFS(order):
    remaining ← K
    for i in order:
        if d_i ≤ remaining: serve i; remaining ← remaining − d_i
Repeat FCFS for all 720 orders.

VCG(r):
    feasible ← all 64 groups S with Σ_{i∈S} d_i ≤ K
    S* ← argmax_{S ∈ feasible} Σ_{i∈S} (r_i − λe_i)      # ties: more teams, then earlier team
    for i in S*:
        W*_{−i} ← best feasible total without i
        p_i ← W*_{−i} − Σ_{j∈S*\i} (r_j − λe_j)          # in score units; ×10 = credits
    u_i ← v_i − λe_i − p_i if i ∈ S*, else 0

Truthfulness check:
    for each team i, for r_i in 0, 0.5, …, 10 (rivals fixed):
        run VCG; confirm that u_i(r_i) ≤ u_i(v_i)

Carbon-weight sweep:
    for λ in 0, 0.1, …, 1: run VCG and the truthfulness check again

Two-GPU-pool extension (notebook only):
    choose who is served AND on which pool (3^6 = 729 assignments); same payments and check
```

## Results (actual output)

**Fixed example** (`colab/outputs/summary.csv`):

| Metric | FCFS (order A→B→E→C→D→F) | Carbon-aware VCG |
|---|---:|---:|
| Selected teams | A, B, E, C, F | A, B, D, E |
| Teams served | 5 | 4 |
| GPU-hours used / unused | 95 / 5 | 90 / 10 |
| Total true project value | 27 | 30 |
| Carbon-adjusted true score | 15.6 | 19.2 |
| Estimated emissions (kg CO₂e) | 22.8 | 21.6 |
| Priority-credit payments | 0 | 96 (24 per winner) |

**Random-order FCFS over all 720 orders** (`colab/outputs/fcfs_all_orders.csv`):

| Metric | FCFS mean | FCFS min–max | VCG |
|---|---:|---:|---:|
| Teams served | 4.93 | 4–5 | 4 |
| GPU-hours used | 97.0 | 90–100 | 90 |
| Total true project value | 28.6 | 27–30 | 30 |
| Carbon-adjusted true score | 16.96 | 15.6–19.2 | 19.2 |
| Estimated emissions (kg CO₂e) | 23.28 | 21.6–24.0 | 21.6 |

Under FCFS, each 25- or 20-hour team is served in 76.7% of orders, and each 15-hour team in 93.3%. No arrival order beats the VCG score; only 48 of 720 orders tie it. FCFS serves slightly more teams on average, but it uses more capacity and emits more.

**Utility and payments under VCG** (`colab/outputs/vcg_team_results.csv`): A and D each have utility 9 − 3 − 2.4 = 3.6. B and E each have 6 − 2.4 − 2.4 = 1.2. C and F are not selected, so their utility is 0.

**Truthfulness check** (`colab/outputs/truthfulness_check.csv`): for all six teams, no report in 0, 0.5, …, 10 gives higher utility than the true value.

**Reduced payoff matrix** (notebook; a labeled simplification in which only Teams C and E choose and the other four report truthfully). Each cell is $`(u_C, u_E)`$ and the selected group:

| | E truthful ($`r_E = 6`$) | E underreports ($`r_E = 4`$) |
|---|---|---|
| C truthful ($`r_C = 3`$) | (0, 1.2), ABDE | (0.8, 0), ABCDF |
| C overreports ($`r_C = 4.5`$) | (−1.2, 0), ABCDF | (0.8, 0), ABCDF |

Truth is weakly dominant for both teams, so (truthful, truthful) is the equilibrium. The lower-left cell shows the externality: C's overreport removes the truthful Team E.

**Carbon-weight sweep** (`colab/outputs/lambda_sweep.csv`; demands, values, capacity, and algorithm fixed):

| $`\lambda`$ | Selected teams | GPU-hours | Emissions (kg CO₂e) | Payment per winner | Utility A, D | Utility B, E | Truth optimal |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 0.0 | A, B, C, D, F | 100 | 24.0 | 6.0 (C, F: 3.0) | 3.0 | 0.0 | ✓ |
| 0.1 | A, B, D, E | 90 | 21.6 | 5.28 | 3.12 | 0.24 | ✓ |
| 0.3 | A, B, D, E | 90 | 21.6 | 3.84 | 3.36 | 0.72 | ✓ |
| **0.5** | A, B, D, E | 90 | 21.6 | 2.4 | 3.6 | 1.2 | ✓ |
| 0.7 | A, B, D, E | 90 | 21.6 | 0.96 | 3.84 | 1.68 | ✓ |
| 0.9 | A, B, D, E | 90 | 21.6 | 0 | 3.6 | 1.68 | ✓ |
| 1.0 | A, B, D, E | 90 | 21.6 | 0 | 3.0 | 1.2 | ✓ |

- **What $`\lambda`$ changes.** It moves each team's selection boundary, the price, and the size of the payoff. At low $`\lambda`$ the low-value teams C and F still compete for a seat, so winners pay more; as $`\lambda`$ rises, competition fades and payments fall to zero, while each winner's own carbon charge grows.
- **What it does not change.** Truthful reporting is optimal for every team at every $`\lambda`$ in the sweep. $`\lambda`$ is a policy weight on carbon, not an incentive parameter, and it cannot be chosen by maximizing project value (on value alone, $`\lambda = 0`$ always wins).
- **Why the group changes at $`\lambda = 0`$.** Groups {A, B, C, D, F} and {A, B, D, E} tie on value (30). The public tie-break picks more teams; any $`\lambda > 0`$ breaks the tie toward the group that uses fewer GPU-hours.
- **Beyond the sweep.** Above $`\lambda = 1.25`$ only A and D remain, and above $`\lambda = 1.5`$ no team is served: a carbon weight that is too heavy stops research.

**Extension: two GPU types** (notebook only). Reviewer question: real clusters have more than one GPU type. The same 100 GPU-hours are split into an H100 pool (50 h, 0.24 kg CO₂e per GPU-hour) and an A100 pool (50 h, 0.14 kg), and the mechanism also chooses each team's pool.

| | One pool (baseline) | Two pools |
|---|---|---|
| Selected teams | A, B, D, E | A, B, D, E |
| Placement | — | A, D on A100; B, E on H100 |
| Emissions (kg CO₂e) | 21.6 | 16.6 (−23%) |
| kg CO₂e per unit value | 0.72 | 0.55 |
| Payments (score units) | 2.4 each | A, D: 3.65; B, E: 2.4 |
| Utilities | A, D: 3.6; B, E: 1.2 | unchanged |
| Truth optimal for all teams | ✓ | ✓ |

The largest jobs move to the cleaner pool, and truthful reporting stays optimal. The extension assumes a job needs the same GPU-hours on either type; in practice an A100 is slower, so this is a structural check, not an emissions estimate.

## Reproduce

The model, script, and tests need only the Python standard library (Python 3.9 or newer).

**Colab:** open the [shared notebook](https://colab.research.google.com/drive/14eo8a2HWUbbBtv-m-ia4xRiL4V6Iwtun) (a copy is in `colab/notebooks/01_gpu_hour_vcg_allocation.ipynb`), choose *Runtime → Run all*, and check that the last cell prints `PASS` for all nine checks. The notebook is self-contained: the full model code is inside it, so it needs no clone and no installs.

**Local:**

```bash
git clone --branch ps2-review https://github.com/GihoonE/COMPSCI206-PS2.git
cd COMPSCI206-PS2/colab
python run_simulation.py                      # prints results, rewrites outputs/*.csv
git diff --exit-code outputs/                 # expected = actual: no diff means the committed outputs were reproduced
python -m unittest discover -s tests -v       # baseline, DSIC (fixed, every λ, 100 random games), Vickrey special case, 720-order FCFS, notebook = src
```

`matplotlib` is needed only for the notebook's utility plots (preinstalled on Colab): `python -m pip install -r colab/requirements.txt`.

## Verification record

| Date | Environment | Command | Result |
|---|---|---|---|
| 2026-09-26 | Python 3.14.7, macOS (arm64) | `python colab/run_simulation.py` then `git diff --exit-code colab/outputs/` | outputs reproduced; all six truthfulness checks PASS |
| 2026-09-26 | Python 3.14.7, macOS (arm64) | `cd colab && python -m unittest discover -s tests -v` | 5 tests OK |
| 2026-09-26 | Jupyter `nbconvert --execute` in an empty folder (no repository), matplotlib 3.11 | notebook fresh run | 7 / 7 checks PASS, utility plot rendered (saved in the notebook) |
| 2026-10-03 | Python 3.14.7, macOS (arm64) | `python colab/run_simulation.py` then `git diff --exit-code colab/outputs/` | earlier outputs reproduced; new `lambda_sweep.csv` written; truth optimal at all 11 values of λ |
| 2026-10-03 | Python 3.14.7, macOS (arm64) | `cd colab && python -m unittest discover -s tests -v` | 7 tests OK |
| 2026-10-03 | Jupyter `nbclient` in an empty folder (no repository), matplotlib | notebook fresh run | 9 / 9 checks PASS, including the λ sweep and the two-GPU-pool extension |

## Repository structure

```text
README.md                          this file
LICENSE                            MIT license for the code
colab/                             computational artifact (Colab simulation)
├── notebooks/01_gpu_hour_vcg_allocation.ipynb   self-contained notebook: model code, proof sketch, plots, λ sweep,
│                                  two-GPU-pool extension, fresh-run record
├── src/gpu_allocation.py          model, exact subset solver, FCFS, VCG payments, utility, truthfulness sweep, all-orders FCFS
├── run_simulation.py              runs everything and writes colab/outputs/
├── tests/test_gpu_allocation.py   automated checks, including that the notebook's model cells equal src/
├── outputs/                       summary.csv, fcfs_team_results.csv, vcg_team_results.csv,
│                                  fcfs_all_orders.csv, truthfulness_check.csv, lambda_sweep.csv
├── figures/teaser.png             the README figure above
└── requirements.txt
hf-space/                          behavioral artifact (static Hugging Face Space: index.html, app.js, style.css)
└── plays.csv                      five self-plays by the authors, anonymous (observed, exploratory)
PS2-FP05-TeamA-Overleaf-Source/    proposal LaTeX source (same content as the .zip)
PS2-FP05-TeamA.pdf                 compiled proposal
PS2-FP05-TeamA-A0-Poster.pdf/.pptx A0 poster
```

## Evidence boundary and limitations

- **Computed, not observed.** Every number here comes from the formal model. The code checks the announced allocation and payment rule, but it cannot verify a team's true private value.
- **Behavioral evidence lives in the Hugging Face Space and is exploratory.** Five completed self-plays by the three authors (October 3, 2026) are exported in `hf-space/plays.csv`: no misreport raised the player's utility, but three of five players overreported, and the written reflections are blank. The Space's rival teams are simulated and truthful. Classroom play is a small, self-selected sample with hypothetical stakes, so it is not population-level causal evidence.
- **Assumptions.** The 0.24 kg CO₂e per GPU-hour rate and $`\lambda = 0.5`$ are announced classroom-model assumptions, not measured emissions for real workloads. Location- and time-specific emissions are out of scope; heterogeneous hardware appears only in the two-GPU-pool extension, which ignores speed differences.
- **DSIC condition.** Truthful reporting is dominant only if priority credits have a real future opportunity cost and teams internalize the announced carbon penalty.
- **Scale.** Exhaustive search (2ⁿ groups) is exact for six teams. Larger n would need an integer-programming solver.

## License

Code in `colab/` and `hf-space/` is released under the [MIT License](LICENSE). The proposal, poster, and figures remain the authors' work; cite the proposal if you reuse them.

## Attribution

Theory: Vickrey (1961), Clarke (1971), and Groves (1973) for the VCG mechanism. The course materials for COMPSCI/ECON 206 provide the solution-concept framing. AI assistance is disclosed in Appendix A.3 of the proposal. Full references are in the proposal.
