"""Reference evapotranspiration ET₀ after FAO Irrigation and Drainage Paper 56.

Daily values. Equation numbers refer to FAO-56 (Allen et al. 1998). Used when a
weather source does not deliver ET₀ itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import math

SOLAR_CONSTANT = 0.0820  # MJ m⁻² min⁻¹
STEFAN_BOLTZMANN = 4.903e-9  # MJ K⁻⁴ m⁻² day⁻¹
KRS_INTERIOR = 0.16  # Hargreaves radiation adjustment, interior locations (eq. 50)


def pressure(elevation_m: float) -> float:
    """Atmospheric pressure in kPa (eq. 7)."""
    return float(101.3 * ((293 - 0.0065 * elevation_m) / 293) ** 5.26)


def psychrometric_constant(elevation_m: float) -> float:
    """Psychrometric constant gamma in kPa °C⁻¹ (eq. 8)."""
    return 0.000665 * pressure(elevation_m)


def saturation_vapour_pressure(t: float) -> float:
    """e°(T) in kPa (eq. 11)."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def slope_vapour_pressure(t: float) -> float:
    """Δ in kPa °C⁻¹ (eq. 13)."""
    return 4098 * saturation_vapour_pressure(t) / (t + 237.3) ** 2


def wind_at_2m(speed: float, height_m: float = 10) -> float:
    """Wind speed measured at another height, converted to 2 m (eq. 47)."""
    return speed * 4.87 / math.log(67.8 * height_m - 5.42)


def extraterrestrial_radiation(latitude: float, day: date) -> tuple[float, float]:
    """Ra in MJ m⁻² day⁻¹ and daylight hours N (eqs. 21 to 25, 34)."""
    j = day.timetuple().tm_yday
    phi = math.radians(latitude)
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    decl = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(decl))))
    ra = (
        24
        * 60
        / math.pi
        * SOLAR_CONSTANT
        * dr
        * (ws * math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.sin(ws))
    )
    return ra, 24 / math.pi * ws


def radiation_from_temperature(t_max: float, t_min: float, ra: float) -> float:
    """Rs estimated from the temperature range, interior location (eq. 50)."""
    return KRS_INTERIOR * math.sqrt(max(t_max - t_min, 0)) * ra


@dataclass(slots=True, frozen=True)
class DayInput:
    """What is known about one day. Missing values are None."""

    day: date
    t_max: float
    t_min: float
    rh_max: float | None = None
    rh_min: float | None = None
    rh_mean: float | None = None
    dewpoint: float | None = None
    wind_2m: float | None = None  # m/s at 2 m
    solar_mj: float | None = None  # Rs, MJ m⁻² day⁻¹


def actual_vapour_pressure(d: DayInput) -> float | None:
    """ea in kPa from the best available humidity value (eqs. 14, 17, 19)."""
    if d.dewpoint is not None:
        return saturation_vapour_pressure(d.dewpoint)
    if d.rh_max is not None and d.rh_min is not None:
        return (
            saturation_vapour_pressure(d.t_min) * d.rh_max / 100
            + saturation_vapour_pressure(d.t_max) * d.rh_min / 100
        ) / 2
    if d.rh_mean is not None:
        es = (saturation_vapour_pressure(d.t_max) + saturation_vapour_pressure(d.t_min)) / 2
        return d.rh_mean / 100 * es
    return None


def penman_monteith(d: DayInput, latitude: float, elevation_m: float) -> float:
    """FAO-56 Penman-Monteith reference ET₀ in mm/day (eq. 6, G = 0 for days).

    Missing humidity: dew point ≈ Tmin (eq. 48). Missing wind: 2 m/s (the world
    average FAO-56 recommends). Missing radiation: estimated from temperatures.
    """
    t_mean = (d.t_max + d.t_min) / 2
    ra, _ = extraterrestrial_radiation(latitude, d.day)
    rso = (0.75 + 2e-5 * elevation_m) * ra  # eq. 37
    rs = d.solar_mj if d.solar_mj is not None else radiation_from_temperature(d.t_max, d.t_min, ra)
    rs = min(rs, rso)
    es = (saturation_vapour_pressure(d.t_max) + saturation_vapour_pressure(d.t_min)) / 2
    ea = actual_vapour_pressure(d)
    if ea is None:
        ea = saturation_vapour_pressure(d.t_min)
    u2 = d.wind_2m if d.wind_2m is not None else 2.0
    rns = (1 - 0.23) * rs  # eq. 38
    relative_rs = rs / rso if rso > 0 else 0.0
    rnl = (
        STEFAN_BOLTZMANN
        * ((d.t_max + 273.16) ** 4 + (d.t_min + 273.16) ** 4)
        / 2
        * (0.34 - 0.14 * math.sqrt(max(ea, 0)))
        * (1.35 * relative_rs - 0.35)
    )  # eq. 39
    rn = rns - rnl
    delta = slope_vapour_pressure(t_mean)
    gamma = psychrometric_constant(elevation_m)
    et0 = (0.408 * delta * rn + gamma * 900 / (t_mean + 273) * u2 * (es - ea)) / (
        delta + gamma * (1 + 0.34 * u2)
    )
    return max(et0, 0.0)


def hargreaves(d: DayInput, latitude: float) -> float:
    """Hargreaves-Samani ET₀ in mm/day from temperatures only (eq. 52)."""
    ra, _ = extraterrestrial_radiation(latitude, d.day)
    t_mean = (d.t_max + d.t_min) / 2
    return max(0.0023 * (t_mean + 17.8) * math.sqrt(max(d.t_max - d.t_min, 0)) * 0.408 * ra, 0.0)


def reference_et0(d: DayInput, latitude: float, elevation_m: float) -> tuple[float, str]:
    """ET₀ with the best method the data allows: (mm/day, method)."""
    has_more = (
        d.solar_mj is not None or d.wind_2m is not None or (actual_vapour_pressure(d) is not None)
    )
    if has_more:
        return penman_monteith(d, latitude, elevation_m), "penman_monteith"
    return hargreaves(d, latitude), "hargreaves"
