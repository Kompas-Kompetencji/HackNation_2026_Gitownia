# Prośby do backendu (od frontendu)

Stan na 21 listopada 2026. Sprawdzone na gałęzi `feature/wspolne-klejenie` (commit `7df87ca`,
„SKLEJONE ALEX + OLIVER”), uruchomionej lokalnie bez kluczy do modeli językowych.
Frontend niczego w backendzie nie zmieniał; różnice wyrównuje `frontend/src/lib/api.ts`.
Szczegóły mapowania: [spiecie-z-backendem.md](spiecie-z-backendem.md).

Priorytety: **P1** blokuje prawdziwą ścieżkę oceny, **P2** psuje jakość danych,
**P3** porządki (frontend sobie radzi, ale z obejściem).

---

## 0. Gałąź `main` nie zawiera kodu backendu (P1)

Na `main` katalog `backend` jest odnośnikiem do podmodułu (`160000 commit 1e9879a…`), ale
w repozytorium nie ma pliku `.gitmodules`, a tego commita nie ma na żadnej gałęzi. Po `git clone`
katalog jest pusty. Kod backendu jest na `feature/backend-m1-rules-engine` i
`feature/wspolne-klejenie`.

Prośba: scalić backend do `main` jako zwykły katalog (bez podmodułu).

## 1. Wskazówka poziomu dla jednego kryterium: `POST /api/v1/calculate-score` (P1)

Dziś frontend liczy wskazówkę przez `POST /evaluations/evaluate`, wysyłając każdy wskaźnik jako
„ocenę cząstkową” i odrzucając błędy o kryteriach obowiązkowych. Działa, ale to obejście, a reguła
zaokrąglania jest inna niż zakładana (patrz niżej).

Żądanie:

```json
{
  "answers": [
    { "competency_id": "C01", "indicator_id": "C01_I01", "selected_level": 7, "star_note": null },
    { "competency_id": "C01", "indicator_id": "C01_I02", "selected_level": null, "star_note": null }
  ]
}
```

`selected_level: null` = „brak podstaw do oceny” (nie wchodzi do średniej).

Odpowiedź 200:

```json
{ "mean": 7.0, "suggested_level": 7, "counted_indicators": 1 }
```

Gdy wszystkie wskaźniki mają `null`: `{ "mean": null, "suggested_level": null, "counted_indicators": 0 }`.
Poziom spoza 1/3/5/7/9: **HTTP 422** z `{"detail": "Niedozwolony poziom …"}`.

**Do ustalenia: zaokrąglanie remisów.** Progi z § 11 ust. 1 pkt 2 (użyte w obejściu) dają przy
średniej dokładnie 2, 4, 6, 8 poziom niższy (np. wskaźniki 3 i 5 → średnia 4 → poziom 3).
Makieta frontendu zaokrąglała do najbliższego poziomu w górę (4 → 5). Proszę zdecydować, która
reguła obowiązuje dla wskazówki na poziomie kryterium, i wpisać ją w backend.

## 2. Analiza opisu stanowiska `POST /api/v1/osp/parse` (P1/P2)

1. **P1: `stanowisko_pracy` zwraca nagłówek tabeli** `"NAZWA STANOWISKA PRACY"` dla wszystkich
   trzech przykładowych plików (starszy specjalista, radca, naczelnik wydziału). Frontend bierze
   wtedy nazwę z nazwy pliku, ale to zgadywanie. Proszę zwracać treść komórki pod nagłówkiem.
2. **P2: kryteria dodatkowe.** Uzgodnione było „trzy sugerowane kryteria dodatkowe z uzasadnieniem”.
   Backend zwraca tylko `kompetencje_miekkie_z_osp` (pkt 13 OSP), które w większości pokrywają się
   z kryteriami obowiązkowymi. Po odjęciu obowiązkowych zostaje 0–1 kryterium (radca: 0). Prośba
   o nowe pole (bez zmiany istniejących):

   ```json
   "sugerowane_kryteria_dodatkowe": [
     { "competency_id": 7, "name": "Myślenie analityczne",
       "uzasadnienie": "Zadanie 1: analizuje i ocenia prawo krajowe i unijne …" }
   ]
   ```

   Maksymalnie 3, bez kryteriów obowiązkowych zalecanego arkusza, `competency_id` jak w
   `/competencies` (1–14), `uzasadnienie` = fragment OSP (zadania lub pkt 13), z którego wynika
   propozycja.
