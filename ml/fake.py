"""Fictitious identities: names, phones and tokens. Fixed seed, never real data.

Names are random combinations of common Peruvian first names and surnames.
Phones use the +51 000 prefix, which is not assigned to any real line.
"""
from __future__ import annotations

import numpy as np

FIRST_F = [
    "Rosa", "Carmen", "María", "Lucía", "Ana", "Juana", "Elena", "Sofía", "Valeria", "Camila",
    "Gabriela", "Patricia", "Milagros", "Gloria", "Teresa", "Julia", "Isabel", "Fiorella", "Daniela", "Andrea",
    "Silvia", "Norma", "Flor", "Yolanda", "Marisol", "Pilar", "Ximena", "Luz", "Nancy", "Ruth",
]
FIRST_M = [
    "Jorge", "Luis", "Carlos", "José", "Miguel", "Juan", "Pedro", "Víctor", "César", "Raúl",
    "Diego", "Sebastián", "Mateo", "Alonso", "Renato", "Fernando", "Óscar", "Julio", "Hugo", "Manuel",
    "Walter", "Ricardo", "Javier", "Eduardo", "Martín", "Santiago", "Gonzalo", "Héctor", "Andrés", "Rubén",
]
SURNAMES = [
    "Quispe", "Flores", "Sánchez", "García", "Rodríguez", "Huamán", "Mendoza", "Rojas", "Vásquez", "Chávez",
    "Ramírez", "Torres", "Castillo", "Díaz", "Espinoza", "Gutiérrez", "López", "Pérez", "Mamani", "Ramos",
    "Cruz", "Gonzales", "Vargas", "Silva", "Romero", "Fernández", "Morales", "Ortiz", "Salazar", "Herrera",
    "Condori", "Paredes", "Cáceres", "Aguilar", "Medina", "Palacios", "Ccahuana", "Rivera", "Navarro", "Tello",
]
CAREGIVER_RELATION = ["madre", "padre", "abuela", "tía"]
PHONE_PATTERN = r"^\+51 000 \d{3} \d{3}$"
TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


class Faker:
    def __init__(self, seed: int):
        self.rng = np.random.default_rng(seed)
        self._phones: set[str] = set()
        self._tokens: set[str] = set()

    def first(self, female: bool) -> str:
        return str(self.rng.choice(FIRST_F if female else FIRST_M))

    def surname(self) -> str:
        return str(self.rng.choice(SURNAMES))

    def full_name(self, female: bool, first: str | None = None, surname: str | None = None) -> tuple[str, str, str]:
        """Returns (full name, first name, first surname)."""
        first = first or self.first(female)
        s1 = surname or self.surname()
        s2 = self.surname()
        while s2 == s1:
            s2 = self.surname()
        return f"{first} {s1} {s2}", first, s1

    def phone(self) -> str:
        while True:
            p = f"+51 000 {self.rng.integers(0, 1000):03d} {self.rng.integers(0, 1000):03d}"
            if p not in self._phones:
                self._phones.add(p)
                return p

    def token(self, n: int = 8) -> str:
        while True:
            t = "".join(self.rng.choice(list(TOKEN_ALPHABET), n))
            if t not in self._tokens:
                self._tokens.add(t)
                return t

    def reserve_token(self, t: str) -> str:
        self._tokens.add(t)
        return t

    def caregiver(self, child_surname: str) -> tuple[str, str]:
        rel = str(self.rng.choice(CAREGIVER_RELATION))
        female = rel in ("madre", "abuela", "tía")
        name, _, _ = self.full_name(female, surname=child_surname)
        return name, rel
