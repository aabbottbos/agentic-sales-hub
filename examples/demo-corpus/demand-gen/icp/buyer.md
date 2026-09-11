---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-02-10T00:00:00Z"
title: ICP — buyer
roles:
  - role_title: VP / Director of Supply Chain (or Operations)
    priorities:
      - Fewer fire drills — get the ops team off status-chasing and onto exception resolution
      - A defensible answer to "where is this order" for their internal customers
      - Hitting on-time-ship and on-time-delivery SLAs without adding headcount
    objections:
      - "We tried a visibility tool and it never got integrated."
      - "My team doesn't have time to run another implementation."
      - "How is this different from the reporting my TMS already has?"
  - role_title: CFO / VP Finance (economic buyer on deals with a services SOW)
    priorities:
      - Clear, capped cost — a not-to-exceed, not an open-ended consulting spend
      - A payback story versus the alternative (usually "hire 2 more analysts")
      - No surprise change orders after signature
    objections:
      - "Why is the services engagement almost as much as the software?"
      - "What stops this from turning into a time-and-materials money pit?"
      - "We can just hire analysts."
  - role_title: Director of IT / Enterprise Applications (technical evaluator)
    priorities:
      - Integration that doesn't become their team's problem
      - Not another system to babysit; SSO, sane API, predictable load
      - A written integration design they can review before anything is built
    objections:
      - "Our NetSuite instance is heavily customized; your connector won't just work."
      - "We don't have capacity to support your integration team."
      - "Who owns the custom connectors after go-live?"
---

# ICP — buyer

## The three people in the room

1. **VP/Director of Supply Chain** — the champion. Feels the status-chasing pain
   daily. Sells the internal story. Won by the exception queue and by references
   who had the same pain (`../../org/evidence/cs-midwest-freight.md`).
2. **CFO** — the economic buyer whenever there's a services SOW, which is every
   deal above $150k. Skeptical of the services line. Won by the fixed
   not-to-exceed, the change-order discipline, and a payback story versus
   headcount (`../../org/evidence/cs-cascade-retail.md`).
3. **Director of IT** — the technical gate. Has been burned by "it just
   integrates." Won by the written integration design that they sign off on
   before any build, and by a clear answer on custom-connector ownership.

## The pattern to watch

The champion and the CFO often **disagree about the services scope**. The
champion wants everything done; the CFO wants it lean. The right move is to
scope services to prove value fast (Cascade), not to maximize the engagement.
