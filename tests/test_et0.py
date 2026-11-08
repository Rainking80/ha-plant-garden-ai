"""ET₀ against the worked examples of FAO Irrigation and Drainage Paper 56."""

from __future__ import annotations

from datetime import date

import pytest

from custom_components.plant_garden.et0 import (
    DayInput,
    actual_vapour_pressure,
    extraterrestrial_radiation,
    hargreaves,
    penman_monteith,
    pressure,
    psychrometric_constant,
    radiation_from_temperature,
    reference_et0,
    saturation_vapour_pressure,
    slope_vapour_pressure,
    wind_at_2m,
)


def test_example_2_pressure_and_gamma() -> None:
    assert pressure(1800) == pytest.approx(81.8, abs=0.05)
    assert psychrometric_constant(1800) == pytest.approx(0.054, abs=0.0005)


def test_example_3_saturation_vapour_pressure() -> None:
    assert saturation_vapour_pressure(24.5) == pytest.approx(3.075, abs=0.001)
    assert saturation_vapour_pressure(15) == pytest.approx(1.705, abs=0.001)


def test_example_5_actual_vapour_pressure() -> None:
    d = DayInput(day=date(2026, 7, 1), t_max=25, t_min=18, rh_max=82, rh_min=54)
    # FAO example 5: Tmin 18 °C / RHmax 82 %, Tmax 25 °C / RHmin 54 % -> ea = 1.70 kPa
    assert actual_vapour_pressure(d) == pytest.approx(1.70, abs=0.01)
    assert actual_vapour_pressure(DayInput(day=d.day, t_max=25, t_min=18, dewpoint=17)) == (
        pytest.approx(1.938, abs=0.001)
    )
    assert actual_vapour_pressure(DayInput(day=d.day, t_max=25, t_min=18, rh_mean=68)) == (
        pytest.approx(0.68 * (3.168 + 2.064) / 2, abs=0.01)
    )
    assert actual_vapour_pressure(DayInput(day=d.day, t_max=25, t_min=18)) is None


def test_examples_8_and_9_radiation_and_daylight() -> None:
    # 3 September at 20° S
    ra, hours = extraterrestrial_radiation(-20, date(2026, 9, 3))
    assert ra == pytest.approx(32.2, abs=0.1)
    assert hours == pytest.approx(11.7, abs=0.1)


def test_example_14_wind_to_2m() -> None:
    assert wind_at_2m(3.2, 10) == pytest.approx(2.4, abs=0.01)


def test_radiation_from_temperature() -> None:
    # interior location, Tmax 26.6 °C, Tmin 14.8 °C, Ra 40.6 MJ/m²
    assert radiation_from_temperature(26.6, 14.8, 40.6) == pytest.approx(22.3, abs=0.05)


def test_example_18_penman_monteith_brussels() -> None:
    """6 July in Brussels (50°48' N, 100 m): ET₀ = 3.9 mm/day."""
    d = DayInput(
        day=date(2026, 7, 6),
        t_max=21.5,
        t_min=12.3,
        rh_max=84,
        rh_min=63,
        wind_2m=wind_at_2m(10 / 3.6, 10),
        solar_mj=22.07,
    )
    assert slope_vapour_pressure(16.9) == pytest.approx(0.122, abs=0.001)
    assert d.wind_2m == pytest.approx(2.078, abs=0.001)
    assert penman_monteith(d, 50.8, 100) == pytest.approx(3.9, abs=0.05)
    assert reference_et0(d, 50.8, 100)[1] == "penman_monteith"


def test_fallbacks() -> None:
    temps = DayInput(day=date(2026, 7, 6), t_max=21.5, t_min=12.3)
    hs = hargreaves(temps, 50.8)
    assert 3.5 < hs < 4.5  # same order as Penman-Monteith for that day
    assert reference_et0(temps, 50.8, 100) == (hs, "hargreaves")
    # Penman-Monteith with only humidity known estimates wind and radiation
    partial = DayInput(day=temps.day, t_max=21.5, t_min=12.3, rh_mean=75)
    assert 2.5 < penman_monteith(partial, 50.8, 100) < 5
    # without humidity data the dew point is taken as Tmin
    assert penman_monteith(temps, 50.8, 100) > 0
    # winter: never negative
    cold = DayInput(day=date(2026, 12, 21), t_max=1, t_min=-6, rh_mean=95, wind_2m=0.5)
    assert penman_monteith(cold, 60, 0) >= 0
