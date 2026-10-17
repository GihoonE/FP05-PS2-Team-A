"""Exact carbon-aware VCG allocation of 100 shared GPU-hours.

Team A's model compares random-order FCFS with a static, incomplete-information
direct mechanism. Each real project team has a private project value report and
observable GPU demand/emissions:

    e_i = 0.24 * d_i
    reported_score_i = report_i - 0.5 * e_i = report_i - 0.12 * d_i

The mechanism selects the feasible group with the greatest total reported
score. With six teams, every one of the 2**6 = 64 possible groups is checked.
Selected teams pay VCG externality prices in non-transferable priority credits.

A team's utility counts its own announced carbon penalty:

    u_i = v_i - 0.5 * e_i - p_i   if selected, else 0

Under this utility, truthful reporting (r_i = v_i) is a dominant strategy (DSIC);
`misreport_sweep` checks this numerically.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations, permutations
from statistics import mean
from typing import Iterable, Sequence

CAPACITY_GPU_HOURS = 100.0
EMISSIONS_KG_CO2E_PER_GPU_HOUR = 0.24
CARBON_PENALTY_PER_KG_CO2E = 0.5
PRIORITY_CREDITS_PER_SCORE_UNIT = 10.0
# C2: fixed credits per team per allocation round; no top-ups, spent credits are retired.
ROUND_BUDGET_CREDITS = 100.0


@dataclass(frozen=True)
class Team:
    """One real project team's request and private project-value report."""

    name: str
    demand_gpu_hours: float
    true_value: float
    reported_value: float

    @property
    def emissions_kg_co2e(self) -> float:
        return EMISSIONS_KG_CO2E_PER_GPU_HOUR * self.demand_gpu_hours

    @property
    def reported_score(self) -> float:
        return self.reported_value - CARBON_PENALTY_PER_KG_CO2E * self.emissions_kg_co2e

    @property
    def true_score(self) -> float:
        return self.true_value - CARBON_PENALTY_PER_KG_CO2E * self.emissions_kg_co2e


@dataclass(frozen=True)
class AllocationOutcome:
    mechanism: str
    selected_indices: tuple[int, ...]
    capacity_gpu_hours: float
    payments_score_units: dict[int, float]
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E


def all_subsets(n_teams: int) -> Iterable[tuple[int, ...]]:
    for group_size in range(n_teams + 1):
        yield from combinations(range(n_teams), group_size)


def total_demand(teams: Sequence[Team], selected: Sequence[int]) -> float:
    return sum(teams[index].demand_gpu_hours for index in selected)


def reported_score(team: Team, carbon_penalty_per_kg_co2e: float) -> float:
    """Reported project value minus the announced carbon penalty."""

    return team.reported_value - carbon_penalty_per_kg_co2e * team.emissions_kg_co2e


def true_score(team: Team, carbon_penalty_per_kg_co2e: float) -> float:
    """True project value minus the announced carbon penalty."""

    return team.true_value - carbon_penalty_per_kg_co2e * team.emissions_kg_co2e


def total_reported_score(
    teams: Sequence[Team],
    selected: Sequence[int],
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E,
) -> float:
    return sum(
        reported_score(teams[index], carbon_penalty_per_kg_co2e)
        for index in selected
    )


def total_true_score(
    teams: Sequence[Team],
    selected: Sequence[int],
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E,
) -> float:
    return sum(
        true_score(teams[index], carbon_penalty_per_kg_co2e)
        for index in selected
    )


def best_feasible_subset(
    teams: Sequence[Team],
    capacity_gpu_hours: float = CAPACITY_GPU_HOURS,
    excluded_index: int | None = None,
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E,
) -> tuple[int, ...]:
    """Find the exact highest-reported-score group under the capacity limit.

    Ties are resolved by serving more teams, then by deterministic team order.
    This tie-breaker is public and used in every counterfactual calculation.
    """

    feasible = [
        subset
        for subset in all_subsets(len(teams))
        if excluded_index not in subset
        and total_demand(teams, subset) <= capacity_gpu_hours
    ]
    return max(
        feasible,
        key=lambda subset: (
            round(
                total_reported_score(
                    teams, subset, carbon_penalty_per_kg_co2e
                ),
                10,
            ),
            len(subset),
            tuple(-index for index in subset),
        ),
    )


