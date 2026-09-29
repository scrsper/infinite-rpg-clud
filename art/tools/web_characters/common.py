"""Shared conventions for the browser-client character kit.

Metres, Z up, the figure faces -Y, +X is the figure's left (Blender's own convention; the glTF
exporter turns this into Y-up with the figure facing +Z, and the client turns the model around to
the simulation's -Z forward). One skeleton layout serves every build; only the rest positions differ.

Nothing here comes from a third-party asset. Every measurement is a proportion chosen for this
project's stylised-realistic figures and can be read straight off `Dims`.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

TAU = math.pi * 2
HERE = os.path.dirname(os.path.abspath(__file__))
# The Ashford garment toolkit's loft/ribbon/weight helpers are project code; reuse them, do not fork them.
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'ashford_garments'))


class Dims:
    """Body proportions for one build. `sex` is 'f' | 'm' | 'c' (child)."""

    def __init__(self, sex='f', height=None):
        self.sex = sex
        base = {'f': 1.66, 'm': 1.78, 'c': 1.22}[sex]
        self.height = height or base
        k = self.height / base
        f = sex == 'f'
        c = sex == 'c'
        H = self.height
        # Landmarks as fractions of standing height, then scaled. (Standard figure canon, lightly stylised: a slightly longer leg.)
        self.ankle = 0.052 * H
        self.knee = 0.285 * H
        self.hip = 0.520 * H          # hip joint height
        self.pelvis = 0.545 * H
        self.waist = 0.625 * H
        self.chest = 0.725 * H        # mid chest
        self.shoulder_z = 0.818 * H
        self.neck_base = 0.845 * H
        self.neck_top = 0.900 * H
        self.head_c = 0.936 * H
        self.head_h = (0.128 if not c else 0.150) * H      # crown to chin
        self.head_w = (0.092 if not c else 0.100) * H * (0.93 if f else 1.0)
        self.head_d = (0.112 if not c else 0.120) * H * (0.96 if f else 1.0)
        # Widths (half-widths, metres).
        self.shoulder_x = (0.104 if f else 0.114) * H if not c else 0.092 * H
        self.hip_x = (0.050 if not c else 0.046) * H
        self.chest_rx = (0.078 if f else 0.092) * H if not c else 0.070 * H
        self.chest_ry = (0.052 if f else 0.058) * H if not c else 0.050 * H
        self.waist_rx = (0.060 if f else 0.078) * H if not c else 0.062 * H
        self.waist_ry = (0.046 if f else 0.056) * H if not c else 0.050 * H
        self.hips_rx = (0.098 if f else 0.090) * H if not c else 0.072 * H
        self.hips_ry = (0.060 if f else 0.058) * H if not c else 0.054 * H
        self.arm_len = 0.44 * H
        self.k = k


def mkdir(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a) if b != a else 0.0))
    return t * t * (3 - 2 * t)


def gauss(x, s):
    return math.exp(-(x * x) / (2 * s * s))