3. **P2: liczba podległych pracowników jako liczba.** Dziś jest tylko tekst opcji
   (`"bezpośrednio kieruje lub koordynuje pracę od 5 do 9 pracowników"`). Prośba o pola:

   ```json
   "liczba_podleglych_min": 5,
   "liczba_podleglych_max": 9
   ```

   (`0`/`0` przy „brak podległych”, `null`, gdy nic nie zaznaczono). Frontend dziś wpisuje `0` przy
   „brak”, a przy przedziale zostawia pole puste do uzupełnienia przez przełożonego.
4. P3: zły plik (nie .docx) daje **422** z `detail` — tak zostaje, frontend to obsługuje.

## 3. Szablon arkusza: limit kryteriów dodatkowych (P3)

Kryteria obowiązkowe frontend bierze z `GET /competencies?form_type=FORM_B|FORM_C`
(`is_mandatory_for_selected_form`) — działa. Brakuje limitu kryteriów dodatkowych
(`MAX_ADDITIONAL_CRITERIA_PERIODIC = 3` jest tylko w `config.py`), więc frontend ma go na sztywno.
Prośba o pole w odpowiedzi z `form_type`:

```json
"max_additional_criteria": 3
```

(oraz `0` dla `FIRST_EVAL_FORM`). Mile widziana też kolejność kryteriów obowiązkowych zgodna z
arkuszem (dziś kolejność modelu: Rzetelność, Komunikacja, …; w arkuszu C pierwsze jest
Wykorzystywanie wiedzy).

## 4. Asystent `POST /api/v1/ai-assistant` (P2)

Most zgodności działa (`mode`, `status`, `answer`, `sources` — kształt jak we frontendzie). Uwagi:

1. **Odpowiedź jest ucinana w połowie słowa** (ok. 300 znaków, np. `„…od sporządzenia poprzedniej
   oceny lub zatru”`), a potem doklejane jest `(Podstawa: …)`. Proszę zwracać całe zdania; źródło
   tylko w `sources` (frontend usuwa doklejone `(Podstawa: …)`, ale to obejście).
2. Przy braku kluczy do modelu wyszukiwanie zwraca fragment niezwiązany z pytaniem (pytanie o termin
   rozmowy oceniającej → odpowiedź o liczbie kryteriów dodatkowych). Jeśli trafność jest niska,
   lepiej `status: "no_data"`.
3. **Tryb `interview` nie zna stanu oceny.** Most wywołuje asystenta rozmowy z pustym
   `FormSchemaState`, więc zawsze odpowiada „Formularz jest jeszcze niekompletny…”, także po
   ocenieniu wszystkich kryteriów. Prośba: przyjmować opcjonalny kontekst w tym samym żądaniu:

   ```json
   {
     "question": "Przygotuj rozmowę oceniającą na podstawie decyzji",
     "mode": "interview",
     "context": {
       "form": "C",
       "decisions": [ { "competency_id": "C01", "is_mandatory": true, "selected_level": 7 } ],
       "star_notes": { "C01_I01": "Sytuacja: … Działanie: … Rezultat: …" }
     }
   }
   ```

   (bez danych osobowych; `form`: `"B" | "C" | "first"`). Frontend dopisze `context`, gdy trasa go
   przyjmie (wymaga też małej zmiany po stronie frontendu: przekazania kontekstu z formularza).
4. W trybie `interview` źródło jest stałe (zawsze ten sam poradnik i pierwsze pytanie z listy).
   Jeśli to nie cytat z dokumentu, lepiej zwracać `sources: []`.
5. Odpowiedzi zawierają Markdown (`**pogrubienie**`); frontend pokazuje zwykły tekst i usuwa `**`.
   Prośba o zwykły tekst.

## 5. Wynik oceny `POST /api/v1/evaluations/evaluate` (P3)

Działa i jest podłączony. Drobne:

1. Błędy formalne (`errors`) przychodzą z kodem **200**. Frontend je pokazuje, więc może tak zostać;
   proszę tylko potwierdzić, że to celowe (a 422 tylko przy złym kształcie JSON).
2. Liczby w `powody_werdyktu` mają kropkę (`5.25 pkt`); w tekście po polsku powinien być przecinek
   (`5,25 pkt`).