def vcg_allocation(
    teams: Sequence[Team],
    capacity_gpu_hours: float = CAPACITY_GPU_HOURS,
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E,
) -> AllocationOutcome:
    """Allocate by reported score and charge each winner's VCG externality."""

    selected = best_feasible_subset(
        teams, capacity_gpu_hours, carbon_penalty_per_kg_co2e=carbon_penalty_per_kg_co2e
    )
    payments: dict[int, float] = {}
    for winner in selected:
        # Best score available to everyone else if this winner had not participated.
        without_winner = best_feasible_subset(
            teams,
            capacity_gpu_hours,
            excluded_index=winner,
            carbon_penalty_per_kg_co2e=carbon_penalty_per_kg_co2e,
        )
        best_others_without_winner = total_reported_score(
            teams, without_winner, carbon_penalty_per_kg_co2e
        )

        # The score earned by everyone else in the actual winning group.
        actual_others_score = total_reported_score(
            teams,
            tuple(index for index in selected if index != winner),
            carbon_penalty_per_kg_co2e,
        )
        payments[winner] = round(
            max(0.0, best_others_without_winner - actual_others_score), 2
        )
    return AllocationOutcome(
        mechanism="Carbon-aware VCG allocation",
        selected_indices=selected,
        capacity_gpu_hours=capacity_gpu_hours,
        payments_score_units=payments,
        carbon_penalty_per_kg_co2e=carbon_penalty_per_kg_co2e,
    )


def fcfs_allocation(
    teams: Sequence[Team],
    arrival_order: Sequence[int],
    capacity_gpu_hours: float = CAPACITY_GPU_HOURS,
) -> AllocationOutcome:
    """Serve full requests in a public arrival order; skip requests that do not fit."""

    remaining = capacity_gpu_hours
    selected: list[int] = []
    for index in arrival_order:
        if teams[index].demand_gpu_hours <= remaining:
            selected.append(index)
            remaining -= teams[index].demand_gpu_hours
    return AllocationOutcome(
        mechanism="Random-order FCFS",
        selected_indices=tuple(selected),
        capacity_gpu_hours=capacity_gpu_hours,
        payments_score_units={},
    )


def team_utility(team: Team, outcome: AllocationOutcome, index: int) -> float:
    """True value minus own carbon penalty minus payment if selected, else 0."""

    if index not in outcome.selected_indices:
        return 0.0
    return (
        true_score(team, outcome.carbon_penalty_per_kg_co2e)
        - outcome.payments_score_units.get(index, 0.0)
    )


def misreport_sweep(
    teams: Sequence[Team],
    index: int,
    reports: Iterable[float],
    capacity_gpu_hours: float = CAPACITY_GPU_HOURS,
    carbon_penalty_per_kg_co2e: float = CARBON_PENALTY_PER_KG_CO2E,
) -> list[dict[str, object]]:
    """Re-run VCG with one team's report changed; everything else stays fixed.

    DSIC holds for this team and these rivals when no row's utility exceeds the
    utility of the truthful row (report == true_value).
    """

    rows: list[dict[str, object]] = []
    for report in reports:
        changed = list(teams)
        changed[index] = Team(
            teams[index].name,
            teams[index].demand_gpu_hours,
            teams[index].true_value,
            report,
        )
        outcome = vcg_allocation(
            changed, capacity_gpu_hours, carbon_penalty_per_kg_co2e
        )
        payment = outcome.payments_score_units.get(index, 0.0)
        rows.append(
            {
                "team": teams[index].name,
                "true_value": teams[index].true_value,
                "report": report,
                "truthful": report == teams[index].true_value,
                "selected": index in outcome.selected_indices,
                "payment_score_units": payment,
                "utility_score_units": round(
                    team_utility(changed[index], outcome, index), 2
                ),
            }
        )
    return rows


def fcfs_all_orders(
    teams: Sequence[Team], capacity_gpu_hours: float = CAPACITY_GPU_HOURS
) -> list[dict[str, object]]:
    """FCFS outcome for every possible arrival order (6! = 720), so no seed is needed."""

    rows = []
    for order in permutations(range(len(teams))):
        metrics = outcome_metrics(
            teams, fcfs_allocation(teams, order, capacity_gpu_hours)
        )
        metrics["arrival_order"] = " -> ".join(teams[i].name for i in order)
        rows.append(metrics)
    return rows


