---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-07-14T00:00:00Z"
title: Discovery call — Acme Logistics
date: "2026-07-14"
meeting_type: discovery
attendees:
  - Dana Reyes (VP Supply Chain, Acme)
  - Two of Dana's ops leads (didn't catch names — "Marcus" and someone on the bridge)
  - AE (us)
  - SE (us)
---

discovery call notes — messy, cleaned up later maybe

## situation

- ~1400 loads/wk. brokerage + asset-light. midwest/southeast
- status lives in: TMS + 2 carrier portals + a shared inbox + homegrown carrier
  scorecard thing (excel + access db??). nobody has the whole picture
- ops team ~40 ppl. Dana: "they spend the morning just figuring out what broke
  overnight"
- did a pilot w/ FreightWatch ~18mo ago. 3 months. never went to prod. TMS
  integration stalled + champion (person before Dana) left. Dana inherited the
  mess
- so they're gun-shy. "we bought this once already"

## what they want

- ONE exception queue. Dana said this like 4 times
- carrier onboarding is slow — didn't get a number today, follow up. sounded
  like weeks
- Dana does NOT want her team running an implementation. this is the whole thing.
  "if my people have to build it, we're not doing it"

## budget / timing

- budget: Dana threw out "~350k?" for the whole thing but said finance hasn't
  blessed anything. very soft number
- timing: wants live before peak. peak starts ~mid nov for them. so... sept
  start? tight
- Dana flagged the CFO (Pat Morgan) will be "a problem" on the services cost

## environment

- TMS: it's [mid-market TMS on our pre-built list] — good, connector exists
- NetSuite for finance
- EDI via a VAN
- carrier scorecard = custom. would need a connector build. Dana thinks it's
  important, ops leads weren't sure it's needed day 1

## next

- SE to do a technical deep dive w/ their IT (haven't met IT yet)
- send Midwest Freight case study — same industry, same onboarding pain
- Dana wants a rough SOW shape + number to take to Pat