3. **„Brak podstaw do oceny”** na poziomie kryterium: `CriterionScore.score` jest wymagane, więc
   kryterium bez oceny nie da się wysłać. Frontend nie wysyła kryteriów bez decyzji i blokuje
   zakończenie oceny. Proszę potwierdzić, że tak ma być (rozporządzenie nie przewiduje „brak
   podstaw” dla całego kryterium). Na poziomie wskaźnika frontend oznacza to `selected_level: null`
   (tak samo jak `scores: {nazwa: null}` w `FormSchemaState`).

## 6. Dane, których backend nie ma (P1 dla pełnej ścieżki)

Backend jest bezstanowy, więc te funkcje frontendu działają tylko na makietach. Proponowane trasy
(kształty = typy z `frontend/src/types/index.ts`, nazwy pól snake_case po angielsku):

| Funkcja frontendu | Trasa | Odpowiedź |
|---|---|---|
| `listDemoUsers()` | `GET /auth/demo-users` | `User[]` |
| `getUser(id)` | `GET /users/{id}` | `User` |
| `listEmployees()` | `GET /employees` (pracownicy zalogowanego przełożonego) | `Employee[]` |
| `getEmployee(id)` | `GET /employees/{id}` | `Employee`; 404 gdy brak, 403 gdy cudzy |
| `createEmployee(data)` | `POST /employees` | `Employee` (termin i status wylicza backend) |
| `listNotes(id)` / `addNote(id, text)` | `GET/POST /employees/{id}/notes` | `Note[]` / `Note` |
| `listJobDescriptions(id)` | `GET /employees/{id}/job-descriptions` | `JobDescriptionDocument[]` |
| `attachJobDescription(id, file, analysis?)` | `POST /employees/{id}/job-descriptions` (multipart: `file`, `confirmed_analysis` jako JSON) | `JobDescriptionDocument` |
| `listAssessments(filters)` | `GET /assessments?employee_id=&status=` | `AssessmentSummary[]` |
| `getAssessment(id)` | `GET /assessments/{id}` | `AssessmentDetail`; 404/403 |
| `createAssessmentDraft(input)` | `POST /assessments` | `AssessmentSummary` |
| `saveAssessmentDraft(id, input)` | `PUT /assessments/{id}/draft` | `AssessmentDetail`; 409 gdy zakończona |
| `completeAssessment(id, input)` | `POST /assessments/{id}/complete` | `AssessmentDetail` z `evaluation`; 422 gdy braki |

Przykład `Employee`:

```json
{
  "id": "emp-001", "supervisor_id": "sup-001",
  "first_name": "Joanna", "last_name": "Pietrzyk",
  "position_title": "Starszy specjalista", "organizational_unit": "Wydział Skarg i Wniosków",
  "hire_date": "2019-03-01", "contract_type": "indefinite", "contract_end_date": null,
  "assessment_kind": "periodic", "form": "C",
  "last_assessment_date": "2024-12-09", "last_assessment_result": "positive",
  "next_assessment_due": "2026-12-09", "status": "assessment_due_soon"
}
```

Użytkownika frontend wysyła dziś w nagłówku `X-User-Id` (logowanie demonstracyjne); backend go
ignoruje. Do ustalenia, czy tak zostaje do końca hackathonu.

Gdy powstanie `GET /assessments/{id}`, przyda się też `GET /assessments/{id}/pdf` (backend sam
składa `EvaluationRequest`). Do tego czasu frontend wysyła pełny stan do `POST /evaluations/pdf`.

## 7. Terminy `POST /api/v1/deadlines/calculate` (P3)

Podłączone dla pierwszej oceny (`termin_rozmowy_wstepnej_max`, `termin_dokonania_oceny_min/max`).
Pytanie: w makiecie frontendu „okres pierwszej oceny” był ostatnim miesiącem przed końcem umowy;
backend daje od 8. miesiąca do miesiąca przed końcem umowy. Zakładamy, że backend ma rację.

## 8. CORS i adres (informacyjnie, bez zmian)

`allow_origins=["*"]` razem z `allow_credentials=True` działa w Starlette (odbija nagłówek
`Origin`), ale przy wdrożeniu lepiej podać konkretne adresy w `ALLOWED_ORIGINS`.
Frontend w trybie deweloperskim używa proxy Vite (`/api` → `http://localhost:8000`) i adresu
`/api/v1`, więc CORS nie jest mu potrzebny.