def summarize_fcfs_orders(
    teams: Sequence[Team], rows: Sequence[dict[str, object]]
) -> dict[str, object]:
    """Mean and range of each FCFS metric, and each team's chance of being served."""

    summary: dict[str, object] = {"orders": len(rows)}
    for key in (
        "teams_served",
        "gpu_hours_used",
        "total_true_project_value",
        "carbon_adjusted_true_score",
        "total_estimated_emissions_kg_co2e",
    ):
        values = [float(row[key]) for row in rows]
        summary[key] = {
            "mean": round(mean(values), 2),
            "min": min(values),
            "max": max(values),
        }
    summary["service_probability"] = {
        team.name: round(
            sum(team.name in str(row["selected_teams"]).split("; ") for row in rows)
            / len(rows),
            3,
        )
        for team in teams
    }
    return summary


def team_rows(teams: Sequence[Team], outcome: AllocationOutcome) -> list[dict[str, object]]:
    """One transparent calculation row per team."""

    selected = set(outcome.selected_indices)
    rows: list[dict[str, object]] = []
    for index, team in enumerate(teams):
        served = index in selected
        payment_units = outcome.payments_score_units.get(index, 0.0)
        rows.append(
            {
                "team": team.name,
                "gpu_hours_requested": team.demand_gpu_hours,
                "true_value": team.true_value,
                "reported_value": team.reported_value,
                "estimated_emissions_kg_co2e": round(team.emissions_kg_co2e, 2),
                "reported_score": round(
                    reported_score(team, outcome.carbon_penalty_per_kg_co2e), 2
                ),
                "selected": served,
                "gpu_hours_allocated": team.demand_gpu_hours if served else 0.0,
                "priority_payment_score_units": payment_units if served else 0.0,
                "priority_payment_credits": round(
                    payment_units * PRIORITY_CREDITS_PER_SCORE_UNIT, 2
                )
                if served
                else 0.0,
                "utility_score_units": round(
                    team_utility(team, outcome, index), 2
                ),
            }
        )
    return rows


def outcome_metrics(teams: Sequence[Team], outcome: AllocationOutcome) -> dict[str, object]:
    selected = outcome.selected_indices
    allocated = total_demand(teams, selected)
    emissions = sum(teams[index].emissions_kg_co2e for index in selected)
    true_value = sum(teams[index].true_value for index in selected)
    true_score = total_true_score(
        teams, selected, outcome.carbon_penalty_per_kg_co2e
    )
    total_payment = sum(outcome.payments_score_units.values())
    return {
        "mechanism": outcome.mechanism,
        "selected_teams": "; ".join(teams[index].name for index in selected),
        "teams_served": len(selected),
        "gpu_hours_used": round(allocated, 2),
        "unused_gpu_hours": round(outcome.capacity_gpu_hours - allocated, 2),
        "total_true_project_value": round(true_value, 2),
        "carbon_adjusted_true_score": round(true_score, 2),
        "total_estimated_emissions_kg_co2e": round(emissions, 2),
        "total_priority_payment_score_units": round(total_payment, 2),
        "total_priority_payment_credits": round(
            total_payment * PRIORITY_CREDITS_PER_SCORE_UNIT, 2
        ),
        "carbon_penalty_per_kg_co2e": outcome.carbon_penalty_per_kg_co2e,
    }


def default_example() -> tuple[list[Team], tuple[int, ...]]:
    """Fixed six-team example using the project's Low/Medium/High value tiers."""

    teams = [
        Team("Team A", 25, true_value=9, reported_value=9),   # High
        Team("Team B", 20, true_value=6, reported_value=6),   # Medium
        Team("Team C", 15, true_value=3, reported_value=3),   # Low
        Team("Team D", 25, true_value=9, reported_value=9),   # High
        Team("Team E", 20, true_value=6, reported_value=6),   # Medium
        Team("Team F", 15, true_value=3, reported_value=3),   # Low
    ]
    # One illustrative draw of the random order; fcfs_all_orders covers all 720 orders.
    arrival_order = (0, 1, 4, 2, 3, 5)
    return teams, arrival_order
