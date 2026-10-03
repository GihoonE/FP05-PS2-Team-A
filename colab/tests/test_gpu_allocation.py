"""Checks the baseline outputs, the DSIC claim, and random-order FCFS.

Run from the repository root:  python -m unittest discover -s tests -v
"""

import json
import random
import unittest
from pathlib import Path

from src.gpu_allocation import (
    Team,
    default_example,
    fcfs_all_orders,
    fcfs_allocation,
    misreport_sweep,
    outcome_metrics,
    team_rows,
    team_utility,
    vcg_allocation,
)

REPORTS = [step / 2 for step in range(21)]   # 0, 0.5, ..., 10


class BaselineTest(unittest.TestCase):
    def test_fixed_example_matches_committed_outputs(self):
        teams, order = default_example()
        fcfs = outcome_metrics(teams, fcfs_allocation(teams, order))
        vcg_outcome = vcg_allocation(teams)
        vcg = outcome_metrics(teams, vcg_outcome)
        self.assertEqual(fcfs["selected_teams"], "Team A; Team B; Team E; Team C; Team F")
        self.assertEqual(vcg["selected_teams"], "Team A; Team B; Team D; Team E")
        self.assertEqual((fcfs["gpu_hours_used"], vcg["gpu_hours_used"]), (95, 90))
        self.assertEqual((fcfs["carbon_adjusted_true_score"], vcg["carbon_adjusted_true_score"]), (15.6, 19.2))
        self.assertEqual(vcg["total_priority_payment_credits"], 96.0)
        # utility = true value - own carbon penalty - payment
        utilities = [row["utility_score_units"] for row in team_rows(teams, vcg_outcome)]
        self.assertEqual(utilities, [3.6, 1.2, 0.0, 3.6, 1.2, 0.0])


class TruthfulnessTest(unittest.TestCase):
    def assert_truthful_is_best(self, teams):
        for index in range(len(teams)):
            rows = misreport_sweep(teams, index, REPORTS + [teams[index].true_value])
            truthful = next(row for row in rows if row["truthful"])["utility_score_units"]
            for row in rows:
                self.assertLessEqual(row["utility_score_units"], truthful + 1e-9, row)

    def test_dsic_on_fixed_example(self):
        self.assert_truthful_is_best(default_example()[0])

    def test_dsic_at_every_carbon_weight(self):
        teams, _ = default_example()
        for step in range(11):
            penalty = step / 10
            outcome = vcg_allocation(teams, carbon_penalty_per_kg_co2e=penalty)
            for index, team in enumerate(teams):
                truthful = round(team_utility(team, outcome, index), 2)
                best = max(row["utility_score_units"] for row in misreport_sweep(
                    teams, index, REPORTS, carbon_penalty_per_kg_co2e=penalty))
                self.assertLessEqual(best, truthful + 1e-9, (penalty, team.name))

    def test_single_slot_without_carbon_is_a_vickrey_auction(self):
        # One slot and lambda = 0: the highest report wins and pays the second-highest report.
        teams = [Team("X", 100, 9, 9), Team("Y", 100, 6, 6), Team("Z", 100, 3, 3)]
        outcome = vcg_allocation(teams, carbon_penalty_per_kg_co2e=0.0)
        self.assertEqual(outcome.selected_indices, (0,))
        self.assertEqual(outcome.payments_score_units, {0: 6.0})

    def test_dsic_on_random_instances(self):
        rng = random.Random(206)
        for _ in range(100):
            teams = []
            for i in range(6):
                value = rng.randint(1, 10)
                teams.append(Team(f"Team {'ABCDEF'[i]}", 5 * rng.randint(1, 6), value, value))
            self.assert_truthful_is_best(teams)


class RandomOrderFcfsTest(unittest.TestCase):
    def test_all_720_orders_and_vcg_is_never_beaten(self):
        teams, order = default_example()
        rows = fcfs_all_orders(teams)
        self.assertEqual(len(rows), 720)
        self.assertIn(" -> ".join(teams[i].name for i in order), [row["arrival_order"] for row in rows])
        best_fcfs = max(row["carbon_adjusted_true_score"] for row in rows)
        vcg = outcome_metrics(teams, vcg_allocation(teams))["carbon_adjusted_true_score"]
        self.assertLessEqual(best_fcfs, vcg)


class NotebookSyncTest(unittest.TestCase):
    def test_notebook_model_cells_match_src(self):
        # The Colab notebook carries its own copy of the model; it must equal src/.
        root = Path(__file__).resolve().parents[1]
        notebook = json.loads((root / "notebooks" / "01_gpu_hour_vcg_allocation.ipynb").read_text())
        cells = ["".join(c["source"]).rstrip() for c in notebook["cells"]
                 if "model" in c["metadata"].get("tags", [])]
        self.assertEqual("\n\n\n".join(cells), (root / "src" / "gpu_allocation.py").read_text().rstrip())


if __name__ == "__main__":
    unittest.main()
